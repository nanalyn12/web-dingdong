// Restore a dingdong-YYYY-MM-DD.jsonl.gz backup into the DATABASE_URL DB.
//
//   node scripts/restore-backup.mjs <backup-file> [--yes]
//
// The target DB must already have the schema (npm run db:migrate).
// All public tables present in the backup are TRUNCATEd and re-filled
// inside one transaction; FK checks are bypassed with
// session_replication_role=replica (needs a superuser-ish role — Railway's
// default postgres user qualifies).
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");

const [, , file, flag] = process.argv;
if (!file) {
  console.error("usage: node scripts/restore-backup.mjs <backup.jsonl.gz> [--yes]");
  process.exit(1);
}
if (flag !== "--yes") {
  console.error("이 작업은 대상 DB의 모든 테이블을 비우고 백업으로 덮어씁니다.");
  console.error("계속하려면 --yes 를 붙여 다시 실행하세요.");
  process.exit(1);
}

// Load DATABASE_URL from .env when not set (same convention as drizzle-kit).
if (!process.env.DATABASE_URL) {
  try {
    const { readFileSync } = await import("node:fs");
    const env = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", ".env"), "utf8");
    const m = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m);
    if (m) process.env.DATABASE_URL = m[1];
  } catch { /* ignore */ }
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL이 없습니다 (.env 또는 환경변수).");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const client = await pool.connect();

// Column types per table — jsonb/json values must be stringified for node-pg,
// while text[]/integer[] columns take real JS arrays.
const { rows: colRows } = await client.query(`
  SELECT table_name, column_name, data_type FROM information_schema.columns
  WHERE table_schema = 'public'`);
const jsonCols = new Set(
  colRows.filter((c) => c.data_type === "jsonb" || c.data_type === "json")
    .map((c) => `${c.table_name}.${c.column_name}`),
);

// Read the whole backup grouped by table.
const byTable = new Map();
const rl = createInterface({ input: createReadStream(file).pipe(createGunzip()) });
for await (const line of rl) {
  if (!line.trim()) continue;
  const obj = JSON.parse(line);
  if (obj.type === "meta") continue;
  if (!byTable.has(obj.table)) byTable.set(obj.table, []);
  byTable.get(obj.table).push(obj.row);
}
console.log(`백업 로드: ${[...byTable.keys()].length}개 테이블, ${[...byTable.values()].reduce((s, r) => s + r.length, 0)}행`);

try {
  await client.query("BEGIN");
  await client.query("SET session_replication_role = replica");

  for (const table of byTable.keys()) {
    await client.query(`TRUNCATE "${table.replace(/"/g, "")}" CASCADE`);
  }
  for (const [table, rows] of byTable) {
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    const colList = cols.map((c) => `"${c}"`).join(", ");
    for (const row of rows) {
      const values = cols.map((c) => {
        const v = row[c];
        if (v === null || typeof v !== "object") return v;
        // jsonb/json → stringified; text[]/int[] arrays pass through as JS arrays.
        return jsonCols.has(`${table}.${c}`) ? JSON.stringify(v) : v;
      });
      const params = values.map((_, i) => `$${i + 1}`).join(", ");
      await client.query(
        `INSERT INTO "${table.replace(/"/g, "")}" (${colList}) VALUES (${params})`,
        values,
      );
    }
    console.log(`  ${table}: ${rows.length}행 복원`);
  }

  await client.query("COMMIT");
  console.log("복원 완료 ✅");
} catch (e) {
  await client.query("ROLLBACK");
  console.error("복원 실패 — 롤백됨:", e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
