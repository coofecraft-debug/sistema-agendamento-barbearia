import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { sql } from "@/db";
import { checkOrigin, cookieName, createSession, digest } from "@/lib/auth";
import { verifyPassword, hashPassword } from "@/lib/password";
export const runtime = "nodejs";
const dummy = hashPassword("not-a-real-password-for-timing");
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { email, password } = z
      .object({
        email: z
          .email()
          .max(150)
          .transform((v) => v.toLowerCase().trim()),
        password: z.string().min(1).max(200),
      })
      .parse(await request.json());
    // DB-persisted limit; all requests count, including concurrent attempts. No trust in spoofable IP headers.
    const limited = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(19442002)`;
      await tx`DELETE FROM login_tentativas WHERE expira_em<now()`;
      for (const key of ["global", digest(email)]) {
        const [row] =
          await tx`INSERT INTO login_tentativas(chave,quantidade,expira_em) VALUES(${key},1,now()+interval '15 minutes') ON CONFLICT(chave) DO UPDATE SET quantidade=login_tentativas.quantidade+1 RETURNING quantidade`;
        if (row.quantidade > (key === "global" ? 100 : 10)) return true;
      }
      return false;
    });
    if (limited)
      return NextResponse.json(
        { error: "Muitas tentativas. Aguarde 15 minutos." },
        { status: 429 },
      );
    const [user] =
      await sql`SELECT * FROM administradores WHERE email=${email}`;
    const valid = await verifyPassword(
      password,
      user?.senha_hash ?? (await dummy),
    );
    if (!valid || !user)
      return NextResponse.json(
        { error: "E-mail ou senha inválidos." },
        { status: 401 },
      );
    await createSession(user.id);
    await sql`DELETE FROM login_tentativas WHERE chave=${digest(email)}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message === "ORIGIN"
            ? "Origem não autorizada."
            : "Não foi possível entrar. Verifique os dados e o banco local.",
      },
      { status: 400 },
    );
  }
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const jar = await cookies();
    const token = jar.get(cookieName)?.value;
    if (token) await sql`DELETE FROM sessoes WHERE hash=${digest(token)}`;
    jar.delete(cookieName);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível sair." },
      { status: 400 },
    );
  }
}
