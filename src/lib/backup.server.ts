// Nightly logical DB backup onto the Railway volume. SERVER-ONLY.
// Cost-free by design: pure Node (the container has no pg_dump), one
// gzipped JSONL file per day under /data/backups, 7-day retention.
// Runs at BACKUP_TIME_KST via the scheduler tick, plus once on boot when
// today's file is missing (so every deploy leaves a fresh backup).
// Restore: apply drizzle migrations, then scripts/restore-backup.mjs.
import { sql } from "drizzle-orm";

const BACKUP_TIME_KST = "04:30";
const KEEP_FILES = 7;

declare global {
  // eslint-disable-next-line no-var
  var __dailyBackupBootChecked: boolean | undefined;
}

async function backupDir(): Promise<string> {
  const { join } = await import("node:path");
  const { getMediaDir } = await import("@/lib/suno.server");
  // MEDIA_DIR=/data/media → /data/backups (outside the public /media/* route).
  return join(getMediaDir(), "..", "backups");
}

function fileNameFor(dateKey: string): string {
  return `dingdong-${dateKey}.jsonl.gz`;
}

/** Run the backup if today's file does not exist yet. */
export async function maybeRunDailyBackup(dateKey: string): Promise<void> {
  if (!process.env.RAILWAY_ENVIRONMENT && !process.env.RAILWAY_PROJECT_ID) return;

  const { join } = await import("node:path");
  const { access } = await import("node:fs/promises");
  const dir = await backupDir();
  const finalPath = join(dir, fileNameFor(dateKey));
  try {
    await access(finalPath);
    return; // already backed up today
  } catch {
    /* missing → run */
  }
  await runDbBackup(dateKey);
}

/** Boot hook: once per process, back up if today's KST file is missing. */
export async function initBackupOnBoot(): Promise<void> {
  if (globalThis.__dailyBackupBootChecked) return;
  globalThis.__dailyBackupBootChecked = true;
  const kst = new Date(Date.now() + 9 * 3600_000);
  await maybeRunDailyBackup(kst.toISOString().slice(0, 10));
}

export function isBackupTime(hhmm: string): boolean {
  return hhmm === BACKUP_TIME_KST;
}

async function runDbBackup(dateKey: string): Promise<void> {
  const started = Date.now();
  const { db, tables } = await import("@/db");
  const { createGzip } = await import("node:zlib");
  const { createWriteStream } = await import("node:fs");
  const { mkdir, readdir, rm, rename, stat } = await import("node:fs/promises");
  const { join } = await import("node:path");

  const dir = await backupDir();
  await mkdir(dir, { recursive: true });
  const tmpPath = join(dir, `.tmp-${fileNameFor(dateKey)}`);
  const finalPath = join(dir, fileNameFor(dateKey));

  const gzip = createGzip({ level: 6 });
  const out = createWriteStream(tmpPath);
  gzip.pipe(out);
  const write = (obj: unknown) =>
    new Promise<void>((resolve) => {
      if (gzip.write(JSON.stringify(obj) + "\n")) resolve();
      else gzip.once("drain", resolve);
    });

  const tablesRes = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name`);
  const tableNames = (tablesRes.rows as Array<{ table_name: string }>).map(
    (r) => r.table_name,
  );

  let totalRows = 0;
  await write({ type: "meta", app: "dingdong", date: dateKey, tables: tableNames });
  for (const t of tableNames) {
    const res = await db.execute(sql.raw(`SELECT * FROM "${t.replace(/"/g, "")}"`));
    for (const row of res.rows as Array<Record<string, unknown>>) {
      await write({ table: t, row });
      totalRows++;
    }
  }

  await new Promise<void>((resolve, reject) => {
    out.on("finish", () => resolve());
    out.on("error", reject);
    gzip.end();
  });
  await rename(tmpPath, finalPath);
  const { size } = await stat(finalPath);

  // Retention: keep the newest KEEP_FILES daily files.
  const files = (await readdir(dir))
    .filter((f) => /^dingdong-\d{4}-\d{2}-\d{2}\.jsonl\.gz$/.test(f))
    .sort()
    .reverse();
  for (const f of files.slice(KEEP_FILES)) {
    await rm(join(dir, f), { force: true }).catch(() => {});
  }

  // Status row so the backup is observable from the DB (and later, the UI).
  const status = {
    last_date: dateKey,
    file: fileNameFor(dateKey),
    bytes: size,
    tables: tableNames.length,
    rows: totalRows,
    took_ms: Date.now() - started,
    finished_at: new Date().toISOString(),
  };
  await db
    .insert(tables.app_credentials)
    .values({ key: "backup_status", value: status })
    .onConflictDoUpdate({
      target: tables.app_credentials.key,
      set: { value: status, updated_at: new Date().toISOString() },
    });
  console.log(
    `[backup] ${fileNameFor(dateKey)} — ${tableNames.length} tables, ${totalRows} rows, ${(size / 1024).toFixed(1)}KB`,
  );
}
