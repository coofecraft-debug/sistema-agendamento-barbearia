import type postgres from "postgres";
import { buildMetaTemplate, buildWeeklyInvitation, metaGraphUrl } from "./meta-template";
import { scheduleWeeklyInvitations } from "./weekly-invitations";

type Database = ReturnType<typeof postgres>;
export type DeliveryConfig = {
  preview: boolean;
  recipients: string[] | null;
  appOrigin: string;
  confirmationTemplate: string;
  reminderTemplate: string;
  invitationTemplate: string;
  language: string;
  invitations: boolean;
  invitationHour: number;
  graphVersion: string;
  phoneNumberId: string;
  accessToken: string;
};

export function deliveryConfig(env: Readonly<Record<string, string | undefined>>, preview = false): DeliveryConfig {
  const scope = env.META_RECIPIENT_MODE || "allowlist";
  if (!["allowlist", "consented"].includes(scope)) throw new Error("META_RECIPIENT_MODE inválido.");
  const recipients = scope === "consented" ? null : (env.META_ALLOWED_RECIPIENTS || "").split(",").map(v => v.trim()).filter(Boolean);
  if (recipients?.some(v => !/^55[1-9]{2}9\d{8}$/.test(v))) throw new Error("Lista de destinatários inválida; use 55 + DDD + celular.");
  if (!preview) {
    const ack = scope === "allowlist" ? "AUTORIZO_TESTE_COM_NUMEROS_PERMITIDOS" : "AUTORIZO_ENVIO_A_CLIENTES_COM_CONSENTIMENTO";
    if (env.WHATSAPP_SEND_ENABLED !== "true" || env.META_LIVE_ACK !== ack)
      throw new Error("Envio desligado ou autorização incompatível com o modo escolhido.");
    if (recipients && !recipients.length) throw new Error("Informe ao menos um destinatário autorizado para o teste.");
    for (const key of ["META_PHONE_NUMBER_ID", "META_GRAPH_VERSION", "META_ACCESS_TOKEN", "META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN"])
      if (!env[key]?.trim()) throw new Error(`Configure ${key} na VPS.`);
    const origin = new URL(env.APP_ORIGIN || "http://invalid");
    if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(origin.hostname))
      throw new Error("APP_ORIGIN precisa ser a origem HTTPS pública do site.");
    metaGraphUrl(env.META_GRAPH_VERSION!, env.META_PHONE_NUMBER_ID!);
  }
  const hour = Number(env.WHATSAPP_INVITE_HOUR || "9");
  if (!Number.isInteger(hour) || hour < 8 || hour > 18) throw new Error("WHATSAPP_INVITE_HOUR deve ficar entre 8 e 18.");
  return {
    preview, recipients,
    appOrigin: (env.APP_ORIGIN || "").replace(/\/$/, ""),
    confirmationTemplate: env.META_TEMPLATE_CONFIRMACAO || "black_confirmacao_botoes",
    reminderTemplate: env.META_TEMPLATE_LEMBRETE || "black_lembrete_botoes",
    invitationTemplate: env.META_TEMPLATE_CONVITE || "black_convite_semanal",
    language: env.META_TEMPLATE_LANGUAGE || "pt_BR",
    invitations: env.WHATSAPP_INVITES_ENABLED === "true", invitationHour: hour,
    graphVersion: env.META_GRAPH_VERSION || "", phoneNumberId: env.META_PHONE_NUMBER_ID || "",
    accessToken: env.META_ACCESS_TOKEN || "",
  };
}

type Job = {
  id: number; kind: "reserva" | "convite";
  tipo: "confirmacao" | "lembrete";
  cliente: string; whatsapp: string; servico: string; inicio: string;
  conteudo: string; valid: boolean; weeklySelected?: boolean;
};
type Fetcher = typeof fetch;
type Report = { accepted: number; failed: number; uncertain: number; cancelled: number };

export class MetaDelivery {
  constructor(private sql: Database, private config: DeliveryConfig, private fetcher: Fetcher = fetch, private clock: () => Date = () => new Date(), private shouldStop: () => boolean = () => false) {}

  private build(job: Job) {
    // BLACK_WEEKLY_PANEL_V1: only database-selected invitations may be built.
    if (job.kind === "convite" && job.weeklySelected !== true)
      throw new Error("BLACK_WEEKLY_RECIPIENT_NOT_SELECTED");
    const message = job.kind === "convite"
      ? buildWeeklyInvitation({ cliente: job.cliente, whatsapp: job.whatsapp, template: this.config.invitationTemplate, language: this.config.language })
      : buildMetaTemplate({ ...this.config, ...job, appOrigin: this.config.appOrigin });
    if (this.config.recipients && !this.config.recipients.includes(message.to)) throw new Error("Destinatário fora da lista permitida.");
    return message;
  }

  async preview() {
    // A preview is strictly read-only, including on Mondays.
    const appointments = await this.sql.unsafe(`SELECT f.id,'reserva' AS kind,f.tipo,f.conteudo,a.inicio,
      c.nome AS cliente,c.whatsapp,s.nome AS servico
      FROM comunicacao_fila f JOIN agendamentos a ON a.id=f.agendamento_id
      JOIN clientes c ON c.id=a.cliente_id JOIN servicos s ON s.id=a.servico_id
      JOIN comunicacao_consentimentos co ON co.agendamento_id=a.id
      JOIN comunicacao_versoes v ON v.agendamento_id=a.id AND v.revisao=f.revisao
      LEFT JOIN comunicacao_preferencias p ON p.cliente_id=c.id AND p.whatsapp=black_whatsapp(c.whatsapp)
      WHERE f.status='pendente' AND co.autorizado=true AND NOT coalesce(p.bloqueado,false)
        AND a.status IN ('Agendado','Confirmado') AND a.inicio>now()
        AND ($1::text[] IS NULL OR black_whatsapp(c.whatsapp)=ANY($1::text[]))
      ORDER BY f.id DESC LIMIT 5`, [this.config.recipients]);
    const result: { kind: string; template: string; language: string }[] = [];
    for (const row of appointments) {
      const payload = this.build(row as unknown as Job);
      result.push({ kind: row.tipo, template: payload.template.name, language: payload.template.language.code });
    }
    if (this.config.invitations) {
      const invitees = await this.sql.unsafe(`SELECT c.nome AS cliente,c.whatsapp,true AS "weeklySelected" FROM clientes c
        JOIN comunicacao_preferencias p ON p.cliente_id=c.id AND p.whatsapp=black_whatsapp(c.whatsapp)
        JOIN comunicacao_convites_destinatarios d ON d.cliente_id=c.id
          AND d.ativo=true AND d.whatsapp=p.whatsapp
        WHERE p.convites=true AND p.bloqueado=false
          AND ($1::text[] IS NULL OR p.whatsapp=ANY($1::text[])) ORDER BY c.id LIMIT 5`, [this.config.recipients]);
      for (const row of invitees) {
        const payload = this.build({ ...row, kind: "convite" } as unknown as Job);
        result.push({ kind: "convite", template: payload.template.name, language: payload.template.language.code });
      }
    }
    return result;
  }

  private async claim(kind: "reserva" | "convite", now: Date): Promise<Job | null> {
    return this.sql.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(19442003)`;
      const rows = kind === "reserva"
        ? await tx.unsafe(`SELECT f.id,'reserva' AS kind,f.tipo,f.conteudo,a.inicio,c.nome AS cliente,c.whatsapp,s.nome AS servico,
            (coalesce(co.autorizado,false) AND NOT coalesce(p.bloqueado,false)
              AND f.revisao=v.revisao AND a.status IN ('Agendado','Confirmado') AND a.inicio>$2::timestamptz) AS valid
          FROM comunicacao_fila f JOIN agendamentos a ON a.id=f.agendamento_id
          JOIN clientes c ON c.id=a.cliente_id JOIN servicos s ON s.id=a.servico_id
          JOIN comunicacao_versoes v ON v.agendamento_id=a.id
          LEFT JOIN comunicacao_consentimentos co ON co.agendamento_id=a.id
          LEFT JOIN comunicacao_preferencias p ON p.cliente_id=c.id AND p.whatsapp=black_whatsapp(c.whatsapp)
          WHERE f.status='pendente' AND f.executar_em<=$2::timestamptz
            AND ($1::text[] IS NULL OR black_whatsapp(c.whatsapp)=ANY($1::text[]))
          ORDER BY f.executar_em,f.id LIMIT 1 FOR UPDATE OF f SKIP LOCKED`, [this.config.recipients, now.toISOString()])
        : await tx.unsafe(`SELECT f.id,'convite' AS kind,c.nome AS cliente,c.whatsapp,
            EXISTS (SELECT 1 FROM comunicacao_convites_destinatarios d WHERE d.cliente_id=c.id AND d.ativo AND d.whatsapp=f.whatsapp) AS "weeklySelected",
            (EXISTS (SELECT 1 FROM comunicacao_convites_destinatarios d WHERE d.cliente_id=c.id AND d.ativo AND d.whatsapp=f.whatsapp) AND coalesce(p.convites,false) AND NOT coalesce(p.bloqueado,true)
              AND p.versao=f.versao AND f.whatsapp=p.whatsapp AND f.expira_em>$2::timestamptz
              AND NOT EXISTS (SELECT 1 FROM agendamentos a WHERE a.cliente_id=c.id
                AND a.status IN ('Agendado','Confirmado') AND a.inicio>=$2::timestamptz
                AND a.inicio<((f.semana+7)::timestamp AT TIME ZONE 'America/Sao_Paulo'))) AS valid
          FROM comunicacao_convites f JOIN clientes c ON c.id=f.cliente_id
          LEFT JOIN comunicacao_preferencias p ON p.cliente_id=c.id AND p.whatsapp=black_whatsapp(c.whatsapp)
          WHERE f.status='pendente' AND f.executar_em<=$2::timestamptz
            AND ($1::text[] IS NULL OR f.whatsapp=ANY($1::text[]))
          ORDER BY f.executar_em,f.id LIMIT 1 FOR UPDATE OF f SKIP LOCKED`, [this.config.recipients, now.toISOString()]);
      const job = rows[0];
      if (!job) return null;
      const table = kind === "reserva" ? "comunicacao_fila" : "comunicacao_convites";
      if (!job.valid) {
        await tx.unsafe(`UPDATE ${table} SET status='cancelado' WHERE id=$1`, [job.id]);
      } else {
        await tx.unsafe(`UPDATE ${table} SET status='enviando',tentativas=tentativas+1,
          meta_requisitado_em=$2::timestamptz WHERE id=$1`, [job.id, now.toISOString()]);
      }
      return job as unknown as Job;
    }) as Promise<Job | null>;
  }

  private async stillValid(job: Job, now: Date) {
    if (job.kind === "reserva") {
      const [row] = await this.sql.unsafe(`SELECT 1 FROM comunicacao_fila f
        JOIN agendamentos a ON a.id=f.agendamento_id JOIN clientes c ON c.id=a.cliente_id
        JOIN comunicacao_versoes v ON v.agendamento_id=a.id AND v.revisao=f.revisao
        JOIN comunicacao_consentimentos co ON co.agendamento_id=a.id AND co.autorizado=true
        LEFT JOIN comunicacao_preferencias p ON p.cliente_id=c.id AND p.whatsapp=black_whatsapp(c.whatsapp)
        WHERE f.id=$1 AND f.status='enviando' AND NOT coalesce(p.bloqueado,false)
          AND a.status IN ('Agendado','Confirmado') AND a.inicio>$2::timestamptz
          AND black_whatsapp(c.whatsapp)=black_whatsapp($3)`, [job.id, now.toISOString(), job.whatsapp]);
      return Boolean(row);
    }
    const [row] = await this.sql.unsafe(`SELECT 1 FROM comunicacao_convites f
      JOIN clientes c ON c.id=f.cliente_id
      JOIN comunicacao_preferencias p ON p.cliente_id=c.id AND p.whatsapp=black_whatsapp(c.whatsapp)
      WHERE f.id=$1 AND f.status='enviando' AND EXISTS (SELECT 1 FROM comunicacao_convites_destinatarios d WHERE d.cliente_id=c.id AND d.ativo AND d.whatsapp=f.whatsapp) AND p.convites AND NOT p.bloqueado
        AND p.versao=f.versao AND p.whatsapp=f.whatsapp AND f.expira_em>$2::timestamptz
        AND NOT EXISTS (SELECT 1 FROM agendamentos a WHERE a.cliente_id=c.id AND a.status IN ('Agendado','Confirmado')
          AND a.inicio>=$2::timestamptz AND a.inicio<((f.semana+7)::timestamp AT TIME ZONE 'America/Sao_Paulo'))`, [job.id, now.toISOString()]);
    return Boolean(row);
  }

  private async record(job: Job, status: string, messageId: string | null = null, reason: string | null = null) {
    const table = job.kind === "reserva" ? "comunicacao_fila" : "comunicacao_convites";
    await this.sql.unsafe(`UPDATE ${table} SET status=$2,meta_message_id=$3,ultima_falha=$4,
      meta_respondido_em=now() WHERE id=$1 AND status='enviando'`, [job.id, status, messageId, reason]);
  }

  async sendBatch(): Promise<Report> {
    const now = this.clock();
    if (this.config.preview) throw new Error("Prévia não permite envio.");
    // A crashed request may already have reached Meta; never retry it automatically.
    for (const table of ["comunicacao_fila", "comunicacao_convites"]) {
      await this.sql.unsafe(`UPDATE ${table} SET status='incerto',ultima_falha='Processo interrompido; confira antes de reenviar.'
        WHERE status='enviando' AND meta_requisitado_em<now()-interval '5 minutes'`);
    }
    if (this.config.invitations) await this.sql.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(19442003)`;
      await scheduleWeeklyInvitations(tx, this.config.recipients, now, this.config.invitationHour);
    });
    const report: Report = { accepted: 0, failed: 0, uncertain: 0, cancelled: 0 };
    for (const kind of this.config.invitations ? ["reserva", "convite"] as const : ["reserva"] as const) {
      for (let n = 0; n < 25; n++) {
        if (this.shouldStop()) return report;
        const job = await this.claim(kind, this.clock());
        if (!job) break;
        if (!job.valid) { report.cancelled++; continue; }
        let message: ReturnType<MetaDelivery["build"]>;
        try { message = this.build(job); }
        catch {
          await this.record(job, "falhou", null, "Confira modelo, telefone e configuração da mensagem.");
          report.failed++; continue;
        }
        if (!(await this.stillValid(job, this.clock()))) {
          await this.record(job, "cancelado"); report.cancelled++; continue;
        }
        let response: Response;
        try {
          response = await this.fetcher(metaGraphUrl(this.config.graphVersion, this.config.phoneNumberId), {
            method: "POST", headers: { Authorization: `Bearer ${this.config.accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(message), signal: AbortSignal.timeout(12_000),
          });
        } catch {
          await this.record(job, "incerto", null, "Sem resposta da Meta; confira antes de reenviar.");
          report.uncertain++; continue;
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const code = Number.isSafeInteger(data?.error?.code) ? ` código ${data.error.code}` : "";
          await this.record(job, "falhou", null, `Meta HTTP ${response.status}${code}`);
          report.failed++; continue;
        }
        const id = data?.messages?.[0]?.id;
        if (typeof id !== "string" || !id.startsWith("wamid.") || id.length > 512) {
          await this.record(job, "incerto", null, "Meta respondeu sem identificador; confira antes de reenviar.");
          report.uncertain++; continue;
        }
        await this.record(job, "enviado", id);
        report.accepted++;
      }
    }
    return report;
  }
}
