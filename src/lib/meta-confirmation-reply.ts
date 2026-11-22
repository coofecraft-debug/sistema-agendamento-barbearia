/** WhatsApp service-window interactive reply, NOT a template.
 * Never log or persist the returned payload: it includes a one-use cancellation token.
 */
import { actionToken, normalizedBrazilWhatsapp, quickReplyPayload } from "./meta-template";

export type ConfirmationReplyInput = {
  whatsapp: string;
  servico: string;
  inicio: string | Date;
  conteudo: string;
  appOrigin: string;
};

export function buildConfirmationReply(input: ConfirmationReplyInput) {
  const start = new Date(input.inicio);
  if (!Number.isFinite(start.getTime())) throw new Error("META_REPLY_DATE_INVALID");
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit",
    month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(start);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value || "";
  const label = `${value("weekday")}, ${value("day")}/${value("month")} às ${value("hour")}h${value("minute")}`;
  const cancelToken = actionToken(input.conteudo, "Cancelar", input.appOrigin);
  return {
    messaging_product: "whatsapp" as const,
    recipient_type: "individual" as const,
    to: normalizedBrazilWhatsapp(input.whatsapp),
    type: "interactive" as const,
    interactive: {
      type: "button" as const,
      body: { text: `✅ Seu agendamento foi confirmado!\n\n💈 ${input.servico} · ${label}\n\nSe precisar desmarcar, toque no botão abaixo.` },
      action: { buttons: [
        { type: "reply" as const, reply: { id: quickReplyPayload("cancelar", cancelToken), title: "Cancelar agendamento" } },
      ] },
    },
  };
}
