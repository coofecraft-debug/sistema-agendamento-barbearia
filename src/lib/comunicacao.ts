import { createHash, randomBytes } from "node:crypto";
import { sql } from "@/db";
import { localTime, today } from "./time";
import { normalizedBrazilWhatsapp, type QuickReplyAction } from "./meta-template";

// Ações de uso único compartilhadas por links HTTPS e respostas rápidas verificadas da Meta.
type Connection = Pick<typeof sql, "unsafe">;
export type CommunicationAction = "confirmar" | "cancelar" | "gerenciar";
export const actionHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const validToken = (token: unknown): token is string => typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
export const isActive = (status: string) => ["Agendado", "Confirmado"].includes(status);

export async function cancelQueued(tx: Connection, id: string) {
  await tx.unsafe("UPDATE comunicacao_fila SET status='cancelado' WHERE agendamento_id=$1 AND status='pendente'", [id]);
  await tx.unsafe("UPDATE comunicacao_respostas SET status='cancelado' WHERE agendamento_id=$1 AND status='pendente'", [id]);
  await tx.unsafe("UPDATE comunicacao_tokens SET usado_em=now() WHERE agendamento_id=$1 AND usado_em IS NULL", [id]);
}

export async function scheduleMessages(tx: Connection, appointmentId: string) {
  // Called from the original booking transaction. A rollback rolls back the queue too.
  await cancelQueued(tx, appointmentId);
  const [v] = await tx.unsafe(
    "INSERT INTO comunicacao_versoes(agendamento_id,revisao) VALUES($1,1) ON CONFLICT(agendamento_id) DO UPDATE SET revisao=comunicacao_versoes.revisao+1 RETURNING revisao",
    [appointmentId],
  );
  const [a] = await tx.unsafe(`
    SELECT a.inicio,a.status,c.nome AS cliente,c.whatsapp,s.nome AS servico,
      p.nome AS profissional,co.autorizado
    FROM agendamentos a
    JOIN clientes c ON c.id=a.cliente_id
    JOIN servicos s ON s.id=a.servico_id
    JOIN profissionais p ON p.id=a.profissional_id
    LEFT JOIN comunicacao_consentimentos co ON co.agendamento_id=a.id
    WHERE a.id=$1`, [appointmentId]);
  if (!a || !a.autorizado || !isActive(a.status)) return;
  const [preferences] = await tx.unsafe(`SELECT p.bloqueado FROM comunicacao_preferencias p
    JOIN agendamentos a ON a.cliente_id=p.cliente_id JOIN clientes c ON c.id=a.cliente_id
    WHERE a.id=$1 AND p.whatsapp=black_whatsapp(c.whatsapp)`, [appointmentId]);
  if (preferences?.bloqueado) return;
  const start = new Date(a.inicio);
  if (start <= new Date()) return;
  const origin = process.env.APP_ORIGIN;
  if (!origin || !origin.startsWith("http")) throw new Error("APP_ORIGIN não configurada.");
  const tokens: Record<CommunicationAction,string> = { confirmar: "", cancelar: "", gerenciar: "" };
  for (const action of ["confirmar", "cancelar", "gerenciar"] as const) {
    const raw = randomBytes(32).toString("hex");
    tokens[action] = `${origin}/confirmar?token=${raw}`;
    await tx.unsafe("INSERT INTO comunicacao_tokens(hash,agendamento_id,revisao,acao,expira_em) VALUES($1,$2,$3,$4,$5)", [actionHash(raw),appointmentId,v.revisao,action,start.toISOString()]);
  }
  const details = `${a.servico} em ${today(start)} às ${localTime(start)} com ${a.profissional}`;
  const options = `Confirmar: ${tokens.confirmar}\nCancelar: ${tokens.cancelar}\nGerenciar: ${tokens.gerenciar}`;
  const now = new Date();
  const jobs = [
    { type:"confirmacao",when: now, message:`Barbearia Exemplo: sua reserva de ${details} foi registrada.\n${options}` },
    { type:"lembrete",when: new Date(start.getTime()-60*60*1000), message:`Barbearia Exemplo: seu atendimento de ${details} começa em 1 hora.\n${options}` },
  ];
  for (const job of jobs) {
    // If booking is less than one hour away, skip the already-due reminder.
    if (job.type === "lembrete" && job.when <= now) continue;
    await tx.unsafe(
      "INSERT INTO comunicacao_fila(agendamento_id,revisao,tipo,executar_em,conteudo) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
      [appointmentId,v.revisao,job.type,job.when.toISOString(),job.message],
    );
  }
}

export async function actionPreview(token: string) {
  if (!validToken(token)) return null;
  const [row] = await sql.unsafe(`SELECT t.acao,t.usado_em,t.expira_em,a.status,a.inicio,s.nome AS servico
    FROM comunicacao_tokens t JOIN agendamentos a ON a.id=t.agendamento_id
    JOIN servicos s ON s.id=a.servico_id
    JOIN comunicacao_versoes v ON v.agendamento_id=t.agendamento_id AND v.revisao=t.revisao
    WHERE t.hash=$1`,[actionHash(token)]);
  return row ? {
    acao: row.acao as CommunicationAction,
    valido: !row.usado_em && new Date(row.expira_em)>new Date() && isActive(row.status) && new Date(row.inicio)>new Date(),
    servico: row.servico as string,
    data: today(new Date(row.inicio)),
    horario: localTime(row.inicio),
  } : null;
}

export async function executeAction(
  token: string, requestedAction?: "confirmar" | "cancelar", metaSender?: string,
): Promise<"confirmado"|"cancelado"|"invalido"> {
  if (!validToken(token)) return "invalido";
  return sql.begin(async tx => {
    // The same lock used for admin and public bookings avoids races with rescheduling.
    await tx`SELECT pg_advisory_xact_lock(19442003)`;
    const [row] = await tx`SELECT t.*,a.inicio,a.status FROM comunicacao_tokens t
      JOIN agendamentos a ON a.id=t.agendamento_id
      JOIN comunicacao_versoes v ON v.agendamento_id=t.agendamento_id AND v.revisao=t.revisao
      WHERE t.hash=${actionHash(token)} FOR UPDATE OF t`;
    if (!row || row.usado_em || new Date(row.expira_em)<=new Date() || new Date(row.inicio)<=new Date() || !isActive(row.status)) return "invalido";
    const action = row.acao === "gerenciar" ? requestedAction : row.acao;
    if (!action) return "invalido";
    if (action === "confirmar") {
      await tx`UPDATE agendamentos SET status='Confirmado' WHERE id=${row.agendamento_id}`;
      await tx`UPDATE comunicacao_tokens SET usado_em=now() WHERE hash=${row.hash}`;
      // For signed Meta quick replies only: a durable, unique acknowledgment outbox.
      // This INSERT and the booking update are in the same transaction. Replayed
      // webhook events cannot insert or send another acknowledgment.
      if (metaSender) {
        await tx`INSERT INTO comunicacao_respostas(agendamento_id,revisao,whatsapp,expira_em)
          SELECT a.id,${row.revisao},${metaSender},LEAST(a.inicio,now()+interval '23 hours')
          FROM agendamentos a JOIN clientes c ON c.id=a.cliente_id
          JOIN comunicacao_consentimentos co ON co.agendamento_id=a.id
          LEFT JOIN comunicacao_preferencias p ON p.cliente_id=c.id AND p.whatsapp=black_whatsapp(c.whatsapp)
          WHERE a.id=${row.agendamento_id} AND a.status='Confirmado'
            AND co.autorizado=true AND NOT coalesce(p.bloqueado,false)
            AND black_whatsapp(c.whatsapp)=${metaSender}
            AND a.inicio>now() AND LEAST(a.inicio,now()+interval '23 hours')>now()
          ON CONFLICT (agendamento_id,revisao) DO NOTHING`;
      }
      return "confirmado";
    }
    if (action === "cancelar") {
      await tx`UPDATE agendamentos SET status='Cancelado' WHERE id=${row.agendamento_id}`;
      await cancelQueued(tx, row.agendamento_id);
      return "cancelado";
    }
    return "invalido";
  });
}

/**
 * A signed WhatsApp webhook is necessary but NOT sufficient: a quick reply
 * must also match the recipient's phone number, a sent message for this same
 * appointment revision, and the specific pre-generated one-use token.
 * No action is performed for unrelated or unverified inbound text.
 */
export async function executeMetaQuickReply(
  action: QuickReplyAction, token: string, sender: string, replyToMessageId: string | null,
  origin: "template" | "resposta" = "template",
): Promise<"confirmado"|"cancelado"|"invalido"> {
  if (!validToken(token) || !/^55[1-9]{2}9\d{8}$/.test(sender)) return "invalido";
  // The interactive acknowledgment can only cancel, and the context must point
  // to an actual acknowledgment Meta message for this same appointment revision.
  if (origin === "resposta" && (action !== "cancelar" || !replyToMessageId)) return "invalido";
  const [row] = origin === "resposta"
    ? await sql.unsafe(`SELECT c.whatsapp FROM comunicacao_tokens t
        JOIN agendamentos a ON a.id=t.agendamento_id
        JOIN clientes c ON c.id=a.cliente_id
        JOIN comunicacao_respostas r ON r.agendamento_id=t.agendamento_id
          AND r.revisao=t.revisao AND r.status='enviado' AND r.meta_message_id=$3
          AND r.whatsapp=black_whatsapp(c.whatsapp)
        WHERE t.hash=$1 AND t.acao=$2 LIMIT 1`, [actionHash(token), action, replyToMessageId])
    : await sql.unsafe(`SELECT c.whatsapp FROM comunicacao_tokens t
        JOIN agendamentos a ON a.id=t.agendamento_id
        JOIN clientes c ON c.id=a.cliente_id
        JOIN comunicacao_fila f ON f.agendamento_id=t.agendamento_id
          AND f.revisao=t.revisao AND f.status='enviado' AND f.meta_message_id IS NOT NULL
        WHERE t.hash=$1 AND t.acao=$2 AND ($3::text IS NULL OR f.meta_message_id=$3)
        LIMIT 1`, [actionHash(token), action, replyToMessageId]);
  if (!row) return "invalido";
  try { if (normalizedBrazilWhatsapp(row.whatsapp) !== sender) return "invalido"; }
  catch { return "invalido"; }
  // executeAction locks and atomically consumes the token / checks the current
  // booking revision, current status and expiration against the database.
  return executeAction(token, action, origin === "template" && action === "confirmar" ? sender : undefined);
}
