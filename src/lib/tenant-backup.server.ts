// 관리자(소유자)별 백업의 DB·파일 작업. SERVER-ONLY — 클라이언트에서 import 금지.
// 권한 규칙과 복원 계획 자체는 tenant-backup.ts(순수)에 있고, 여기서는 그 계획을
// 트랜잭션으로 실행하기만 한다.
//
// 저장 위치: Railway 볼륨. MEDIA_DIR=/data/media 기준으로 /data/backups/tenants/**.
// 야간 전체 백업(backup.server.ts)이 쓰는 /data/backups와 같은 볼륨이지만 하위
// 디렉터리가 다르고, 공개 라우트 /media/* 밖이라 URL로 닿을 수 없다. 디렉터리
// 이름은 사용자 id의 sha256 앞부분이라 추측으로 남의 경로를 만들 수도 없다.
import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import {
  BACKUP_TABLES,
  BACKUP_VERSION,
  BackupError,
  LIMITS,
  assertImportable,
  deleteOrder,
  insertOrder,
  keyOf,
  parseBackupFile,
  planRestore,
  tableSpec,
  type BackupFile,
  type BackupRow,
  type BackupTableName,
  type BackupTableSpec,
  type ExistingRow,
  type RestoreMode,
  type RestorePlan,
} from "./tenant-backup";

/** 소유자 한 명이 보관할 수 있는 백업 개수. 넘으면 오래된 것부터 지운다. */
const MAX_BACKUPS_PER_OWNER = 20;
const INSERT_CHUNK = 200;

type Tables = Record<string, PgTable & Record<string, PgColumn>>;

function tableOf(tables: unknown, name: BackupTableName): PgTable & Record<string, PgColumn> {
  const table = (tables as Tables)[name];
  if (!table) throw new BackupError(`스키마에 ${name} 테이블이 없습니다.`, "invalid_spec");
  return table;
}

function appVersion(): string {
  return (
    process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.npm_package_version ?? "dev"
  );
}

// ── 파일 저장소 ─────────────────────────────────────────────────────────────

async function ownerDir(userId: string): Promise<string> {
  const { join } = await import("node:path");
  const { createHash } = await import("node:crypto");
  const { getMediaDir } = await import("@/lib/suno.server");
  const bucket = createHash("sha256").update(userId).digest("hex").slice(0, 32);
  return join(getMediaDir(), "..", "backups", "tenants", bucket);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function filePathFor(userId: string, backupId: string): Promise<string> {
  if (!UUID_RE.test(backupId)) {
    throw new BackupError("백업 식별자가 올바르지 않습니다.", "malformed");
  }
  const { join } = await import("node:path");
  return join(await ownerDir(userId), `${backupId}.json.gz`);
}

async function writeBackupFile(
  userId: string,
  backupId: string,
  text: string,
): Promise<{ path: string; bytes: number }> {
  const { gzip } = await import("node:zlib");
  const { promisify } = await import("node:util");
  const { mkdir, writeFile } = await import("node:fs/promises");

  const path = await filePathFor(userId, backupId);
  const dir = await ownerDir(userId);
  await mkdir(dir, { recursive: true });
  const buf = await promisify(gzip)(Buffer.from(text, "utf8"));
  await writeFile(path, buf);
  return { path, bytes: buf.byteLength };
}

/** 저장된 백업 파일을 읽어 JSON 텍스트로 돌려준다. */
export async function readBackupText(userId: string, backupId: string): Promise<string> {
  const { gunzip } = await import("node:zlib");
  const { promisify } = await import("node:util");
  const { readFile } = await import("node:fs/promises");

  const path = await filePathFor(userId, backupId);
  let raw: Buffer;
  try {
    raw = await readFile(path);
  } catch {
    throw new BackupError(
      "백업 파일을 찾을 수 없어요. 저장소에서 사라졌을 수 있습니다.",
      "malformed",
    );
  }
  const text = (await promisify(gunzip)(raw)).toString("utf8");
  if (text.length > LIMITS.maxBytes) {
    throw new BackupError("백업 파일이 상한보다 큽니다.", "too_large");
  }
  return text;
}

/** 다운로드용 gzip 원본. 서버가 소유자 확인을 끝낸 뒤에만 호출한다. */
export async function readBackupGzip(userId: string, backupId: string): Promise<Buffer> {
  const { readFile } = await import("node:fs/promises");
  return readFile(await filePathFor(userId, backupId));
}

async function deleteBackupFile(userId: string, backupId: string): Promise<void> {
  const { rm } = await import("node:fs/promises");
  await rm(await filePathFor(userId, backupId), { force: true }).catch(() => {});
}

// ── 감사 로그 ───────────────────────────────────────────────────────────────

export type AuditAction =
  | "backup_created"
  | "backup_downloaded"
  | "backup_deleted"
  | "backup_imported"
  | "restore_started"
  | "restore_completed"
  | "restore_failed";

/** 백업 내용 자체는 절대 남기지 않는다 — 건수와 오류 메시지만. */
export async function writeAudit(input: {
  userId: string;
  backupId?: string | null;
  action: AuditAction;
  result?: "ok" | "error";
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { db, tables } = await import("@/db");
    await db.insert(tables.backup_audit_log).values({
      user_id: input.userId,
      backup_id: input.backupId ?? null,
      action: input.action,
      result: input.result ?? "ok",
      detail: (input.detail ?? {}) as never,
    });
  } catch (e) {
    // 감사 로그 실패가 본 작업을 막지는 않는다.
    console.error("[backup] audit log failed:", e);
  }
}

// ── 수집 ────────────────────────────────────────────────────────────────────

function pickColumns(spec: BackupTableSpec, row: Record<string, unknown>): BackupRow {
  const out: BackupRow = {};
  for (const column of spec.columns) out[column] = row[column] ?? null;
  return out;
}

/** 이 사용자에게 귀속된 행만 모은다. 다른 소유자의 행은 어떤 경로로도 들어오지 않는다. */
async function collectOwnedData(userId: string): Promise<{
  data: Partial<Record<BackupTableName, BackupRow[]>>;
  rowCounts: Record<string, number>;
  totalRows: number;
}> {
  const { db, tables } = await import("@/db");
  const data: Partial<Record<BackupTableName, BackupRow[]>> = {};
  const rowCounts: Record<string, number> = {};
  let totalRows = 0;

  for (const name of insertOrder()) {
    const spec = tableSpec(name);
    const table = tableOf(tables, name);

    let where: SQL | undefined = eq(table[spec.ownerColumn], userId);
    if (name === "lessons") {
      // 내가 만든 코스 안의 레슨은 작성자가 누구든 그 코스의 일부다. 코스만
      // 백업하고 레슨을 빠뜨리면 복원해도 빈 코스가 된다.
      const courseIds = (data.courses ?? []).map((row) => String(row.id));
      if (courseIds.length > 0) {
        where = or(where, inArray(table.course_id, courseIds));
      }
    }

    const rows = (await db.select().from(table).where(where)) as Record<string, unknown>[];
    const picked = rows.map((row) => pickColumns(spec, row));
    data[name] = picked;
    rowCounts[name] = picked.length;
    totalRows += picked.length;

    if (totalRows > LIMITS.maxRows) {
      throw new BackupError(
        `백업 대상 행이 상한(${LIMITS.maxRows.toLocaleString("ko-KR")}건)을 넘어 한 번에 처리할 수 없어요.`,
        "too_many_rows",
      );
    }
  }

  return { data, rowCounts, totalRows };
}

/** 파일 봉투를 만들고 체크섬·서명을 붙인다. */
async function buildBackupFile(userId: string): Promise<{
  file: BackupFile;
  text: string;
  totalRows: number;
}> {
  const { data, rowCounts, totalRows } = await collectOwnedData(userId);
  const { checksumOf, signPayload } = await import("./tenant-backup-crypto.server");
  const checksum = checksumOf(data);

  const file: BackupFile = {
    backupVersion: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    applicationVersion: appVersion(),
    ownerId: userId,
    checksum,
    signature: signPayload(userId, checksum),
    rowCounts,
    data,
  };
  const text = JSON.stringify(file, null, 2);
  if (text.length > LIMITS.maxBytes) {
    throw new BackupError(
      `백업이 파일 크기 상한(${Math.round(LIMITS.maxBytes / 1024 / 1024)}MB)을 넘었어요.`,
      "too_large",
    );
  }
  return { file, text, totalRows };
}

// ── 생성 ────────────────────────────────────────────────────────────────────

export type BackupKind = "manual" | "pre_restore" | "imported";

/** 백업을 만들고 볼륨에 저장한다. 실패해도 상태 행은 failed로 남아 UI에 보인다. */
export async function createBackupForOwner(input: {
  userId: string;
  kind: BackupKind;
  label?: string | null;
}): Promise<{ id: string; bytes: number; totalRows: number }> {
  const { db, tables } = await import("@/db");

  const inserted = await db
    .insert(tables.tenant_backups)
    .values({
      owner_id: input.userId,
      kind: input.kind,
      status: "running",
      label: input.label ?? null,
      backup_version: BACKUP_VERSION,
      app_version: appVersion(),
    })
    .returning({ id: tables.tenant_backups.id });
  const backupId = inserted[0].id;

  try {
    const { file, text, totalRows } = await buildBackupFile(input.userId);
    const { bytes } = await writeBackupFile(input.userId, backupId, text);

    await db
      .update(tables.tenant_backups)
      .set({
        status: "completed",
        file_name: `${backupId}.json.gz`,
        bytes,
        total_rows: totalRows,
        row_counts: file.rowCounts as never,
        checksum: file.checksum,
        updated_at: new Date().toISOString(),
      })
      .where(
        and(
          eq(tables.tenant_backups.id, backupId),
          eq(tables.tenant_backups.owner_id, input.userId),
        ),
      );

    await pruneOldBackups(input.userId);
    await writeAudit({
      userId: input.userId,
      backupId,
      action: "backup_created",
      detail: { kind: input.kind, rows: totalRows, bytes },
    });
    return { id: backupId, bytes, totalRows };
  } catch (e) {
    const message = e instanceof Error ? e.message : "알 수 없는 오류";
    await db
      .update(tables.tenant_backups)
      .set({ status: "failed", error: message, updated_at: new Date().toISOString() })
      .where(eq(tables.tenant_backups.id, backupId));
    await writeAudit({
      userId: input.userId,
      backupId,
      action: "backup_created",
      result: "error",
      detail: { error: message },
    });
    throw e;
  }
}

/** 자동 안전 백업(pre_restore)은 보관 한도에서 제외 — 되돌릴 수단이니까. */
async function pruneOldBackups(userId: string): Promise<void> {
  const { db, tables } = await import("@/db");
  const rows = await db
    .select({ id: tables.tenant_backups.id, created_at: tables.tenant_backups.created_at })
    .from(tables.tenant_backups)
    .where(
      and(eq(tables.tenant_backups.owner_id, userId), eq(tables.tenant_backups.kind, "manual")),
    );
  const stale = rows
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(MAX_BACKUPS_PER_OWNER);
  for (const row of stale) {
    await deleteBackupFile(userId, row.id);
    await db
      .delete(tables.tenant_backups)
      .where(and(eq(tables.tenant_backups.id, row.id), eq(tables.tenant_backups.owner_id, userId)));
  }
}

/** 업로드된 백업 파일을 검증해 내 백업 목록에 들인다. */
export async function importBackupForOwner(input: {
  userId: string;
  text: string;
}): Promise<{ id: string; totalRows: number }> {
  const file = parseBackupFile(input.text);
  await assertFileTrusted(file, input.userId);

  const { db, tables } = await import("@/db");
  const totalRows = Object.values(file.data).reduce((sum, rows) => sum + (rows?.length ?? 0), 0);

  const inserted = await db
    .insert(tables.tenant_backups)
    .values({
      owner_id: input.userId,
      kind: "imported",
      status: "running",
      label: `업로드 · ${file.createdAt.slice(0, 10)}`,
      backup_version: file.backupVersion,
      app_version: file.applicationVersion,
    })
    .returning({ id: tables.tenant_backups.id });
  const backupId = inserted[0].id;

  // 파일 안의 ownerId/서명은 그대로 두고 저장한다 — 다시 읽을 때 같은 검증을 통과해야 한다.
  const { bytes } = await writeBackupFile(input.userId, backupId, JSON.stringify(file));
  await db
    .update(tables.tenant_backups)
    .set({
      status: "completed",
      file_name: `${backupId}.json.gz`,
      bytes,
      total_rows: totalRows,
      row_counts: file.rowCounts as never,
      checksum: file.checksum,
      updated_at: new Date().toISOString(),
    })
    .where(eq(tables.tenant_backups.id, backupId));

  await writeAudit({
    userId: input.userId,
    backupId,
    action: "backup_imported",
    detail: { rows: totalRows, bytes },
  });
  return { id: backupId, totalRows };
}

/** 체크섬 → 서명 → 소유자 순으로 검증한다. 하나라도 어긋나면 DB를 건드리지 않는다. */
async function assertFileTrusted(file: BackupFile, userId: string): Promise<void> {
  const { checksumOf, verifyPayload } = await import("./tenant-backup-crypto.server");
  if (checksumOf(file.data) !== file.checksum) {
    throw new BackupError(
      "백업 파일이 손상되었거나 내용이 변조되었어요 (체크섬 불일치).",
      "malformed",
    );
  }
  if (
    !verifyPayload({ ownerId: file.ownerId, checksum: file.checksum, signature: file.signature })
  ) {
    throw new BackupError("이 서버가 만든 백업 파일이 아니거나 서명이 변조되었어요.", "not_owner");
  }
  assertImportable(file, userId);
}

// ── 복원 ────────────────────────────────────────────────────────────────────

/** 다른 테이블이 부모로 참조하는 테이블. 참조 대상이 살아 있는지 보려면
 *  소유자와 무관하게 전부 읽어야 한다. */
const PARENT_TABLES = new Set<BackupTableName>(
  BACKUP_TABLES.flatMap((spec) => spec.parents.map((p) => p.table)),
);

/**
 * 복원 계획에 필요한 현재 DB 상태(논리 키 + 소유자)만 얇게 읽는다. 값 컬럼은
 * 읽지 않는다.
 *
 * 읽는 범위:
 *  - 부모 테이블(코스·레슨·영상): 전체. 자식이 남이 만든 레슨을 가리킬 수도 있다.
 *  - 나머지: 내 행 + 백업이 건드리려는 키. 백업이 남의 행 id를 들고 와도
 *    "이미 있고 내 것이 아님"으로 판정돼 조용히 건너뛰게 하려면 그 행의
 *    소유자를 알아야 한다. 복합 키 테이블은 첫 키가 곧 user_id라 내 행만으로 충분하다.
 */
async function loadExisting(
  userId: string,
  file: BackupFile,
): Promise<Record<BackupTableName, ExistingRow[]>> {
  const { db, tables } = await import("@/db");
  const out = {} as Record<BackupTableName, ExistingRow[]>;

  for (const spec of BACKUP_TABLES) {
    const table = tableOf(tables, spec.name);
    const fields: Record<string, PgColumn> = { __owner: table[spec.ownerColumn] };
    for (const column of spec.key) fields[column] = table[column];

    let where: SQL | undefined;
    if (!PARENT_TABLES.has(spec.name)) {
      const mine = eq(table[spec.ownerColumn], userId);
      const singleKey = spec.key.length === 1 && spec.key[0] !== spec.ownerColumn;
      const wanted = singleKey
        ? [
            ...new Set(
              (file.data[spec.name] ?? [])
                .map((row) => row[spec.key[0]])
                .filter((v): v is string => typeof v === "string" && v.length > 0),
            ),
          ]
        : [];
      where = wanted.length > 0 ? or(mine, inArray(table[spec.key[0]], wanted)) : mine;
    }

    const rows = (await db.select(fields).from(table).where(where)) as Record<string, unknown>[];
    out[spec.name] = rows.map((row) => ({
      key: keyOf(spec, row),
      owner: row.__owner === null || row.__owner === undefined ? null : String(row.__owner),
    }));
  }
  return out;
}

export type RestorePreview = {
  plan: RestorePlan;
  /** replace 모드에서 삭제될 공유 콘텐츠 건수 — 다른 학습자의 진행 기록이 함께 사라진다. */
  sharedDeletes: number;
  file: { createdAt: string; totalRows: number; applicationVersion: string };
};

async function buildPlan(input: {
  userId: string;
  file: BackupFile;
  mode: RestoreMode;
  tables: BackupTableName[];
}): Promise<RestorePreview> {
  const existing = await loadExisting(input.userId, input.file);
  const plan = planRestore({
    file: input.file,
    userId: input.userId,
    mode: input.mode,
    tables: input.tables,
    existing,
  });
  const sharedDeletes = plan.steps
    .filter((step) => tableSpec(step.table).shared)
    .reduce((sum, step) => sum + step.deletes.length, 0);
  return {
    plan,
    sharedDeletes,
    file: {
      createdAt: input.file.createdAt,
      totalRows: Object.values(input.file.data).reduce((s, r) => s + (r?.length ?? 0), 0),
      applicationVersion: input.file.applicationVersion,
    },
  };
}

/** 실제로 복원하기 전에 무엇이 바뀌는지 계산만 한다. DB 변경 없음. */
export async function previewRestoreForOwner(input: {
  userId: string;
  backupId: string;
  mode: RestoreMode;
  tables: BackupTableName[];
}): Promise<RestorePreview> {
  const file = await loadOwnedBackupFile(input.userId, input.backupId);
  return buildPlan({ ...input, file });
}

/** 백업 행을 소유자 조건과 함께 읽고, 파일을 검증해 돌려준다. */
async function loadOwnedBackupFile(userId: string, backupId: string): Promise<BackupFile> {
  const { db, tables } = await import("@/db");
  const rows = await db
    .select({ id: tables.tenant_backups.id, status: tables.tenant_backups.status })
    .from(tables.tenant_backups)
    .where(and(eq(tables.tenant_backups.id, backupId), eq(tables.tenant_backups.owner_id, userId)))
    .limit(1);
  if (rows.length === 0) {
    // 남의 백업이든 없는 id든 똑같이 답한다 — 존재 여부를 흘리지 않는다.
    throw new BackupError("백업을 찾을 수 없어요.", "not_owner");
  }
  if (rows[0].status !== "completed") {
    throw new BackupError("아직 완료되지 않았거나 실패한 백업이라 복원할 수 없어요.", "malformed");
  }

  const file = parseBackupFile(await readBackupText(userId, backupId));
  await assertFileTrusted(file, userId);
  return file;
}

function keyValues(key: string): (string | null)[] {
  return JSON.parse(key) as (string | null)[];
}

function keyPredicate(
  table: PgTable & Record<string, PgColumn>,
  spec: BackupTableSpec,
  key: string,
): SQL {
  const values = keyValues(key);
  const parts = spec.key.map((column, i) => eq(table[column], values[i]));
  return (parts.length === 1 ? parts[0] : and(...parts)) as SQL;
}

/**
 * 계획을 하나의 트랜잭션으로 적용한다. 도중에 무엇이 실패하든 통째로 롤백되므로
 * DB가 절반만 바뀐 상태로 남지 않는다.
 *
 * 삭제·수정 SQL에는 소유자 조건을 다시 붙인다. 계획 단계에서 이미 걸렀지만,
 * 그 사이에 소유자가 바뀌었을 가능성까지 DB 레벨에서 막는다.
 */
export async function applyRestoreForOwner(input: {
  userId: string;
  backupId: string;
  mode: RestoreMode;
  tables: BackupTableName[];
}): Promise<{ safetyBackupId: string; plan: RestorePlan }> {
  const { userId, backupId, mode } = input;
  const file = await loadOwnedBackupFile(userId, backupId);

  await writeAudit({ userId, backupId, action: "restore_started", detail: { mode } });

  // 요구사항 9 — 복원 전 자동 안전 백업. 실패하면 복원을 시작조차 하지 않는다.
  const safety = await createBackupForOwner({
    userId,
    kind: "pre_restore",
    label: `복원 전 자동 백업 · ${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
  });

  try {
    const { plan } = await buildPlan({ userId, file, mode, tables: input.tables });
    const { db, tables: schemaTables } = await import("@/db");

    await db.transaction(async (tx) => {
      // 같은 사용자의 복원이 겹쳐 돌지 않게 한다 — UI 중복 클릭 방지만으로는
      // 탭 두 개나 재시도 요청을 막을 수 없다.
      const lock = await tx.execute(
        sql`SELECT pg_try_advisory_xact_lock(hashtext(${`dingdong:restore:${userId}`})) AS ok`,
      );
      if (!(lock.rows[0] as { ok: boolean } | undefined)?.ok) {
        throw new BackupError(
          "이미 복원이 진행 중이에요. 끝난 뒤 다시 시도해 주세요.",
          "malformed",
        );
      }

      const stepByTable = new Map(plan.steps.map((step) => [step.table, step]));

      // 1) 삭제 — 자식부터.
      for (const name of deleteOrder()) {
        const step = stepByTable.get(name);
        if (!step || step.deletes.length === 0) continue;
        const spec = tableSpec(name);
        const table = tableOf(schemaTables, name);
        const ownerEq = eq(table[spec.ownerColumn], userId);
        for (const key of step.deletes) {
          await tx.delete(table).where(and(ownerEq, keyPredicate(table, spec, key)));
        }
      }

      // 2) 삽입 — 부모부터.
      for (const name of insertOrder()) {
        const step = stepByTable.get(name);
        if (!step || step.inserts.length === 0) continue;
        const table = tableOf(schemaTables, name);
        for (let i = 0; i < step.inserts.length; i += INSERT_CHUNK) {
          await tx.insert(table).values(step.inserts.slice(i, i + INSERT_CHUNK) as never);
        }
      }

      // 3) 수정 — 부모부터.
      for (const name of insertOrder()) {
        const step = stepByTable.get(name);
        if (!step || step.updates.length === 0) continue;
        const spec = tableSpec(name);
        const table = tableOf(schemaTables, name);
        const ownerEq = eq(table[spec.ownerColumn], userId);
        for (const row of step.updates) {
          await tx
            .update(table)
            .set(row as never)
            .where(and(ownerEq, keyPredicate(table, spec, keyOf(spec, row))));
        }
      }
    });

    await writeAudit({
      userId,
      backupId,
      action: "restore_completed",
      detail: {
        mode,
        inserts: plan.totals.inserts,
        updates: plan.totals.updates,
        deletes: plan.totals.deletes,
        skipped: plan.totals.skipped,
        safetyBackupId: safety.id,
      },
    });
    return { safetyBackupId: safety.id, plan };
  } catch (e) {
    const message = e instanceof Error ? e.message : "알 수 없는 오류";
    await writeAudit({
      userId,
      backupId,
      action: "restore_failed",
      result: "error",
      detail: { mode, error: message, safetyBackupId: safety.id },
    });
    throw new Error(`복원에 실패해 아무것도 변경하지 않았어요 (전체 롤백). 사유: ${message}`);
  }
}

/** 백업 삭제. 소유자 조건이 걸린 DELETE가 0행을 지우면 남의 것이므로 거부한다. */
export async function deleteBackupForOwner(userId: string, backupId: string): Promise<void> {
  const { db, tables } = await import("@/db");
  const deleted = await db
    .delete(tables.tenant_backups)
    .where(and(eq(tables.tenant_backups.id, backupId), eq(tables.tenant_backups.owner_id, userId)))
    .returning({ id: tables.tenant_backups.id });
  if (deleted.length === 0) {
    throw new BackupError("백업을 찾을 수 없어요.", "not_owner");
  }
  await deleteBackupFile(userId, backupId);
  await writeAudit({ userId, backupId, action: "backup_deleted" });
}
