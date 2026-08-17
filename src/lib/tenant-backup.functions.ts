// 관리자별 데이터 백업·복원의 서버 함수. 저장소의 다른 기능과 같은 패턴을
// 따른다 — createServerFn + requireAuth 미들웨어 + 핸들러 안에서 @/db 지연 import.
//
// 보안 원칙 (요구사항 21):
//  - tenantId/ownerId는 **입력에 존재하지 않는다.** 언제나 context.userId를 쓴다.
//  - 모든 조회/삭제/복원 쿼리에 소유자 조건이 붙는다 (IDOR 방어).
//  - 화면 권한은 편의일 뿐이고, 실제 차단은 여기서 한다.
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/auth-middleware";
import { isEditorRole } from "@/lib/roles";
import { BACKUP_TABLES, LIMITS, type BackupTableName } from "@/lib/tenant-backup";

/**
 * 콘텐츠를 만들 수 있는 역할(관리자·교수자)만 자기 백업을 다룰 수 있다.
 * 학생과 비회원은 여기서 막힌다 — 백업할 콘텐츠가 없을뿐더러, 목록·다운로드
 * 경로 자체가 열려서는 안 된다.
 *
 * 판정은 roles.ts의 `isEditorRole`을 그대로 쓴다. 화면과 서버가 각자 조건을
 * 적으면 한쪽만 고쳐졌을 때 어긋난다는 이유가 여기에도 똑같이 적용된다.
 */
async function assertBackupAccess(userId: string) {
  const { db, tables } = await import("@/db");
  const rows = await db
    .select({ role: tables.profiles.role })
    .from(tables.profiles)
    .where(eq(tables.profiles.id, userId))
    .limit(1);
  if (!isEditorRole(rows[0]?.role)) {
    throw new Error("관리자 또는 교수자만 사용할 수 있어요.");
  }
}

const TableEnum = z.enum(
  BACKUP_TABLES.map((spec) => spec.name) as [BackupTableName, ...BackupTableName[]],
);

const RestoreInput = z.object({
  backupId: z.uuid(),
  mode: z.enum(["merge", "replace"]),
  // 선택 복원. 비우면 전체.
  tables: z.array(TableEnum).min(1).max(BACKUP_TABLES.length).optional(),
});

export type BackupListItem = {
  id: string;
  kind: string;
  status: string;
  label: string | null;
  backup_version: number;
  app_version: string | null;
  bytes: number;
  total_rows: number;
  row_counts: Record<string, number>;
  checksum: string | null;
  error: string | null;
  restorable: boolean;
  created_at: string;
};

/** 내가 만든 백업만 돌려준다 — 다른 관리자의 백업은 목록에 아예 나타나지 않는다. */
export const listMyBackups = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<BackupListItem[]> => {
    await assertBackupAccess(context.userId);
    const { db, tables } = await import("@/db");
    const rows = await db
      .select()
      .from(tables.tenant_backups)
      .where(eq(tables.tenant_backups.owner_id, context.userId))
      .orderBy(desc(tables.tenant_backups.created_at))
      .limit(100);

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      label: row.label,
      backup_version: row.backup_version,
      app_version: row.app_version,
      bytes: row.bytes,
      total_rows: row.total_rows,
      row_counts: (row.row_counts ?? {}) as Record<string, number>,
      checksum: row.checksum,
      error: row.error,
      restorable: row.status === "completed" && !!row.file_name,
      created_at: row.created_at,
    }));
  });

export const createMyBackup = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ label: z.string().trim().max(120).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertBackupAccess(context.userId);
    const { createBackupForOwner } = await import("@/lib/tenant-backup.server");
    const result = await createBackupForOwner({
      userId: context.userId,
      kind: "manual",
      label: data.label?.trim() || null,
    });
    return { ok: true as const, ...result };
  });

export const deleteMyBackup = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ backupId: z.uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertBackupAccess(context.userId);
    const { deleteBackupForOwner } = await import("@/lib/tenant-backup.server");
    await deleteBackupForOwner(context.userId, data.backupId);
    return { ok: true as const };
  });

/** 복원 모달에 보여 줄 "무엇이 바뀌는가". DB는 건드리지 않는다. */
export const previewMyRestore = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => RestoreInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertBackupAccess(context.userId);
    const { previewRestoreForOwner } = await import("@/lib/tenant-backup.server");
    const preview = await previewRestoreForOwner({
      userId: context.userId,
      backupId: data.backupId,
      mode: data.mode,
      tables: data.tables ?? BACKUP_TABLES.map((spec) => spec.name),
    });
    return {
      totals: preview.plan.totals,
      sharedDeletes: preview.sharedDeletes,
      file: preview.file,
      skipped: preview.plan.skipped.slice(0, 50),
      perTable: preview.plan.steps.map((step) => ({
        table: step.table,
        inserts: step.inserts.length,
        updates: step.updates.length,
        deletes: step.deletes.length,
      })),
    };
  });

export const restoreMyBackup = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => RestoreInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertBackupAccess(context.userId);
    const { applyRestoreForOwner } = await import("@/lib/tenant-backup.server");
    const { safetyBackupId, plan } = await applyRestoreForOwner({
      userId: context.userId,
      backupId: data.backupId,
      mode: data.mode,
      tables: data.tables ?? BACKUP_TABLES.map((spec) => spec.name),
    });
    return { ok: true as const, safetyBackupId, totals: plan.totals };
  });

/** 백업 파일 업로드. base64로 받은 원본 바이트를 서버에서 풀고 검증한다. */
export const importMyBackup = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        // 파일 원본 바이트의 base64 (.json 또는 .json.gz 모두 허용)
        contentBase64: z.string().min(1).max(LIMITS.maxUploadBytes),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBackupAccess(context.userId);

    const raw = Buffer.from(data.contentBase64, "base64");
    if (raw.byteLength === 0) throw new Error("업로드한 파일이 비어 있어요.");
    if (raw.byteLength > LIMITS.maxUploadBytes) {
      throw new Error(
        `업로드 파일이 상한(${Math.round(LIMITS.maxUploadBytes / 1024 / 1024)}MB)을 넘습니다.`,
      );
    }

    // gzip 매직 넘버로 판별 — 확장자나 MIME 타입은 클라이언트가 정하는 값이라 믿지 않는다.
    let text: string;
    if (raw[0] === 0x1f && raw[1] === 0x8b) {
      const { gunzip } = await import("node:zlib");
      const { promisify } = await import("node:util");
      const unzipped = await promisify(gunzip)(raw, { maxOutputLength: LIMITS.maxBytes }).catch(
        () => {
          throw new Error("gzip 백업 파일을 풀 수 없어요. 파일이 손상되었을 수 있습니다.");
        },
      );
      text = unzipped.toString("utf8");
    } else {
      text = raw.toString("utf8");
    }

    const { importBackupForOwner } = await import("@/lib/tenant-backup.server");
    const result = await importBackupForOwner({ userId: context.userId, text });
    return { ok: true as const, ...result };
  });

type AuditDetail = Record<string, string | number | boolean | null>;

/** jsonb detail을 직렬화 가능한 평평한 형태로 좁힌다 (서버 함수 반환 제약). */
function flattenDetail(value: unknown): AuditDetail {
  const out: AuditDetail = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (raw === null) out[key] = null;
    else if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
      out[key] = raw;
    } else out[key] = String(raw);
  }
  return out;
}

/** 최근 감사 로그 (내 것만). */
export const listMyBackupAudit = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    await assertBackupAccess(context.userId);
    const { db, tables } = await import("@/db");
    const rows = await db
      .select()
      .from(tables.backup_audit_log)
      .where(eq(tables.backup_audit_log.user_id, context.userId))
      .orderBy(desc(tables.backup_audit_log.created_at))
      .limit(30);
    return rows.map((row) => ({
      id: row.id,
      backup_id: row.backup_id,
      action: row.action,
      result: row.result,
      detail: flattenDetail(row.detail),
      created_at: row.created_at,
    }));
  });

/** 다운로드 라우트가 쓰는 소유권 확인. 여기서만 파일 경로를 알려 준다. */
export async function assertOwnedBackup(userId: string, backupId: string) {
  const { db, tables } = await import("@/db");
  const rows = await db
    .select({
      id: tables.tenant_backups.id,
      file_name: tables.tenant_backups.file_name,
      status: tables.tenant_backups.status,
      created_at: tables.tenant_backups.created_at,
    })
    .from(tables.tenant_backups)
    .where(and(eq(tables.tenant_backups.id, backupId), eq(tables.tenant_backups.owner_id, userId)))
    .limit(1);
  return rows[0] ?? null;
}
