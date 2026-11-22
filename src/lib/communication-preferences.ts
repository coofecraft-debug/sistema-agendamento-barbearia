import type { sql } from "@/db";
import { normalizedBrazilWhatsapp } from "./meta-template";

type Connection = Pick<typeof sql, "unsafe">;
type Choice = { convites?: boolean; notificacoes?: boolean };

/** Consent belongs to this phone. Editing a customer's number never transfers it. */
export async function saveCommunicationPreferences(
  tx: Connection, clientId: number, phone: string, choice: Choice, origin: "admin" | "publico",
) {
  let canonical: string;
  try { canonical = normalizedBrazilWhatsapp(phone); }
  catch {
    if (choice.convites || choice.notificacoes) throw new Error("WHATSAPP_INVALID");
    await tx.unsafe("DELETE FROM comunicacao_preferencias WHERE cliente_id=$1", [clientId]);
    return;
  }
  await tx.unsafe(`INSERT INTO comunicacao_preferencias(cliente_id,whatsapp,convites,bloqueado,origem)
    VALUES($1,$2,coalesce($3::boolean,false),false,$5)
    ON CONFLICT(cliente_id) DO UPDATE SET
      convites=CASE WHEN comunicacao_preferencias.whatsapp<>$2 THEN coalesce($3::boolean,false)
        ELSE coalesce($3::boolean,comunicacao_preferencias.convites) END,
      bloqueado=CASE WHEN comunicacao_preferencias.whatsapp<>$2 OR $3=true OR $4=true
        THEN false ELSE comunicacao_preferencias.bloqueado END,
      whatsapp=$2, versao=comunicacao_preferencias.versao+1, origem=$5, atualizado_em=now()`,
    [clientId, canonical, choice.convites ?? null, choice.notificacoes ?? null, origin]);
  // Any outstanding invitation belongs to the previous consent version.
  await tx.unsafe("UPDATE comunicacao_convites SET status='cancelado' WHERE cliente_id=$1 AND status='pendente'", [clientId]);
}

export async function stopWhatsappMessages(
  tx: Connection, phone: string, kind: "all" | "convites", sentAt: Date,
) {
  const canonical = normalizedBrazilWhatsapp(phone);
  // An old webhook retry must not override a newer, explicit opt-in.
  const rows = await tx.unsafe(`INSERT INTO comunicacao_preferencias AS p
      (cliente_id,whatsapp,convites,bloqueado,origem,atualizado_em)
    SELECT id,$1,false,$2,'whatsapp',$3::timestamptz FROM clientes WHERE black_whatsapp(whatsapp)=$1
    ON CONFLICT(cliente_id) DO UPDATE SET convites=false,
      bloqueado=CASE WHEN $2 THEN true ELSE p.bloqueado END,
      versao=p.versao+1, origem='whatsapp', atualizado_em=$3::timestamptz
    WHERE p.whatsapp=$1 AND date_trunc('second',p.atualizado_em)<=$3::timestamptz
    RETURNING cliente_id`, [canonical, kind === "all", sentAt.toISOString()]);
  for (const row of rows) {
    await tx.unsafe("UPDATE comunicacao_convites SET status='cancelado' WHERE cliente_id=$1 AND status='pendente'", [row.cliente_id]);
    if (kind === "all") {
      await tx.unsafe(`UPDATE comunicacao_consentimentos co SET autorizado=false
        FROM agendamentos a WHERE a.id=co.agendamento_id AND a.cliente_id=$1`, [row.cliente_id]);
      await tx.unsafe(`UPDATE comunicacao_fila f SET status='cancelado'
        FROM agendamentos a WHERE a.id=f.agendamento_id AND a.cliente_id=$1 AND f.status='pendente'`, [row.cliente_id]);
      await tx.unsafe(`UPDATE comunicacao_respostas r SET status='cancelado'
        FROM agendamentos a WHERE a.id=r.agendamento_id AND a.cliente_id=$1 AND r.status='pendente'`, [row.cliente_id]);
    }
  }
  // This changes communication preferences only. Appointments remain active.
}

export async function saveBookingConsent(
  tx: Connection, appointmentId: string, clientId: number,
  requested: boolean | undefined, preserveExisting: boolean,
) {
  const [client] = await tx.unsafe("SELECT whatsapp FROM clientes WHERE id=$1", [clientId]);
  if (!client) throw new Error("WHATSAPP_CLIENT_MISSING");
  const [previous] = await tx.unsafe("SELECT autorizado FROM comunicacao_consentimentos WHERE agendamento_id=$1", [appointmentId]);
  const authorized = requested ?? (preserveExisting && previous?.autorizado === true);
  if (authorized) {
    await saveCommunicationPreferences(tx, clientId, client.whatsapp, { notificacoes: true }, "admin");
  }
  // Preserve the origin vocabulary required by migration 0004.
  await tx.unsafe(`INSERT INTO comunicacao_consentimentos(agendamento_id,autorizado,origem)
    VALUES($1,$2,'administrativo') ON CONFLICT(agendamento_id) DO UPDATE
    SET autorizado=EXCLUDED.autorizado,origem=EXCLUDED.origem`, [appointmentId, authorized]);
}
