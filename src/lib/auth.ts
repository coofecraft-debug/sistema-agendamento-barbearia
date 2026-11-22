import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { sql } from "@/db";
export const cookieName = "black_session";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function session() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || token.length !== 64) return null;
  const [user] =
    await sql`SELECT a.id,a.nome FROM sessoes s JOIN administradores a ON a.id=s.administrador_id WHERE s.hash=${digest(token)} AND s.expira_em>now()`;
  return user ?? null;
}
export async function createSession(id: number) {
  const token = randomBytes(32).toString("hex");
  await sql`DELETE FROM sessoes WHERE expira_em<now()`;
  await sql`INSERT INTO sessoes(hash,administrador_id,expira_em) VALUES(${digest(token)},${id},now()+interval '12 hours')`;
  const secure =
    new URL(process.env.APP_ORIGIN ?? "http://127.0.0.1:3000").protocol ===
    "https:";
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: 43200,
  });
}
export function checkOrigin(request: Request) {
  if (request.headers.get("origin") !== process.env.APP_ORIGIN)
    throw new Error("ORIGIN");
}
