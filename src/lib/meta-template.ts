/** Pure Meta Cloud API payload builder. Never log the returned object: button payloads are one-use secrets. */
export type MetaKind = "confirmacao" | "lembrete";
export type MetaTemplateInput = {
  tipo: MetaKind;
  cliente: string;
  whatsapp: string;
  servico: string;
  inicio: string | Date;
  conteudo: string;
  appOrigin: string;
  confirmationTemplate: string;
  reminderTemplate: string;
  language?: string;
};

export function normalizedBrazilWhatsapp(value: string): string {
  const digits = value.replace(/\D/g, "");
  const national = digits.startsWith("55") && digits.length === 13 ? digits.slice(2) : digits;
  if (!/^[1-9]{2}9\d{8}$/.test(national)) throw new Error("META_PHONE_INVALID");
  return `55${national}`;
}

// Both tokens already exist in the transactionally created outbox. No new token
// is needed for WhatsApp: the webhook reuses existing hashes and version checks.
export function actionToken(content: string, action: "Confirmar" | "Cancelar", appOrigin: string): string {
  const match = content.match(new RegExp(`(?:^|\\n)${action}: (https?:\\/\\/[^\\s]+)`));
  if (!match) throw new Error("META_ACTION_LINK_MISSING");
  const url = new URL(match[1]);
  const base = new URL(appOrigin);
  if (url.origin !== base.origin || url.pathname !== "/confirmar" || url.searchParams.size !== 1) {
    throw new Error("META_ACTION_LINK_ORIGIN");
  }
  const token = url.searchParams.get("token");
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new Error("META_ACTION_TOKEN_INVALID");
  return token;
}

export type QuickReplyAction = "confirmar" | "cancelar";
const prefix: Record<QuickReplyAction, string> = { confirmar: "BLACK_CONFIRMAR:", cancelar: "BLACK_CANCELAR:" };
export function quickReplyPayload(action: QuickReplyAction, token: string): string {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("META_ACTION_TOKEN_INVALID");
  return prefix[action] + token;
}
export function parseQuickReplyPayload(raw: unknown): { action: QuickReplyAction; token: string } | null {
  if (typeof raw !== "string") return null;
  const match = /^(BLACK_CONFIRMAR|BLACK_CANCELAR):([a-f0-9]{64})$/.exec(raw);
  if (!match) return null;
  return { action: match[1] === "BLACK_CONFIRMAR" ? "confirmar" : "cancelar", token: match[2] };
}

/**
 * The approved WhatsApp templates must contain exactly 4 body variables:
 * {{1}} first name, {{2}} service, {{3}} date, {{4}} time;
 * and TWO Quick Reply buttons in this order: Confirmar, Desmarcar.
 * WhatsApp controls their visual styling. They do not open external links.
 */
export function buildMetaTemplate(input: MetaTemplateInput) {
  const start = new Date(input.inicio);
  if (Number.isNaN(start.getTime())) throw new Error("META_DATE_INVALID");
  const name = input.tipo === "confirmacao" ? input.confirmationTemplate : input.reminderTemplate;
  if (!/^[a-z][a-z0-9_]{0,511}$/.test(name)) throw new Error("META_TEMPLATE_NAME_INVALID");
  const firstName = input.cliente.trim().split(/\s+/)[0] || "cliente";
  const date = new Intl.DateTimeFormat("pt-BR", {timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",year:"numeric"}).format(start);
  const time = new Intl.DateTimeFormat("pt-BR", {timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"}).format(start);
  const confirmToken = actionToken(input.conteudo, "Confirmar", input.appOrigin);
  const cancelToken = actionToken(input.conteudo, "Cancelar", input.appOrigin);
  return {
    messaging_product: "whatsapp" as const,
    recipient_type: "individual" as const,
    to: normalizedBrazilWhatsapp(input.whatsapp),
    type: "template" as const,
    template: {
      name,
      language: {code: input.language || "pt_BR"},
      components: [
        {type: "body", parameters: [firstName, input.servico, date, time].map(text => ({type:"text",text}))},
        {type: "button", sub_type:"quick_reply", index:"0", parameters:[{type:"payload",payload:quickReplyPayload("confirmar",confirmToken)}]},
        {type: "button", sub_type:"quick_reply", index:"1", parameters:[{type:"payload",payload:quickReplyPayload("cancelar",cancelToken)}]},
      ],
    },
  };
}

export function metaGraphUrl(version: string, phoneNumberId: string): string {
  if (!/^v\d{1,2}\.\d{1,2}$/.test(version) || !/^\d{8,25}$/.test(phoneNumberId)) {
    throw new Error("META_GRAPH_CONFIG_INVALID");
  }
  return `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
}

export const stopInvitationsPayload = "BLACK_PARAR_CONVITES_V1";

/** Marketing template: one name variable, a STATIC /agendar URL, then an opt-out quick reply. */
export function buildWeeklyInvitation(input: { cliente: string; whatsapp: string; template: string; language?: string }) {
  if (!/^[a-z][a-z0-9_]{0,511}$/.test(input.template)) throw new Error("META_TEMPLATE_NAME_INVALID");
  return {
    messaging_product: "whatsapp" as const,
    recipient_type: "individual" as const,
    to: normalizedBrazilWhatsapp(input.whatsapp),
    type: "template" as const,
    template: {
      name: input.template,
      language: { code: input.language || "pt_BR" },
      components: [
        { type: "body", parameters: [{ type: "text", text: input.cliente.trim().split(/\s+/)[0] || "cliente" }] },
        { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: stopInvitationsPayload }] },
      ],
    },
  };
}
