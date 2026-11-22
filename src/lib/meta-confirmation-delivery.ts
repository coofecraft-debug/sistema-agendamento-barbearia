/** Durable service-window acknowledgment sender. Does not change existing template jobs. */
import type postgres from "postgres";
import { buildConfirmationReply } from "./meta-confirmation-reply";
import { metaGraphUrl } from "./meta-template";
import type { DeliveryConfig } from "./meta-delivery";

type Database = ReturnType<typeof postgres>;
type ReplyJob = {
  id: number;
  whatsapp: string;
  servico: string;
  inicio: string;
  conteudo: string;
  valid: boolean;
};
export type ConfirmationReplyReport = { accepted: number; failed: number; uncertain: number; cancelled: number };

export class MetaConfirmationDelivery {
  constructor(
    private sql: Database, private config: DeliveryConfig,
    private fetcher: typeof fetch = fetch,
    private clock: () => Date = () => new Date(),
    private shouldStop: () => boolean = () => false,
  ) {}

  private async claim(now: Date): Promise<ReplyJob | null> {
    return this.sql.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(19442003)`;
      const [job] = await tx.unsafe(`SELECT r.id,r.whatsapp,s.nome AS servico,a.inicio,f.conteudo,
        (a.status='Confirmado' AND a.inicio>$2::timestamptz
          AND r.expira_em>$2::timestamptz AND r.revisao=v.revisao
          AND coalesce(co.autorizado,false) AND NOT coalesce(p.bloqueado,false)
          AND black_whatsapp(c.whatsapp)=r.whatsapp AND f.conteudo IS NOT NULL) AS valid
        FROM comunicacao_respostas r
        JOIN agendamentos a ON a.id=r.agendamento_id
        JOIN clientes c ON c.id=a.cliente_id JOIN servicos s ON s.id=a.servico_id
        JOIN comunicacao_versoes v ON v.agendamento_id=a.id
        LEFT JOIN comunicacao_fila f ON f.agendamento_id=a.id AND f.revisao=r.revisao AND f.tipo='confirmacao'
        LEFT JOIN comunicacao_consentimentos co ON co.agendamento_id=a.id
        LEFT JOIN comunicacao_preferencias p ON p.cliente_id=c.id AND p.whatsapp=r.whatsapp
        WHERE r.status='pendente' AND r.executar_em<=$2::timestamptz
          AND ($1::text[] IS NULL OR r.whatsapp=ANY($1::text[]))
        ORDER BY r.executar_em,r.id LIMIT 1 FOR UPDATE OF r SKIP LOCKED`,
        [this.config.recipients, now.toISOString()]);
      if (!job) return null;
      if (!job.valid) {
        await tx.unsafe("UPDATE comunicacao_respostas SET status='cancelado' WHERE id=$1", [job.id]);
      } else {
        await tx.unsafe(`UPDATE comunicacao_respostas SET status='enviando',tentativas=tentativas+1,
          meta_requisitado_em=$2::timestamptz WHERE id=$1`, [job.id, now.toISOString()]);
      }
      return job as unknown as ReplyJob;
    });
  }

  private async stillValid(job: ReplyJob, now: Date) {
    const [valid] = await this.sql.unsafe(`SELECT 1 FROM comunicacao_respostas r
      JOIN agendamentos a ON a.id=r.agendamento_id
      JOIN clientes c ON c.id=a.cliente_id
      JOIN comunicacao_versoes v ON v.agendamento_id=a.id AND v.revisao=r.revisao
      JOIN comunicacao_consentimentos co ON co.agendamento_id=a.id AND co.autorizado=true
      LEFT JOIN comunicacao_preferencias p ON p.cliente_id=c.id AND p.whatsapp=r.whatsapp
      WHERE r.id=$1 AND r.status='enviando' AND a.status='Confirmado'
        AND a.inicio>$2::timestamptz AND r.expira_em>$2::timestamptz
        AND NOT coalesce(p.bloqueado,false) AND black_whatsapp(c.whatsapp)=r.whatsapp
        AND r.whatsapp=$3`, [job.id, now.toISOString(), job.whatsapp]);
    return Boolean(valid);
  }

  private async record(job: ReplyJob, status: string, messageId: string | null = null, reason: string | null = null) {
    await this.sql.unsafe(`UPDATE comunicacao_respostas SET status=$2,meta_message_id=$3,ultima_falha=$4,
      meta_respondido_em=now() WHERE id=$1 AND status='enviando'`, [job.id, status, messageId, reason]);
  }

  async sendBatch(): Promise<ConfirmationReplyReport> {
    if (this.config.preview) throw new Error("Prévia não pode enviar confirmações.");
    await this.sql.unsafe(`UPDATE comunicacao_respostas SET status='incerto',
      ultima_falha='Processo interrompido; verifique Meta antes de reenviar.'
      WHERE status='enviando' AND meta_requisitado_em<now()-interval '5 minutes'`);
    const report = { accepted: 0, failed: 0, uncertain: 0, cancelled: 0 };
    for (let n = 0; n < 25; n++) {
      if (this.shouldStop()) break;
      const job = await this.claim(this.clock());
      if (!job) break;
      if (!job.valid) { report.cancelled++; continue; }
      let message: ReturnType<typeof buildConfirmationReply>;
      try {
        message = buildConfirmationReply({ ...job, appOrigin: this.config.appOrigin });
        if (this.config.recipients && !this.config.recipients.includes(message.to)) throw Error("DESTINATARIO_NAO_PERMITIDO");
      } catch {
        await this.record(job, "falhou", null, "Verifique dados da reserva e token de cancelamento.");
        report.failed++; continue;
      }
      if (!(await this.stillValid(job, this.clock()))) {
        await this.record(job, "cancelado"); report.cancelled++; continue;
      }
      let response: Response;
      try {
        response = await this.fetcher(metaGraphUrl(this.config.graphVersion, this.config.phoneNumberId), {
          method: "POST",
          headers: { Authorization: `Bearer ${this.config.accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(message), signal: AbortSignal.timeout(12_000),
        });
      } catch {
        await this.record(job, "incerto", null, "Sem resposta da Meta; verifique antes de reenviar.");
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
        await this.record(job, "incerto", null, "Meta não retornou identificador; verificar antes de reenviar.");
        report.uncertain++; continue;
      }
      await this.record(job, "enviado", id);
      report.accepted++;
    }
    return report;
  }
}
