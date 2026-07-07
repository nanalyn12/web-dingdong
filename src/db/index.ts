// Server-only Postgres client. Never import from client-bundled code paths
// (route components, hooks). Server functions must import it lazily inside
// handlers: const { db } = await import("@/db");
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Missing DATABASE_URL environment variable");
  }
  const pool = new Pool({ connectionString: url, max: 10 });
  return drizzle(pool, { schema });
}

let _db: ReturnType<typeof createDb> | undefined;

export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_, prop, receiver) {
    if (!_db) _db = createDb();
    return Reflect.get(_db, prop, receiver);
  },
});

export * as tables from "./schema";
