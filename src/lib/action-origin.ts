/**
 * Browser form POST CSRF protection.
 * A normal Origin header must match APP_ORIGIN exactly. Some browser navigational
 * form POSTs omit Origin; in that case require the browser-controlled Fetch
 * Metadata signal Sec-Fetch-Site: same-origin. Missing/other values fail closed.
 */
export function requireSameOriginAction(request: Request): void {
  const expected = process.env.APP_ORIGIN;
  if (!expected) throw new Error("ACTION_ORIGIN_CONFIG_MISSING");

  const origin = request.headers.get("origin");
  if (origin !== null) {
    if (origin !== expected) throw new Error("ACTION_ORIGIN_DENIED");
    return;
  }

  const site = request.headers.get("sec-fetch-site");
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  const isForm = type.startsWith("application/x-www-form-urlencoded") ||
    type.startsWith("multipart/form-data");
  if (site !== "same-origin" || !isForm) {
    throw new Error("ACTION_ORIGIN_MISSING_OR_UNTRUSTED");
  }
}
