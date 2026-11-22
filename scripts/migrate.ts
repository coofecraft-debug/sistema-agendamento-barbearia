import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { sql } from "../src/db";
import { assertLocal } from "./local-guard";
assertLocal();
try {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(19442001)`;
    await tx`CREATE TABLE IF NOT EXISTS black_migrations (nome text PRIMARY KEY, hash text NOT NULL, aplicado_em timestamptz NOT NULL DEFAULT now())`;
    for (const file of (await readdir("migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      const source = await readFile(`migrations/${file}`, "utf8");
      const hash = createHash("sha256").update(source).digest("hex");
      const [exists] =
        await tx`SELECT hash FROM black_migrations WHERE nome=${file}`;
      if (exists) {
        if (exists.hash !== hash)
          throw new Error(`Migration alterada: ${file}`);
        continue;
      }
      await tx.unsafe(source);
      await tx`INSERT INTO black_migrations(nome,hash) VALUES(${file},${hash})`;
      console.log(`Aplicada ${file}`);
    }
  });
} finally {
  await sql.end();
}
