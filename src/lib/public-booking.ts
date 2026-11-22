import { cookies } from "next/headers";
import { randomBytes, createHmac } from "node:crypto";
import { sql } from "@/db";
import { digest } from "./auth";
import type { PublicReceipt } from "./public-validation";
export class PublicError extends Error {
  constructor(
    message: string,
    public status = 409,
    public code = "CONFLICT",
  ) {
    super(message);
  }
}
export const publicCookie = "black_booking";
export async function limit(key: string, max: number, seconds = 900) {
  const [row] = await sql`INSERT INTO public_limites(chave,quantidade,expira_em)
    VALUES(${key},1,now()+${seconds}*interval '1 second')
    ON CONFLICT(chave) DO UPDATE SET
    quantidade=CASE WHEN public_limites.expira_em<=now() THEN 1 ELSE public_limites.quantidade+1 END,
    expira_em=CASE WHEN public_limites.expira_em<=now() THEN EXCLUDED.expira_em ELSE public_limites.expira_em END
    RETURNING quantidade`;
  if (row.quantidade > max)
    throw new PublicError(
      "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
      429,
      "RATE_LIMIT",
    );
}
export async function publicSession(create = false) {
  const jar = await cookies();
  const token = jar.get(publicCookie)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const [session] =
      await sql`SELECT * FROM public_sessoes WHERE hash=${digest(token)} AND expira_em>now()`;
    if (session) return session;
  }
  if (!create)
    throw new PublicError(
      "Sua sessão expirou. Recarregue a página para continuar.",
      401,
      "SESSION",
    );
  await limit("sessions:global", 300);
  // Expired transient identities/receipts are removed; appointments remain in the CRM.
  await sql`DELETE FROM public_sessoes WHERE expira_em<=now()`;
  await sql`DELETE FROM public_limites WHERE expira_em<=now()`;
  const next = randomBytes(32).toString("hex");
  const [session] =
    await sql`INSERT INTO public_sessoes(hash) VALUES(${digest(next)}) RETURNING *`;
  jar.set(publicCookie, next, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.APP_ORIGIN?.startsWith("https:"),
    path: "/",
    maxAge: 86400,
  });
  return session;
}
export function phoneLimitKey(phone: string) {
  // Keyed digest: phone numbers never appear in rate limit identifiers or logs.
  return createHmac("sha256", process.env.DATABASE_URL!)
    .update(phone)
    .digest("hex");
}
type Connection = Pick<typeof sql, "unsafe">;
export async function assignedProfessional(tx: Connection, phone: string) {
  const clients = await tx.unsafe(
    "SELECT id,fixo,profissional_preferencial FROM clientes WHERE whatsapp=$1 OR whatsapp=$2 ORDER BY id",
    [phone, "55" + phone],
  );
  if (clients.length > 1)
    throw new PublicError(
      "Precisamos conferir seu cadastro. Fale com a barbearia para agendar.",
    );
  const client = clients[0];
  const pros = await tx.unsafe(
    "SELECT id,nome FROM profissionais WHERE ativo AND papel='dono' LIMIT 1",
  );
  if (!pros[0])
    throw new PublicError(
      "Seu profissional está indisponível no momento. Fale com a barbearia.",
    );
  return {
    client,
    professional: { id: pros[0].id as number, nome: pros[0].nome as string },
  };
}
export function receiptEvent(receipt: PublicReceipt) {
  // Stable integration boundary. No message, reminder or cancellation token is sent here.
  return {
    type: "booking.created" as const,
    appointmentId: receipt.protocolo,
    startsAt: receipt.inicio,
  };
}
