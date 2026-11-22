import { sql } from "../src/db";
import { hashPassword } from "../src/lib/password";
import { assertLocal } from "./local-guard";
assertLocal();
if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12)
  throw new Error("Configure ADMIN_PASSWORD com ao menos 12 caracteres.");
try {
  const hash = await hashPassword(process.env.ADMIN_PASSWORD);
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(19442001)`;
    await tx`INSERT INTO profissionais(nome,papel) VALUES('Barbeiro Exemplo 1','dono'),('Barbeiro Exemplo 2','funcionario') ON CONFLICT DO NOTHING`;
    if (!(await tx`SELECT id FROM servicos LIMIT 1`).length)
      await tx`INSERT INTO servicos(nome,preco_centavos,duracao) VALUES('Corte Masculino',3500,30),('Barba',2500,30),('Cabelo e Barba',6000,45)`;
    if (!(await tx`SELECT id FROM expediente LIMIT 1`).length)
      await tx`INSERT INTO expediente(profissional_id,dia_semana,inicio,fim) SELECT p.id,d,'09:00'::time,'12:00'::time FROM profissionais p CROSS JOIN generate_series(2,6) d UNION ALL SELECT p.id,d,'14:00'::time,'19:30'::time FROM profissionais p CROSS JOIN generate_series(2,6) d`;
    await tx`INSERT INTO administradores(email,nome,senha_hash) VALUES(${(process.env.ADMIN_EMAIL ?? (() => { throw new Error("ADMIN_EMAIL obrigatorio"); })())},'Administrador',${hash}) ON CONFLICT(email) DO NOTHING`;
  });
  console.log(
    "Serviços, profissionais e administrador local preparados. Nenhum contato real ou fictício inserido.",
  );
} finally {
  await sql.end();
}
