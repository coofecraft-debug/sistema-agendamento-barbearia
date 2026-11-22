import { createHmac, timingSafeEqual } from "node:crypto";
import { parseQuickReplyPayload, stopInvitationsPayload, type QuickReplyAction } from "./meta-template";

export function webhookSignatureValid(body: Buffer, header: string | null, appSecret: string): boolean {
  if (!appSecret || !header || !/^sha256=[0-9a-f]{64}$/.test(header)) return false;
  const actual = Buffer.from(header.slice(7), "hex");
  const expected = createHmac("sha256", appSecret).update(body).digest();
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function verificationTokenMatches(incoming: string | null, expected: string | undefined): boolean {
  if (!incoming || !expected || Buffer.byteLength(incoming) !== Buffer.byteLength(expected)) return false;
  return timingSafeEqual(Buffer.from(incoming), Buffer.from(expected));
}

export type MetaStatusEvent = { id: string; status: "sent" | "delivered" | "read" | "failed"; errorCodes?: number[] };
export type MetaQuickReplyEvent = {
  /** NEVER log event.token or raw webhook data. */
  id: string;
  sender: string;
  action: QuickReplyAction;
  token: string;
  replyToMessageId: string | null;
  origin: "template" | "resposta";
};
export type MetaOptOutEvent = { id: string; sender: string; kind: "all" | "convites"; sentAt: Date };
export type MetaWebhookEvents = { statuses: MetaStatusEvent[]; replies: MetaQuickReplyEvent[]; optOuts: MetaOptOutEvent[] };

/** Normalize only Meta's inbound Brazilian mobile IDs, including the legacy eight-digit subscriber format. */
function canonicalMetaSender(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/^55[1-9]{2}9\d{8}$/.test(value)) return value;
  if (/^55[1-9]{2}[6-9]\d{7}$/.test(value))
    return value.slice(0, 4) + "9" + value.slice(4);
  return null;
}

/** Ignore notifications for other apps, numbers, message types and unknown buttons. */
export function extractMetaWebhookEvents(payload: unknown, expectedPhoneId: string): MetaWebhookEvents {
  const result: MetaWebhookEvents = {statuses: [],replies: [],optOuts: []};
  if (!expectedPhoneId || !payload || typeof payload !== "object" || (payload as {object?:unknown}).object !== "whatsapp_business_account") return result;
  const entries = (payload as {entry?:unknown}).entry;
  if (!Array.isArray(entries)) return result;
  for (const entry of entries.slice(0,20)) {
    if (!entry || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes.slice(0,20)) {
      if (change?.field !== "messages" || String(change.value?.metadata?.phone_number_id) !== expectedPhoneId) continue;
      const statuses = change.value?.statuses;
      if (Array.isArray(statuses)) for (const st of statuses.slice(0,50)) {
        if (typeof st?.id === "string" && st.id.startsWith("wamid.") && ["sent","delivered","read","failed"].includes(st.status)) {
          const event: MetaStatusEvent = {id:st.id,status:st.status};
          if (event.status === "failed" && Array.isArray(st.errors)) {
            const codes = st.errors.slice(0,10)
              .map((error: {code?:unknown} | null) => error?.code)
              .filter((code: unknown): code is number =>
                typeof code === "number" && Number.isInteger(code) && code > 0 && code <= 9999999);
            if (codes.length > 0) event.errorCodes = [...new Set<number>(codes)];
          }
          result.statuses.push(event);
        }
      }
      const messages = change.value?.messages;
      // BLACK_DIAGNOSTICO_WEBHOOK_V1: somente formato; nunca valores recebidos.
      if (Array.isArray(messages)) for (const m of messages.slice(0, 3)) {
        const from = typeof m?.from === "string" ? m.from : "";
        console.info("[AGENDA Meta] Formato recebido:", JSON.stringify({
          tipo: m?.type === "button" ? "button" : m?.type === "text" ? "text" : m?.type === "interactive" ? "interactive" : "outro",
          br13: /^55[1-9]{2}9\d{8}$/.test(from),
          br12: /^55[1-9]{2}\d{8}$/.test(from),
          payloadValido: Boolean(parseQuickReplyPayload(m?.button?.payload)),
          contextoPresente: typeof m?.context?.id === "string" && m.context.id.startsWith("wamid."),
        }));
      }
      if (Array.isArray(messages)) for (const message of messages.slice(0,50)) {
        const sender = canonicalMetaSender(message?.from);
        if (!sender || typeof message?.id !== "string" || !message.id.startsWith("wamid.")) continue;
        const text = message.type === "text" && typeof message.text?.body === "string"
          ? message.text.body.trim().toUpperCase() : "";
        const kind = message.type === "button" && message.button?.payload === stopInvitationsPayload
          ? "convites" : ["SAIR", "PARAR", "STOP"].includes(text) ? "all" : null;
        if (kind) {
          const timestamp = typeof message.timestamp === "string" && /^\d{10}$/.test(message.timestamp)
            ? Number(message.timestamp) * 1000 : NaN;
          if (Number.isFinite(timestamp) && timestamp <= Date.now() + 300_000)
            result.optOuts.push({ id: message.id, sender, kind, sentAt: new Date(timestamp) });
          continue;
        }
        const origin = message.type === "button" ? "template"
          : message.type === "interactive" && message.interactive?.type === "button_reply" ? "resposta" : null;
        if (!origin) continue;
        const parsed = parseQuickReplyPayload(origin === "template"
          ? message.button?.payload : message.interactive?.button_reply?.id);
        if (!parsed || (origin === "resposta" && parsed.action !== "cancelar")) continue;
        const context = message.context?.id;
        result.replies.push({
          id: message.id,
          sender,
          action: parsed.action,
          token: parsed.token,
          replyToMessageId: typeof context === "string" && context.startsWith("wamid.") ? context : null,
          origin,
        });
      }
    }
  }
  return result;
}
