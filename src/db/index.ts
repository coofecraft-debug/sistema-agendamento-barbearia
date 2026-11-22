import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
const globalDb = globalThis as unknown as {
  blackSql?: ReturnType<typeof postgres>;
};
export const sql =
  globalDb.blackSql ??
  postgres(
    (process.env.DATABASE_URL ?? (() => { throw new Error("Configure DATABASE_URL antes de iniciar"); })()),
    { max: 5, idle_timeout: 20, connect_timeout: 5 },
  );
if (process.env.NODE_ENV !== "production") globalDb.blackSql = sql;
export const db = drizzle(sql, { schema });
// Drizzle installs date serializers on this shared connection. Raw SQL parameters
// must use ISO strings, never Date objects; Drizzle queries handle mapping themselves.
