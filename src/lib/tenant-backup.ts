// 관리자(소유자)별 데이터 백업·복원의 순수 로직. DB·파일시스템·네트워크에
// 의존하지 않으므로 그대로 유닛 테스트할 수 있고, 관리자 UI에서 import해도
// 서버 전용 모듈이 클라이언트 번들로 새지 않는다. DB/파일 작업은
// tenant-backup.server.ts, 서명·체크섬은 tenant-backup-crypto.server.ts.
//
// 이 앱에는 tenant 컬럼이 없다. 콘텐츠의 소유권은 `created_by` 하나로만
// 표현되므로 **tenant = 인증된 사용자 id**로 본다. 그 id는 언제나 세션에서
// 오며, 백업 파일이나 요청 본문에서 읽지 않는다.
//
// 사용 권한은 콘텐츠를 만들 수 있는 역할(관리자·교수자)로 제한한다 — 학생과
// 비회원에게는 서버 함수 단계에서 거부된다 (tenant-backup.functions.ts).

export const BACKUP_VERSION = 1;

/** 이 빌드가 읽을 수 있는 백업 포맷 버전. 포맷을 바꿀 때 여기에 추가하고
 *  parseBackupFile에서 필요한 마이그레이션을 태운다. */
export const SUPPORTED_BACKUP_VERSIONS: number[] = [1];

/** 업로드·파싱 상한. 넘으면 DB를 건드리기 전에 거부한다. */
export const LIMITS = {
  /** 압축을 푼 JSON 텍스트 기준 */
  maxBytes: 16 * 1024 * 1024,
  /** 백업 전체 행 수 */
  maxRows: 100_000,
  /** JSON 중첩 깊이 (jsonb 컬럼 안의 폭탄 방어) */
  maxDepth: 40,
  /** 업로드 본문(gzip base64) 기준 */
  maxUploadBytes: 12 * 1024 * 1024,
} as const;

// 백업 대상은 **제작자가 만든 콘텐츠**뿐이다. 학습자의 개인 데이터(단어장·진행률·
// 프로필)는 다루지 않는다 — 그건 학습자의 것이고, 진행률 테이블을 범위에 넣으면
// 복원 경로가 다른 학습자의 기록과 cascade로 얽힌다.
export type BackupTableName =
  | "courses"
  | "lessons"
  | "dramas"
  | "songs"
  | "curriculum_plans"
  | "video_schedules"
  | "song_schedules";

/** 부모 테이블 참조. `onMissing`은 참조 대상이 DB에도 백업에도 없을 때의 처리 —
 *  NOT NULL FK는 행을 버리고(skip), nullable FK는 null로 정리한다(null). */
type ParentRef = { table: BackupTableName; column: string; onMissing: "skip" | "null" };

export type BackupTableSpec = {
  name: BackupTableName;
  label: string;
  /** 이 행이 누구 것인지 말해 주는 컬럼. 콘텐츠는 전부 created_by다. */
  ownerColumn: string;
  /** 논리 키. 복합 키도 지원한다 (범위를 다시 넓힐 때를 위해). */
  key: string[];
  parents: ParentRef[];
  /** 백업·복원 대상 컬럼 (허용 목록). 여기 없는 컬럼은 조용히 버린다. */
  columns: string[];
  /** 일부러 제외한 컬럼. columns와 합치면 스키마 컬럼 전체가 되어야 한다
   *  (tenant-backup.test.ts가 강제). */
  excludeColumns: string[];
  /** 다른 사용자가 참조할 수 있는 공유 콘텐츠인가. 전체 교체 시 경고 대상. */
  shared: boolean;
};

export const BACKUP_TABLES: BackupTableSpec[] = [
  {
    name: "courses",
    label: "강의 코스",
    ownerColumn: "created_by",
    key: ["id"],
    parents: [],
    columns: [
      "id",
      "title",
      "description",
      "level",
      "weeks",
      "thumbnail_url",
      "created_by",
      "created_at",
      "updated_at",
    ],
    excludeColumns: [],
    shared: true,
  },
  {
    name: "lessons",
    label: "레슨",
    ownerColumn: "created_by",
    key: ["id"],
    parents: [{ table: "courses", column: "course_id", onMissing: "skip" }],
    columns: [
      "id",
      "course_id",
      "title",
      "description",
      "order_index",
      "lesson_type",
      "level",
      "content_md",
      "dialogue_scene",
      "dialogues",
      "key_expressions",
      "vocab_comparison",
      "cultural_note",
      "cultural_snippet",
      "comic_panels",
      "storybook_pages",
      "slides",
      "quiz",
      "video",
      "video_keywords",
      "created_by",
      "created_at",
      "updated_at",
    ],
    excludeColumns: [],
    shared: true,
  },
  {
    name: "dramas",
    label: "영상 학습",
    ownerColumn: "created_by",
    key: ["id"],
    parents: [],
    columns: [
      "id",
      "title",
      "title_zh",
      "description",
      "genre",
      "level",
      "youtube_url",
      "youtube_video_id",
      "media_url",
      "thumbnail_url",
      "duration_seconds",
      "has_captions",
      "scenes",
      "created_by",
      "created_at",
      "updated_at",
    ],
    excludeColumns: [],
    shared: true,
  },
  {
    name: "songs",
    label: "학습송",
    ownerColumn: "created_by",
    key: ["id"],
    parents: [],
    columns: [
      "id",
      "title",
      "title_zh",
      "artist",
      "level",
      "source",
      "status",
      "topic",
      "style",
      "genre",
      "theme",
      "youtube_id",
      "external_url",
      "media_url",
      "video_url",
      "cover_url",
      "lyrics",
      "pinyin",
      "translation",
      "vocab",
      "grammar_notes",
      "quiz",
      "cultural_note",
      "related_content",
      "created_by",
      "created_at",
      "updated_at",
    ],
    // Suno 작업 핸들과 마지막 실패 사유는 그 시점의 외부 작업 상태라 이식해도
    // 의미가 없다.
    excludeColumns: ["suno_audio_id", "suno_audio_task_id", "suno_mp4_task_id", "error"],
    shared: true,
  },
  {
    name: "curriculum_plans",
    label: "수업 계획서",
    ownerColumn: "created_by",
    key: ["id"],
    parents: [
      { table: "courses", column: "course_id", onMissing: "null" },
      { table: "lessons", column: "lesson_id", onMissing: "null" },
    ],
    columns: [
      "id",
      "title",
      "student_grade",
      "duration_minutes",
      "interests",
      "preferred_activities",
      "special_notes",
      "lesson_objective_hint",
      "course_id",
      "lesson_id",
      "objectives",
      "activities",
      "materials",
      "assessment",
      "time_blocks",
      "handout_markdown",
      "linked_content",
      "created_by",
      "created_at",
      "updated_at",
    ],
    excludeColumns: [],
    shared: false,
  },
  {
    name: "video_schedules",
    label: "영상 자동 생성 예약",
    ownerColumn: "created_by",
    key: ["id"],
    parents: [],
    columns: [
      "id",
      "created_by",
      "name",
      "keywords",
      "next_keyword_index",
      "frequency",
      "weekdays",
      "time_kst",
      "enabled",
      "config",
      "last_run_at",
      "created_at",
    ],
    excludeColumns: [],
    shared: false,
  },
  {
    name: "song_schedules",
    label: "학습송 자동 생성 예약",
    ownerColumn: "created_by",
    key: ["id"],
    parents: [],
    columns: [
      "id",
      "created_by",
      "name",
      "keywords",
      "next_keyword_index",
      "frequency",
      "weekdays",
      "time_kst",
      "enabled",
      "level",
      "style",
      "vocal_gender",
      "last_run_at",
      "created_at",
    ],
    excludeColumns: [],
    shared: false,
  },
];

/** 백업하지 않는 테이블과 그 사유. 스키마에 테이블이 추가되면
 *  tenant-backup.test.ts가 여기에 분류를 강제한다. */
export const EXCLUDED_TABLES: { table: string; reason: string }[] = [
  { table: "user", reason: "계정 자체 — 인증 정보라 복원 대상이 아님" },
  { table: "session", reason: "세션 토큰" },
  { table: "account", reason: "비밀번호 해시·OAuth access/refresh 토큰" },
  { table: "verification", reason: "일회성 검증 토큰" },
  { table: "user_api_keys", reason: "개인 API 키 암호문 — 백업으로 유출시키지 않음" },
  { table: "app_credentials", reason: "앱 전역 자격증명(YouTube refresh token 등)" },
  { table: "ai_usage_daily", reason: "AI 일일 쿼터 카운터 — 복원으로 한도를 되돌릴 수 있음" },
  { table: "push_subscriptions", reason: "기기별 푸시 구독 — 다른 기기로 이식 불가" },
  { table: "video_jobs", reason: "일회성 작업 로그 + 볼륨 파일 경로(파일은 백업 범위 밖)" },
  { table: "vocab_practice_cache", reason: "전 사용자 공유 AI 캐시 — 개인 소유 데이터가 아님" },
  { table: "tenant_backups", reason: "백업 기능 자체의 메타데이터" },
  { table: "backup_audit_log", reason: "감사 로그 — 복원으로 덮어쓸 수 없어야 함" },
  // ↓ 학습자 개인 데이터. 이 기능은 제작자의 저작물만 다룬다.
  { table: "profiles", reason: "개인 프로필 — 콘텐츠가 아니고 권한 컬럼(role)을 포함" },
  { table: "vocabulary", reason: "학습자 개인 단어장 — 제작 콘텐츠가 아님" },
  { table: "lesson_progress", reason: "학습자 진행률 — 레슨과 cascade로 얽혀 복원 위험" },
  { table: "drama_progress", reason: "학습자 진행률 — 영상과 cascade로 얽혀 복원 위험" },
  { table: "learning_activity", reason: "학습자 일별 활동 기록 — 제작 콘텐츠가 아님" },
];

const SPEC_BY_NAME = new Map(BACKUP_TABLES.map((spec) => [spec.name, spec]));

export function tableSpec(name: BackupTableName): BackupTableSpec {
  const spec = SPEC_BY_NAME.get(name);
  if (!spec) throw new BackupError(`알 수 없는 백업 테이블입니다: ${name}`, "unknown_table");
  return spec;
}

export function isBackupTable(name: string): name is BackupTableName {
  return SPEC_BY_NAME.has(name as BackupTableName);
}

/** 부모가 먼저 오도록 위상 정렬한 순서. 삽입은 이 순서대로. */
export function insertOrder(): BackupTableName[] {
  const done = new Set<BackupTableName>();
  const order: BackupTableName[] = [];
  let remaining = [...BACKUP_TABLES];
  while (remaining.length > 0) {
    const ready = remaining.filter((spec) => spec.parents.every((p) => done.has(p.table)));
    if (ready.length === 0) {
      throw new BackupError("백업 테이블 의존 관계에 순환이 있습니다.", "invalid_spec");
    }
    for (const spec of ready) {
      done.add(spec.name);
      order.push(spec.name);
    }
    remaining = remaining.filter((spec) => !done.has(spec.name));
  }
  return order;
}

/** 자식이 먼저 사라지도록 뒤집은 순서. 삭제는 이 순서대로. */
export function deleteOrder(): BackupTableName[] {
  return [...insertOrder()].reverse();
}

// ── 파일 포맷 ───────────────────────────────────────────────────────────────

export type BackupRow = Record<string, unknown>;

export type BackupFile = {
  backupVersion: number;
  createdAt: string;
  applicationVersion: string;
  /** 이 백업을 만든 사용자. 서버가 세션에서 정하고, 서명으로 묶는다. */
  ownerId: string;
  /** data에 대한 sha256 (키 순서 무관 정규화 후) */
  checksum: string;
  /** HMAC(BETTER_AUTH_SECRET, version.ownerId.checksum) */
  signature: string;
  rowCounts: Record<string, number>;
  data: Partial<Record<BackupTableName, BackupRow[]>>;
};

export type BackupErrorCode =
  | "too_large"
  | "malformed"
  | "unsupported_version"
  | "unknown_table"
  | "too_many_rows"
  | "too_deep"
  | "not_owner"
  | "invalid_spec";

export class BackupError extends Error {
  readonly code: BackupErrorCode;
  constructor(message: string, code: BackupErrorCode) {
    super(message);
    this.name = "BackupError";
    this.code = code;
  }
}

const POLLUTION_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** JSON.parse + prototype pollution 방어. reviver가 undefined를 돌려주면
 *  해당 키는 결과 객체에서 빠진다. */
export function safeJsonParse(text: string): unknown {
  return JSON.parse(text, (key, value) => (POLLUTION_KEYS.has(key) ? undefined : value));
}

function depthOf(value: unknown, limit: number, current = 0): number {
  if (current > limit || value === null || typeof value !== "object") return current;
  let deepest = current;
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    deepest = Math.max(deepest, depthOf(child, limit, current + 1));
    if (deepest > limit) return deepest;
  }
  return deepest;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new BackupError(`백업 파일의 ${field} 값이 올바르지 않습니다.`, "malformed");
  }
  return value;
}

/**
 * 백업 파일 텍스트를 검증해 파싱한다. DB를 건드리기 전에 형식·버전·테이블
 * 허용 목록·크기·깊이를 모두 통과해야 한다. 실패하면 BackupError를 던진다.
 */
export function parseBackupFile(text: string): BackupFile {
  if (typeof text !== "string" || text.length === 0) {
    throw new BackupError("백업 파일이 비어 있습니다.", "malformed");
  }
  if (text.length > LIMITS.maxBytes) {
    throw new BackupError(
      `백업 파일 크기가 상한(${Math.round(LIMITS.maxBytes / 1024 / 1024)}MB)을 넘습니다.`,
      "too_large",
    );
  }

  let parsed: unknown;
  try {
    parsed = safeJsonParse(text);
  } catch {
    throw new BackupError("백업 파일이 올바른 JSON이 아닙니다.", "malformed");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BackupError("백업 파일의 최상위 구조가 올바르지 않습니다.", "malformed");
  }
  const envelope = parsed as Record<string, unknown>;

  const version = envelope.backupVersion;
  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new BackupError("백업 파일에 backupVersion이 없습니다.", "malformed");
  }
  if (!SUPPORTED_BACKUP_VERSIONS.includes(version)) {
    throw new BackupError(
      `지원하지 않는 백업 버전입니다: ${version} (이 앱은 ${SUPPORTED_BACKUP_VERSIONS.join(", ")}만 읽습니다)`,
      "unsupported_version",
    );
  }

  const data = envelope.data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new BackupError("백업 파일의 data가 객체가 아닙니다.", "malformed");
  }

  let totalRows = 0;
  const cleanData: Partial<Record<BackupTableName, BackupRow[]>> = {};
  for (const [name, rows] of Object.entries(data as Record<string, unknown>)) {
    if (!isBackupTable(name)) {
      throw new BackupError(
        `백업 파일에 허용되지 않은 테이블이 있습니다: ${name}`,
        "unknown_table",
      );
    }
    if (!Array.isArray(rows)) {
      throw new BackupError(`백업 파일의 ${name} 값이 배열이 아닙니다.`, "malformed");
    }
    for (const row of rows) {
      if (row === null || typeof row !== "object" || Array.isArray(row)) {
        throw new BackupError(`백업 파일의 ${name}에 객체가 아닌 행이 있습니다.`, "malformed");
      }
    }
    totalRows += rows.length;
    if (totalRows > LIMITS.maxRows) {
      throw new BackupError(
        `백업 행 수가 상한(${LIMITS.maxRows.toLocaleString("ko-KR")}건)을 넘습니다.`,
        "too_many_rows",
      );
    }
    cleanData[name] = rows as BackupRow[];
  }

  if (depthOf(envelope, LIMITS.maxDepth) > LIMITS.maxDepth) {
    throw new BackupError(
      `백업 파일의 중첩 깊이가 상한(${LIMITS.maxDepth})을 넘습니다.`,
      "too_deep",
    );
  }

  const rowCounts =
    envelope.rowCounts &&
    typeof envelope.rowCounts === "object" &&
    !Array.isArray(envelope.rowCounts)
      ? (envelope.rowCounts as Record<string, number>)
      : {};

  return {
    backupVersion: version,
    createdAt: asString(envelope.createdAt, "createdAt"),
    applicationVersion:
      typeof envelope.applicationVersion === "string" ? envelope.applicationVersion : "unknown",
    ownerId: asString(envelope.ownerId, "ownerId"),
    checksum: asString(envelope.checksum, "checksum"),
    signature: asString(envelope.signature, "signature"),
    rowCounts,
    data: cleanData,
  };
}

/** 남의 백업 파일을 내 계정에 들이지 않는다. 파일의 ownerId는 서명으로
 *  묶여 있으므로 손으로 고쳐서 통과시킬 수 없다(서명 검증은 호출부에서). */
export function assertImportable(file: BackupFile, userId: string): void {
  if (!file.ownerId || !userId || file.ownerId !== userId) {
    throw new BackupError(
      "다른 사용자가 만든 백업 파일이라 복원할 수 없어요. 본인이 만든 백업만 사용할 수 있습니다.",
      "not_owner",
    );
  }
}

// ── 복원 계획 ───────────────────────────────────────────────────────────────

export type RestoreMode = "merge" | "replace";
export type SkipReason = "not_owned" | "missing_parent" | "invalid_row";

export type ExistingRow = { key: string; owner: string | null };
export type RestoreSkip = { table: BackupTableName; key: string; reason: SkipReason };

export type RestoreStep = {
  table: BackupTableName;
  inserts: BackupRow[];
  updates: BackupRow[];
  /** keyOf() 형식의 논리 키 목록 (replace 모드에서만 채워진다) */
  deletes: string[];
};

export type RestorePlan = {
  steps: RestoreStep[];
  skipped: RestoreSkip[];
  totals: { inserts: number; updates: number; deletes: number; skipped: number };
};

/** 행의 논리 키. 복합 키 테이블도 한 문자열로 다룰 수 있게 정규화한다. */
export function keyOf(spec: BackupTableSpec, row: BackupRow): string {
  return JSON.stringify(
    spec.key.map((column) => {
      const value = row[column];
      return value === undefined || value === null ? null : String(value);
    }),
  );
}

function pickAllowedColumns(spec: BackupTableSpec, row: BackupRow): BackupRow {
  const out: BackupRow = {};
  for (const column of spec.columns) {
    if (Object.prototype.hasOwnProperty.call(row, column)) out[column] = row[column];
  }
  return out;
}

/**
 * 백업 데이터와 현재 DB 상태를 대조해 무엇을 넣고/고치고/지울지 정한다.
 * DB에 손대지 않는 순수 함수라 권한 규칙을 그대로 테스트할 수 있다.
 *
 * 규칙:
 *  - 소유 컬럼은 파일 내용과 무관하게 언제나 `userId`로 덮어쓴다.
 *  - 이미 있는 행의 소유자가 내가 아니면(남의 것이거나 소유자 미상) 건드리지 않는다.
 *  - 부모가 DB에도 백업에도 없으면 NOT NULL FK는 행을 버리고, nullable FK는 null로 만든다.
 *  - replace 모드의 삭제 대상은 "내 소유이면서 백업에 없는 행"뿐이다.
 */
export function planRestore(input: {
  file: BackupFile;
  userId: string;
  mode: RestoreMode;
  tables: BackupTableName[];
  /** 테이블별 현재 DB 행의 논리 키와 소유자. 부모 존재 판정에도 쓰이므로
   *  부모 테이블은 소유자와 무관하게 전부 담겨야 한다. */
  existing: Record<BackupTableName, ExistingRow[]>;
}): RestorePlan {
  const { file, userId, mode, tables } = input;
  const selected = new Set(tables);

  const existingMaps = new Map<BackupTableName, Map<string, string | null>>();
  const availableKeys = new Map<BackupTableName, Set<string>>();
  for (const spec of BACKUP_TABLES) {
    const rows = input.existing[spec.name] ?? [];
    existingMaps.set(spec.name, new Map(rows.map((r) => [r.key, r.owner])));
    availableKeys.set(spec.name, new Set(rows.map((r) => r.key)));
  }

  const steps: RestoreStep[] = [];
  const skipped: RestoreSkip[] = [];

  for (const name of insertOrder()) {
    if (!selected.has(name)) continue;
    const spec = tableSpec(name);
    const existingMap = existingMaps.get(name)!;
    const available = availableKeys.get(name)!;

    const step: RestoreStep = { table: name, inserts: [], updates: [], deletes: [] };
    const keptKeys = new Set<string>();

    for (const raw of file.data[name] ?? []) {
      const row = pickAllowedColumns(spec, raw);
      // 소유권은 파일이 아니라 세션이 정한다.
      row[spec.ownerColumn] = userId;
      const key = keyOf(spec, row);

      if (spec.key.some((column) => row[column] === undefined || row[column] === null)) {
        skipped.push({ table: name, key, reason: "invalid_row" });
        continue;
      }

      const existingOwner = existingMap.has(key) ? existingMap.get(key)! : undefined;
      if (existingMap.has(key) && existingOwner !== userId) {
        // 남이 소유한(또는 소유자 미상 레거시) 행은 절대 덮어쓰지 않는다.
        skipped.push({ table: name, key, reason: "not_owned" });
        continue;
      }

      let dropped = false;
      for (const parent of spec.parents) {
        const value = row[parent.column];
        const parentSpec = tableSpec(parent.table);
        const resolved =
          value !== undefined &&
          value !== null &&
          availableKeys.get(parent.table)!.has(keyOf(parentSpec, { [parentSpec.key[0]]: value }));
        if (resolved) continue;
        if (parent.onMissing === "null") {
          row[parent.column] = null;
        } else {
          skipped.push({ table: name, key, reason: "missing_parent" });
          dropped = true;
          break;
        }
      }
      if (dropped) continue;

      keptKeys.add(key);
      available.add(key);
      if (existingMap.has(key)) step.updates.push(row);
      else step.inserts.push(row);
    }

    if (mode === "replace") {
      for (const [key, owner] of existingMap) {
        if (owner === userId && !keptKeys.has(key)) step.deletes.push(key);
      }
    }

    steps.push(step);
  }

  const totals = steps.reduce(
    (acc, step) => ({
      inserts: acc.inserts + step.inserts.length,
      updates: acc.updates + step.updates.length,
      deletes: acc.deletes + step.deletes.length,
      skipped: acc.skipped,
    }),
    { inserts: 0, updates: 0, deletes: 0, skipped: skipped.length },
  );

  return { steps, skipped, totals };
}
