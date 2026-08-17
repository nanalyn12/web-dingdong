import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

import {
  BACKUP_TABLES,
  BACKUP_VERSION,
  EXCLUDED_TABLES,
  LIMITS,
  assertImportable,
  deleteOrder,
  insertOrder,
  keyOf,
  parseBackupFile,
  planRestore,
  safeJsonParse,
  tableSpec,
  type BackupFile,
  type BackupTableName,
  type ExistingRow,
} from "./tenant-backup";

// ── helpers ────────────────────────────────────────────────────────────────

const ME = "user_me";
const OTHER = "user_other";

function envelope(over: Partial<BackupFile> = {}): BackupFile {
  return {
    backupVersion: BACKUP_VERSION,
    createdAt: "2026-08-18T00:00:00.000Z",
    applicationVersion: "test",
    ownerId: ME,
    checksum: "0".repeat(64),
    signature: "sig",
    rowCounts: {},
    data: {},
    ...over,
  } as BackupFile;
}

function existingOf(
  seed: Partial<Record<BackupTableName, ExistingRow[]>> = {},
): Record<BackupTableName, ExistingRow[]> {
  const out = {} as Record<BackupTableName, ExistingRow[]>;
  for (const spec of BACKUP_TABLES) out[spec.name] = seed[spec.name] ?? [];
  return out;
}

function planWith(
  data: BackupFile["data"],
  opts: {
    mode?: "merge" | "replace";
    tables?: BackupTableName[];
    existing?: Partial<Record<BackupTableName, ExistingRow[]>>;
  } = {},
) {
  return planRestore({
    file: envelope({ data }),
    userId: ME,
    mode: opts.mode ?? "merge",
    tables: opts.tables ?? BACKUP_TABLES.map((t) => t.name),
    existing: existingOf(opts.existing),
  });
}

function stepFor(
  plan: ReturnType<typeof planRestore>,
  table: BackupTableName,
): { inserts: Record<string, unknown>[]; updates: Record<string, unknown>[]; deletes: string[] } {
  const step = plan.steps.find((s) => s.table === table);
  return step ?? { inserts: [], updates: [], deletes: [] };
}

// ── L1-1 / L1-2: 대상 테이블과 순서 ─────────────────────────────────────────

describe("백업 대상 테이블 스펙", () => {
  it("보안·전역 테이블을 하나도 포함하지 않는다", () => {
    const included = BACKUP_TABLES.map((t) => t.name as string);
    for (const forbidden of [
      "user",
      "session",
      "account",
      "verification",
      "user_api_keys",
      "app_credentials",
      "ai_usage_daily",
      "push_subscriptions",
      "video_jobs",
      "vocab_practice_cache",
    ]) {
      expect(included).not.toContain(forbidden);
    }
  });

  it("스키마의 모든 테이블이 포함 또는 명시적 제외로 분류돼 있다", () => {
    const schemaTables: string[] = [];
    for (const value of Object.values(schema) as unknown[]) {
      if (is(value, PgTable)) schemaTables.push(getTableName(value));
    }
    const classified = new Set<string>([
      ...BACKUP_TABLES.map((t) => t.name as string),
      ...EXCLUDED_TABLES.map((t) => t.table),
    ]);
    const unclassified = schemaTables.filter((name) => !classified.has(name));
    expect(unclassified).toEqual([]);
  });

  it("개인 학습 데이터는 백업하지 않는다 — 콘텐츠 제작자의 저작물만 다룬다", () => {
    const included = BACKUP_TABLES.map((t) => t.name as string);
    for (const personal of [
      "profiles",
      "vocabulary",
      "lesson_progress",
      "drama_progress",
      "learning_activity",
    ]) {
      expect(included).not.toContain(personal);
      expect(EXCLUDED_TABLES.map((e) => e.table)).toContain(personal);
    }
  });

  it("남은 테이블은 모두 created_by를 소유 컬럼으로 쓴다", () => {
    for (const spec of BACKUP_TABLES) {
      expect(spec.ownerColumn, `${spec.name}`).toBe("created_by");
    }
  });

  it("제외 테이블마다 제외 사유가 적혀 있다", () => {
    for (const entry of EXCLUDED_TABLES) {
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  it("허용 컬럼 목록이 실제 drizzle 스키마 컬럼과 정확히 일치한다", () => {
    for (const spec of BACKUP_TABLES) {
      const table = (schema as unknown as Record<string, PgTable>)[spec.name];
      const actual = Object.values(getTableColumns(table))
        .map((c) => c.name)
        .sort();
      const declared = [...spec.columns, ...spec.excludeColumns].sort();
      expect(declared, `${spec.name} 컬럼 분류가 스키마와 어긋남`).toEqual(actual);
    }
  });

  it("삽입 순서는 부모가 항상 자식보다 앞에 온다", () => {
    const order = insertOrder();
    for (const spec of BACKUP_TABLES) {
      for (const parent of spec.parents) {
        expect(order.indexOf(parent.table)).toBeLessThan(order.indexOf(spec.name));
      }
    }
  });

  it("삭제 순서는 삽입 순서의 정확한 역순이다", () => {
    expect(deleteOrder()).toEqual([...insertOrder()].reverse());
  });
});

// ── L1-18: 논리 키 정규화 ──────────────────────────────────────────────────

describe("keyOf", () => {
  const single = tableSpec("courses");

  it("단일 키를 정규화한다", () => {
    expect(keyOf(single, { id: "c1" })).toBe(keyOf(single, { id: "c1", title: "무관" }));
  });

  it("값이 없으면 null로 정규화한다", () => {
    expect(keyOf(single, {})).toBe(keyOf(single, { id: null }));
  });

  // 개인 데이터 테이블이 빠지면서 현재 복합 키를 쓰는 테이블은 없지만, 스펙과
  // 복원 경로는 복합 키를 계속 지원한다 (범위를 다시 넓힐 때를 위해).
  it("복합 키는 선언한 컬럼 순서를 따른다", () => {
    const composite = { ...single, key: ["a", "b"] };
    expect(keyOf(composite, { a: "1", b: "2" })).not.toBe(keyOf(composite, { a: "2", b: "1" }));
    expect(keyOf(composite, { b: "2", a: "1" })).toBe(keyOf(composite, { a: "1", b: "2" }));
  });
});

// ── L1-7: prototype pollution ──────────────────────────────────────────────

describe("safeJsonParse", () => {
  it("__proto__ 키로 Object.prototype을 오염시키지 않는다", () => {
    safeJsonParse('{"__proto__":{"polluted":"yes"}}');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("__proto__ / constructor / prototype 키를 제거한다", () => {
    const parsed = safeJsonParse(
      '{"a":1,"__proto__":{"x":1},"constructor":{"y":1},"prototype":{"z":1}}',
    ) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["a"]);
  });

  it("중첩된 배열 안의 오염 키도 제거한다", () => {
    const parsed = safeJsonParse('{"rows":[{"ok":1,"__proto__":{"x":1}}]}') as {
      rows: Record<string, unknown>[];
    };
    expect(Object.keys(parsed.rows[0])).toEqual(["ok"]);
  });

  it("깨진 JSON은 거부한다", () => {
    expect(() => safeJsonParse("{nope")).toThrow();
  });
});

// ── L1-5 / L1-6 / L1-8: 파일 검증 ──────────────────────────────────────────

describe("parseBackupFile", () => {
  const valid = () =>
    JSON.stringify(envelope({ data: { courses: [] }, rowCounts: { courses: 0 } }));

  it("정상 파일을 파싱한다", () => {
    expect(parseBackupFile(valid()).ownerId).toBe(ME);
  });

  it("지원하지 않는 backupVersion을 버전 번호와 함께 거부한다", () => {
    const text = JSON.stringify(envelope({ backupVersion: 99 }));
    expect(() => parseBackupFile(text)).toThrow(/99/);
  });

  it("backupVersion이 없으면 거부한다", () => {
    const obj = envelope() as Record<string, unknown>;
    delete obj.backupVersion;
    expect(() => parseBackupFile(JSON.stringify(obj))).toThrow();
  });

  it("허용 목록에 없는 테이블 키를 거부한다", () => {
    const text = JSON.stringify(envelope({ data: { user: [{ id: "x" }] } as BackupFile["data"] }));
    expect(() => parseBackupFile(text)).toThrow(/user/);
  });

  it("파일 크기 상한을 넘으면 거부한다", () => {
    const big = "x".repeat(LIMITS.maxBytes + 1);
    expect(() => parseBackupFile(big)).toThrow(/크/);
  });

  it("행 수 상한을 넘으면 거부한다", () => {
    const rows = Array.from({ length: LIMITS.maxRows + 1 }, (_, i) => ({ id: `c${i}` }));
    const text = JSON.stringify(envelope({ data: { courses: rows } }));
    expect(() => parseBackupFile(text)).toThrow();
  });

  it("과도하게 깊은 중첩을 거부한다", () => {
    let nested: unknown = "leaf";
    for (let i = 0; i < LIMITS.maxDepth + 5; i++) nested = { nested };
    const text = JSON.stringify(envelope({ data: { courses: [{ id: "c1", quiz: nested }] } }));
    expect(() => parseBackupFile(text)).toThrow();
  });

  it("data가 객체가 아니면 거부한다", () => {
    const text = JSON.stringify(envelope({ data: [] as unknown as BackupFile["data"] }));
    expect(() => parseBackupFile(text)).toThrow();
  });

  it("테이블 값이 배열이 아니면 거부한다", () => {
    const text = JSON.stringify(
      envelope({ data: { courses: { id: "x" } } as unknown as BackupFile["data"] }),
    );
    expect(() => parseBackupFile(text)).toThrow();
  });
});

// ── L1-14: 남의 백업 파일 import 거부 ──────────────────────────────────────

describe("assertImportable", () => {
  it("내 백업이면 통과한다", () => {
    expect(() => assertImportable(envelope({ ownerId: ME }), ME)).not.toThrow();
  });

  it("다른 관리자의 백업 파일을 거부한다", () => {
    expect(() => assertImportable(envelope({ ownerId: OTHER }), ME)).toThrow();
  });

  it("ownerId가 비어 있으면 거부한다", () => {
    expect(() => assertImportable(envelope({ ownerId: "" }), ME)).toThrow();
  });
});

// ── L1-9 ~ L1-13: 복원 계획 ────────────────────────────────────────────────

describe("planRestore — 소유권", () => {
  it("파일 안의 created_by가 남의 id여도 세션 사용자로 강제 치환한다", () => {
    const plan = planWith({
      courses: [{ id: "c1", title: "A", level: "beginner", created_by: OTHER }],
    });
    expect(stepFor(plan, "courses").inserts[0].created_by).toBe(ME);
  });

  it("모든 테이블에서 소유 컬럼을 세션 사용자로 강제 치환한다", () => {
    const plan = planWith({
      dramas: [{ id: "d1", title: "D", level: "beginner", created_by: OTHER }],
      songs: [{ id: "s1", title: "S", level: "beginner", created_by: OTHER }],
    });
    expect(stepFor(plan, "dramas").inserts[0].created_by).toBe(ME);
    expect(stepFor(plan, "songs").inserts[0].created_by).toBe(ME);
  });

  it("이미 존재하고 남이 소유한 행은 건너뛴다 (덮어쓰기 금지)", () => {
    const plan = planWith(
      { courses: [{ id: "c1", title: "탈취 시도", level: "beginner" }] },
      { existing: { courses: [{ key: keyOf(tableSpec("courses"), { id: "c1" }), owner: OTHER }] } },
    );
    const step = stepFor(plan, "courses");
    expect(step.inserts).toHaveLength(0);
    expect(step.updates).toHaveLength(0);
    expect(plan.skipped).toContainEqual(
      expect.objectContaining({ table: "courses", reason: "not_owned" }),
    );
  });

  it("소유자가 null인 레거시 행도 덮어쓰지 않는다", () => {
    const plan = planWith(
      { courses: [{ id: "c1", title: "x", level: "beginner" }] },
      { existing: { courses: [{ key: keyOf(tableSpec("courses"), { id: "c1" }), owner: null }] } },
    );
    expect(stepFor(plan, "courses").updates).toHaveLength(0);
    expect(plan.skipped).toContainEqual(
      expect.objectContaining({ table: "courses", reason: "not_owned" }),
    );
  });

  it("내가 소유한 기존 행은 update로 분류한다", () => {
    const plan = planWith(
      { courses: [{ id: "c1", title: "수정본", level: "beginner" }] },
      { existing: { courses: [{ key: keyOf(tableSpec("courses"), { id: "c1" }), owner: ME }] } },
    );
    expect(stepFor(plan, "courses").updates).toHaveLength(1);
    expect(stepFor(plan, "courses").inserts).toHaveLength(0);
  });

  it("허용되지 않은 컬럼은 제거한다", () => {
    const plan = planWith({
      courses: [{ id: "c1", title: "A", level: "beginner", evil_column: "drop me" }],
    });
    expect(stepFor(plan, "courses").inserts[0]).not.toHaveProperty("evil_column");
  });
});

describe("planRestore — 외래키", () => {
  it("부모 코스가 백업 안에 있으면 레슨을 복원한다", () => {
    const plan = planWith({
      courses: [{ id: "c1", title: "A", level: "beginner" }],
      lessons: [{ id: "l1", course_id: "c1", title: "L", order_index: 0 }],
    });
    expect(stepFor(plan, "lessons").inserts).toHaveLength(1);
  });

  it("부모 코스가 DB에만 있어도 레슨을 복원한다", () => {
    const plan = planWith(
      { lessons: [{ id: "l1", course_id: "c1", title: "L", order_index: 0 }] },
      { existing: { courses: [{ key: keyOf(tableSpec("courses"), { id: "c1" }), owner: ME }] } },
    );
    expect(stepFor(plan, "lessons").inserts).toHaveLength(1);
  });

  it("부모가 어디에도 없는 레슨은 missing_parent로 건너뛴다", () => {
    const plan = planWith({
      lessons: [{ id: "l1", course_id: "ghost", title: "L", order_index: 0 }],
    });
    expect(stepFor(plan, "lessons").inserts).toHaveLength(0);
    expect(plan.skipped).toContainEqual(
      expect.objectContaining({ table: "lessons", reason: "missing_parent" }),
    );
  });

  it("nullable FK는 참조가 끊겨도 행을 버리지 않고 null로 정리한다", () => {
    const plan = planWith({
      curriculum_plans: [
        { id: "p1", student_grade: "중1", course_id: "ghost", lesson_id: "ghost", created_by: ME },
      ],
    });
    const row = stepFor(plan, "curriculum_plans").inserts[0];
    expect(row.course_id).toBeNull();
    expect(row.lesson_id).toBeNull();
  });

  it("남이 만든 레슨을 참조하는 내 수업 계획서는 그 참조를 지킨다", () => {
    const plan = planWith(
      { curriculum_plans: [{ id: "p1", student_grade: "중1", lesson_id: "l1" }] },
      { existing: { lessons: [{ key: keyOf(tableSpec("lessons"), { id: "l1" }), owner: OTHER }] } },
    );
    expect(stepFor(plan, "curriculum_plans").inserts[0].lesson_id).toBe("l1");
  });
});

describe("planRestore — 모드", () => {
  it("merge 모드는 어떤 행도 삭제하지 않는다", () => {
    const plan = planWith(
      { courses: [{ id: "c1", title: "A", level: "beginner" }] },
      {
        mode: "merge",
        existing: { courses: [{ key: keyOf(tableSpec("courses"), { id: "c9" }), owner: ME }] },
      },
    );
    expect(plan.steps.every((s) => s.deletes.length === 0)).toBe(true);
  });

  it("replace 모드는 내 소유이면서 백업에 없는 행만 삭제한다", () => {
    const mine = keyOf(tableSpec("courses"), { id: "c9" });
    const theirs = keyOf(tableSpec("courses"), { id: "c8" });
    const plan = planWith(
      { courses: [{ id: "c1", title: "A", level: "beginner" }] },
      {
        mode: "replace",
        existing: {
          courses: [
            { key: mine, owner: ME },
            { key: theirs, owner: OTHER },
          ],
        },
      },
    );
    expect(stepFor(plan, "courses").deletes).toEqual([mine]);
  });

  it("선택하지 않은 테이블은 손대지 않는다", () => {
    const plan = planWith(
      {
        courses: [{ id: "c1", title: "A", level: "beginner" }],
        songs: [{ id: "s1", title: "S", level: "beginner" }],
      },
      {
        tables: ["courses"],
        mode: "replace",
        existing: { songs: [{ key: keyOf(tableSpec("songs"), { id: "s9" }), owner: ME }] },
      },
    );
    expect(plan.steps.find((s) => s.table === "songs")).toBeUndefined();
  });

  it("복원 요약에 처리 건수가 담긴다", () => {
    const plan = planWith({
      courses: [{ id: "c1", title: "A", level: "beginner" }],
      songs: [{ id: "s1", title: "S", level: "beginner" }],
    });
    expect(plan.totals.inserts).toBe(2);
  });
});
