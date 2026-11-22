import { NextResponse } from "next/server";
import { sql } from "@/db";
import { executeMetaQuickReply } from "@/lib/comunicacao";
import { stopWhatsappMessages } from "@/lib/communication-preferences";
import { extractMetaWebhookEvents, verificationTokenMatches, webhookSignatureValid } from "@/lib/meta-webhook";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Meta's HTTPS subscription handshake. This is NOT an access token.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ok = url.searchParams.get("hub.mode") === "subscribe" &&
    verificationTokenMatches(url.searchParams.get("hub.verify_token"), process.env.META_WEBHOOK_VERIFY_TOKEN);
  const challenge = url.searchParams.get("hub.challenge");
  if (!ok || !challenge || !/^\d{1,32}$/.test(challenge)) return new Response("Não autorizado", {status:403});
  return new Response(challenge, {status:200,headers:{"Content-Type":"text/plain","Cache-Control":"no-store"}});
}

/** Only accept signed Meta events for our production phone ID. */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 131072) return new Response("Muito grande", {status:413});
  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.length > 131072) return new Response("Muito grande", {status:413});
  if (!webhookSignatureValid(raw, request.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET || "")) {
    return new Response("Não autorizado", {status:401});
  }
  let payload: unknown;
  try { payload = JSON.parse(raw.toString("utf8")); }
  catch { return new Response("JSON inválido", {status:400}); }
  const {statuses, replies, optOuts} = extractMetaWebhookEvents(payload, process.env.META_PHONE_NUMBER_ID || "");
  // BLACK_DIAGNOSTICO_WEBHOOK_V1: contagens de eventos após assinatura válida.
  console.info("[AGENDA Meta] Eventos reconhecidos:", JSON.stringify({
    entregas: statuses.length, respostas: replies.length, paradas: optOuts.length,
  }));
  try {
    for (const event of statuses) {
      // BLACK_META_CODIGOS_ENTREGA_V1: keep numeric error codes from signed status events.
      const codes = event.errorCodes;
      const deliveryError = event.status === "failed" && codes?.length
        ? "Meta webhook codigo " + codes.join(",")
        : null;
      await sql`UPDATE comunicacao_fila SET
        ultima_falha = CASE WHEN meta_entrega_status IS DISTINCT FROM 'read'
          THEN COALESCE(${deliveryError}::text, ultima_falha) ELSE ultima_falha END,
        meta_entrega_status = CASE WHEN meta_entrega_status = 'read' THEN 'read'
          WHEN meta_entrega_status = 'delivered' AND ${event.status} = 'sent' THEN 'delivered'
          ELSE ${event.status} END,
        meta_entrega_em = now()
        WHERE meta_message_id = ${event.id} AND status='enviado'`;
      await sql`UPDATE comunicacao_respostas SET
        meta_entrega_status = CASE WHEN meta_entrega_status = 'read' THEN 'read'
          WHEN meta_entrega_status = 'delivered' AND ${event.status} = 'sent' THEN 'delivered'
          ELSE ${event.status} END,
        meta_entrega_em = now()
        WHERE meta_message_id = ${event.id} AND status='enviado'`;
      await sql`UPDATE comunicacao_convites SET
        meta_entrega_status = CASE WHEN meta_entrega_status = 'read' THEN 'read'
          WHEN meta_entrega_status = 'delivered' AND ${event.status} = 'sent' THEN 'delivered'
          ELSE ${event.status} END, meta_entrega_em=now()
        WHERE meta_message_id=${event.id} AND status='enviado'`;
    }
    for (const event of optOuts) await sql.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(19442003)`;
      await stopWhatsappMessages(tx, event.sender, event.kind, event.sentAt);
    });
    for (const reply of replies) {
      const result = await executeMetaQuickReply(reply.action, reply.token, reply.sender, reply.replyToMessageId, reply.origin);
      // Do not log phone, secret payload, client, or specific appointment.
      console.info(`[AGENDA Meta] Resposta rápida processada: ${result}.`);
    }
  } catch {
    // A database outage -> Meta retries its signed notification. One-use
    // tokens ensure duplicate delivery never performs an action twice.
    console.error("[AGENDA Meta] Falha ao registrar webhook assinado.");
    return NextResponse.json({error:"temporariamente indisponivel"},{status:503});
  }
  return NextResponse.json({ok:true});
}
