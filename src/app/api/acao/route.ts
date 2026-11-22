import { NextResponse } from "next/server";
import { requireSameOriginAction } from "@/lib/action-origin";
import { executeAction } from "@/lib/comunicacao";

export const runtime = "nodejs";

type ActionStatus = "confirmado" | "cancelado" | "invalido" | "erro";

// Diagnostic-safe origin display: only public scheme + host + port;
// never expose tokens, URL paths, customer information or credentials.
function publicOrigin(value: string | null | undefined): string {
  if (value == null) return "ausente";
  if (value === "null") return "null";
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return "protocolo-invalido";
    return url.origin;
  } catch {
    return "formato-invalido";
  }
}

function redirectToResult(request: Request, status: ActionStatus) {
  const base = process.env.APP_ORIGIN || request.url;
  return NextResponse.redirect(new URL(`/confirmar/resultado?status=${status}`, base), 303);
}

export async function POST(request: Request) {
  let etapa = "origem";
  try {
    // Same-origin protection even for browser form navigation without Origin.
    requireSameOriginAction(request);

    etapa = "tamanho";
    if (Number(request.headers.get("content-length") ?? 0) > 2048) {
      return new Response("Dados muito grandes", { status: 413 });
    }

    etapa = "formulario";
    const form = await request.formData();
    const token = form.get("token");

    etapa = "confirmacao_banco";
    const result = await executeAction(typeof token === "string" ? token : "");
    if (process.env.NODE_ENV !== "production") {
      console.info(`[AGENDA Fase 3] Ação concluída: ${result}.`);
    }
    return redirectToResult(request, result);
  } catch (error) {
    // Single text line: Next.js serializes object arguments as {} in dev logs.
    // Never log token values, request body, customer names or phone numbers.
    if (process.env.NODE_ENV !== "production") {
      const name = error instanceof Error ? error.name : typeof error;
      const code = (typeof error === "object" && error !== null && "code" in error)
        ? String((error as { code?: unknown }).code ?? "nao_informado")
        : "nao_informado";
      const rawReason = error instanceof Error ? error.message : "Erro desconhecido";
      const reason = rawReason.replace(/[0-9a-f]{32,}/gi, "[oculto]").slice(0, 180);
      const origin = request.headers.get("origin");
      const site = request.headers.get("sec-fetch-site");
      console.error(
        `[BLACK Fase 3] ERRO etapa=${etapa} tipo=${name} codigo=${code} motivo=${reason} originPresente=${origin !== null} originCorreta=${origin === process.env.APP_ORIGIN} originRecebida=${publicOrigin(origin)} originConfigurada=${publicOrigin(process.env.APP_ORIGIN)} originRequisicao=${publicOrigin(request.url)} tamanhoOrigin=${origin?.length ?? 0} tamanhoConfig=${process.env.APP_ORIGIN?.length ?? 0} fetchSite=${site ?? "ausente"}`,
      );
    } else {
      console.error("[AGENDA Fase 3] Erro ao processar confirmação/cancelamento.");
    }
    return redirectToResult(request, "erro");
  }
}
