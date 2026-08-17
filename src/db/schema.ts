import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ── better-auth tables (camelCase keys as the drizzle adapter expects) ──────

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // username plugin
  username: text("username").unique(),
  displayUsername: text("display_username"),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── App enums ────────────────────────────────────────────────────────────────

export const appRole = pgEnum("app_role", ["student", "teacher", "admin"]);
export const profileJob = pgEnum("profile_job", [
  "high_school",
  "university",
  "teacher",
  "worker",
  "other",
]);
export const teacherStatus = pgEnum("teacher_status", ["none", "pending", "approved", "rejected"]);

// ── App tables (snake_case keys — ported code and UI expect these shapes) ───
// Timestamps use mode "string" on purpose: every route component and server
// function downstream reads these as ISO strings (`new Date(row.created_at)`,
// `.slice(0, 10)`, direct JSON round-trips). Switching to Date objects would
// compile fine and break date handling across the whole app at runtime, so
// leave the mode alone unless you are changing those call sites too.

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

export const profiles = pgTable("profiles", {
  id: text("id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  role: appRole("role").notNull().default("student"),
  nickname: text("nickname"),
  real_name: text("real_name"),
  phone: text("phone"),
  job: profileJob("job"),
  learning_goal: text("learning_goal"),
  interest_categories: text("interest_categories").array().notNull().default([]),
  hsk_goal: integer("hsk_goal"),
  teacher_status: teacherStatus("teacher_status").notNull().default("none"),
  teacher_applied_at: ts("teacher_applied_at"),
  teacher_application_note: text("teacher_application_note"),
  teacher_school: text("teacher_school"),
  teacher_department: text("teacher_department"),
  last_active_at: ts("last_active_at"),
  // Personal widget panel layout — ordered widget ids (null = default set).
  widget_layout: jsonb("widget_layout").$type<Json>(),
  created_at: ts("created_at").notNull().defaultNow(),
  updated_at: ts("updated_at").notNull().defaultNow(),
});

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  level: text("level").notNull(),
  weeks: integer("weeks").notNull().default(4),
  thumbnail_url: text("thumbnail_url"),
  created_by: text("created_by"),
  created_at: ts("created_at").notNull().defaultNow(),
  updated_at: ts("updated_at").notNull().defaultNow(),
});

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    course_id: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    // One-line summary shown under the title in course/lesson lists. Nullable —
    // every lesson created before this column existed has none.
    description: text("description"),
    order_index: integer("order_index").notNull(),
    lesson_type: text("lesson_type"),
    level: text("level"),
    content_md: text("content_md"),
    dialogue_scene: text("dialogue_scene"),
    dialogues: jsonb("dialogues").$type<Json>().notNull().default([]),
    key_expressions: jsonb("key_expressions").$type<Json>().notNull().default([]),
    vocab_comparison: jsonb("vocab_comparison").$type<Json>().notNull().default([]),
    cultural_note: jsonb("cultural_note").$type<Json>().notNull().default({}),
    cultural_snippet: jsonb("cultural_snippet").$type<Json>().notNull().default({}),
    comic_panels: jsonb("comic_panels").$type<Json>().notNull().default([]),
    storybook_pages: jsonb("storybook_pages").$type<Json>().notNull().default([]),
    slides: jsonb("slides").$type<Json>().notNull().default([]),
    quiz: jsonb("quiz").$type<Json>().notNull().default([]),
    video: jsonb("video").$type<Json>().notNull().default({}),
    video_keywords: jsonb("video_keywords").$type<Json>().notNull().default([]),
    created_by: text("created_by"),
    created_at: ts("created_at").notNull().defaultNow(),
    updated_at: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("lessons_course_order_unique").on(t.course_id, t.order_index)],
);

export const curriculum_plans = pgTable("curriculum_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull().default(""),
  student_grade: text("student_grade").notNull(),
  duration_minutes: integer("duration_minutes").notNull().default(60),
  interests: text("interests").array().notNull().default([]),
  preferred_activities: text("preferred_activities").array().notNull().default([]),
  special_notes: text("special_notes"),
  lesson_objective_hint: text("lesson_objective_hint"),
  course_id: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
  lesson_id: uuid("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
  objectives: jsonb("objectives").$type<Json>().notNull().default([]),
  activities: jsonb("activities").$type<Json>().notNull().default([]),
  materials: jsonb("materials").$type<Json>().notNull().default([]),
  assessment: jsonb("assessment").$type<Json>().notNull().default({}),
  time_blocks: jsonb("time_blocks").$type<Json>().notNull().default([]),
  handout_markdown: text("handout_markdown").notNull().default(""),
  // AI-picked lessons/dramas to teach this plan with (연계 학습 콘텐츠) —
  // computed once on first view of the plan, cached here.
  // See curriculum.functions.ts.
  linked_content: jsonb("linked_content").$type<Json>(),
  created_by: text("created_by").notNull(),
  created_at: ts("created_at").notNull().defaultNow(),
  updated_at: ts("updated_at").notNull().defaultNow(),
});

export const dramas = pgTable("dramas", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  title_zh: text("title_zh"),
  description: text("description"),
  genre: text("genre"),
  level: text("level").notNull().default("beginner"),
  // Playback source: YouTube embed (youtube_*) or self-hosted file on the
  // volume (media_url, site-relative /media/...). At least one is set.
  youtube_url: text("youtube_url"),
  youtube_video_id: text("youtube_video_id"),
  media_url: text("media_url"),
  thumbnail_url: text("thumbnail_url"),
  duration_seconds: integer("duration_seconds"),
  has_captions: boolean("has_captions").notNull().default(false),
  scenes: jsonb("scenes").$type<Json>().notNull().default([]),
  created_by: text("created_by"),
  created_at: ts("created_at").notNull().defaultNow(),
  updated_at: ts("updated_at").notNull().defaultNow(),
});

// AI vocabulary study material, cached per word. The generation prompt takes
// nothing user-specific, so the result is identical for every learner —
// caching it globally means one Gemini call per word ever instead of one per
// open. Regeneration is restricted to teachers/admins so a student cannot
// swap out content everyone else sees.
export const vocab_practice_cache = pgTable("vocab_practice_cache", {
  zh: text("zh").primaryKey(),
  practice: jsonb("practice").$type<Json>().notNull(),
  generated_by: text("generated_by"),
  created_at: ts("created_at").notNull().defaultNow(),
  updated_at: ts("updated_at").notNull().defaultNow(),
});

export const songs = pgTable("songs", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  title_zh: text("title_zh"),
  artist: text("artist"),
  level: text("level").notNull().default("beginner"),
  source: text("source").notNull().default("suno"),
  status: text("status").notNull().default("draft"),
  topic: text("topic"),
  style: text("style"),
  // 필터 축 두 가지. 장르는 스타일 프리셋(또는 등록 폼)에서, 주제는 작사
  // 키워드에서 정해진다. 값은 src/lib/song-taxonomy.ts 참고.
  genre: text("genre"),
  theme: text("theme"),
  youtube_id: text("youtube_id"),
  external_url: text("external_url"),
  media_url: text("media_url"),
  video_url: text("video_url"),
  cover_url: text("cover_url"),
  suno_audio_id: text("suno_audio_id"),
  suno_audio_task_id: text("suno_audio_task_id"),
  suno_mp4_task_id: text("suno_mp4_task_id"),
  lyrics: jsonb("lyrics").$type<Json>().notNull().default([]),
  pinyin: jsonb("pinyin").$type<Json>().notNull().default([]),
  translation: jsonb("translation").$type<Json>().notNull().default([]),
  vocab: jsonb("vocab").$type<Json>().notNull().default([]),
  grammar_notes: jsonb("grammar_notes").$type<Json>().notNull().default([]),
  quiz: jsonb("quiz").$type<Json>().notNull().default([]),
  cultural_note: jsonb("cultural_note").$type<Json>(),
  // Why the last generation failed (Suno sensitive-word rejection, quota, …)
  // so the editor can fix the lyrics and retry instead of guessing.
  error: text("error"),
  // AI-computed links to related lessons (연계 학습) — generated once on
  // first view, cached here. See content-links.functions.ts.
  related_content: jsonb("related_content").$type<Json>(),
  created_by: text("created_by"),
  created_at: ts("created_at").notNull().defaultNow(),
  updated_at: ts("updated_at").notNull().defaultNow(),
});

export const vocabulary = pgTable(
  "vocabulary",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    zh: text("zh").notNull(),
    pinyin: text("pinyin"),
    ko: text("ko"),
    emoji: text("emoji"),
    hsk: integer("hsk"),
    source: text("source"),
    tags: text("tags").array().notNull().default([]),
    lesson_id: uuid("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    srs_due_at: ts("srs_due_at").notNull().defaultNow(),
    srs_interval_days: real("srs_interval_days").notNull().default(0),
    srs_ease: real("srs_ease").notNull().default(2.5),
    srs_reps: integer("srs_reps").notNull().default(0),
    srs_lapses: integer("srs_lapses").notNull().default(0),
    srs_last_reviewed_at: ts("srs_last_reviewed_at"),
    created_at: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("vocabulary_user_zh_unique").on(t.user_id, t.zh),
    index("idx_vocabulary_user_due").on(t.user_id, t.srs_due_at),
  ],
);

export const push_subscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  user_agent: text("user_agent"),
  last_pushed_at: ts("last_pushed_at"),
  created_at: ts("created_at").notNull().defaultNow(),
  updated_at: ts("updated_at").notNull().defaultNow(),
});

export const video_jobs = pgTable("video_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  created_by: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // Wizard settings snapshot (keyword, topic, audience, length, language,
  // focus, resolution, clip count, voice, subtitle mode, upload mode, ...)
  config: jsonb("config").$type<Json>().notNull(),
  status: text("status").notNull().default("queued"), // queued|running|awaiting_approval|uploading|done|failed
  step: text("step").notNull().default("대기 중"),
  progress: integer("progress").notNull().default(0), // 0-100
  error: text("error"),
  script: jsonb("script").$type<Json>(), // generated scenes w/ timings
  srt: text("srt"),
  video_path: text("video_path"), // relative path under MEDIA_DIR
  thumbnail_path: text("thumbnail_path"),
  youtube_video_id: text("youtube_video_id"),
  drama_id: uuid("drama_id").references(() => dramas.id, { onDelete: "set null" }),
  lesson_id: uuid("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
  created_at: ts("created_at").notNull().defaultNow(),
  updated_at: ts("updated_at").notNull().defaultNow(),
});

// Recurring video generation schedules. The in-process scheduler ticks every
// minute and creates a video_jobs row when a schedule is due (KST times).
export const video_schedules = pgTable("video_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  created_by: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Keywords rotate — one video per run using the next keyword.
  keywords: text("keywords").array().notNull(),
  next_keyword_index: integer("next_keyword_index").notNull().default(0),
  frequency: text("frequency").notNull().default("daily"), // daily | weekly
  weekdays: integer("weekdays").array().notNull().default([]), // 0=일 … 6=토 (weekly)
  time_kst: text("time_kst").notNull(), // "HH:MM"
  enabled: boolean("enabled").notNull().default(true),
  // Partial VideoJobConfig (no keyword/topic — filled per run)
  config: jsonb("config").$type<Json>().notNull(),
  last_run_at: ts("last_run_at"),
  created_at: ts("created_at").notNull().defaultNow(),
});

// Recurring AI song generation schedules. The in-process ticker creates a
// song (draft lyrics → Suno) when due; a background poller finishes it.
export const song_schedules = pgTable("song_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  created_by: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Keywords rotate — one song per run using the next keyword.
  keywords: text("keywords").array().notNull(),
  next_keyword_index: integer("next_keyword_index").notNull().default(0),
  frequency: text("frequency").notNull().default("weekly"), // daily | weekly
  weekdays: integer("weekdays").array().notNull().default([]), // 0=일 … 6=토
  time_kst: text("time_kst").notNull(), // "HH:MM"
  enabled: boolean("enabled").notNull().default(true),
  // Song generation settings.
  level: text("level").notNull().default("beginner"),
  style: text("style").notNull().default("cute mandarin pop"),
  vocal_gender: text("vocal_gender"), // "m" | "f" | null(자동)
  last_run_at: ts("last_run_at"),
  created_at: ts("created_at").notNull().defaultNow(),
});

// Per-user learning progress for 영상 학습 (dramas).
export const drama_progress = pgTable(
  "drama_progress",
  {
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    drama_id: uuid("drama_id")
      .notNull()
      .references(() => dramas.id, { onDelete: "cascade" }),
    last_seconds: real("last_seconds").notNull().default(0),
    completed_scenes: jsonb("completed_scenes").$type<Json>().notNull().default([]),
    quiz_scores: jsonb("quiz_scores").$type<Json>().notNull().default({}),
    updated_at: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("drama_progress_user_drama").on(t.user_id, t.drama_id)],
);

// Per-user daily learning activity counters (KST dates), one row per day.
// Powers the dashboard streak + activity grass chart.
export const learning_activity = pgTable(
  "learning_activity",
  {
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activity_date: text("activity_date").notNull(), // "YYYY-MM-DD" (KST)
    reviews: integer("reviews").notNull().default(0), // SRS 복습 채점
    words_added: integer("words_added").notNull().default(0),
    lessons: integer("lessons").notNull().default(0), // 레슨 탭 완료
    videos: integer("videos").notNull().default(0), // 영상 학습 장면 완료
    quizzes: integer("quizzes").notNull().default(0), // 퀴즈 제출
    updated_at: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("learning_activity_user_date").on(t.user_id, t.activity_date),
    index("idx_learning_activity_user").on(t.user_id, t.activity_date),
  ],
);

// Per-user lesson progress (server-side twin of the localStorage guest
// progress in the lesson page).
export const lesson_progress = pgTable(
  "lesson_progress",
  {
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lesson_id: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    completed_tabs: jsonb("completed_tabs").$type<Json>().notNull().default([]),
    quiz_correct: integer("quiz_correct"),
    quiz_total: integer("quiz_total"),
    completed_at: ts("completed_at"), // 퀴즈 70% 이상 통과 시각
    updated_at: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("lesson_progress_user_lesson").on(t.user_id, t.lesson_id)],
);

// Bring-your-own-key: any user (student included) can supply a personal
// Gemini key and then run on their own Google billing instead of ours, which
// is also what lifts them out of the shared daily quota. The key is stored
// sealed by secret-box.server.ts and is never sent back to the browser — the
// UI only ever gets `hint`.
export const user_api_keys = pgTable(
  "user_api_keys",
  {
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // "gemini"
    ciphertext: text("ciphertext").notNull(),
    hint: text("hint").notNull(), // last 4 characters, e.g. "…9fTa"
    created_at: ts("created_at").notNull().defaultNow(),
    updated_at: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.provider] })],
);

// Daily AI call counters keyed by the KST date. Only calls that spend the
// shared app key land here; a user running on their own key is never counted.
export const ai_usage_daily = pgTable(
  "ai_usage_daily",
  {
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    day: text("day").notNull(), // KST YYYY-MM-DD
    kind: text("kind").notNull(), // "assistant", …
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.day, t.kind] })],
);

// Per-owner data backups (관리자별 데이터 백업). One row per backup file; the
// file itself lives on the Railway volume next to the nightly full dump, under
// /data/backups/tenants/**, never under the public /media/* route.
//
// owner_id is always the authenticated user — every read/write path filters on
// it, so one admin's backups are invisible to another.
export const tenant_backups = pgTable(
  "tenant_backups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    owner_id: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // manual | pre_restore (복원 직전 자동 안전 백업) | imported (업로드)
    kind: text("kind").notNull().default("manual"),
    // pending | running | completed | failed
    status: text("status").notNull().default("pending"),
    label: text("label"),
    backup_version: integer("backup_version").notNull().default(1),
    app_version: text("app_version"),
    /** File name relative to the owner's backup directory. */
    file_name: text("file_name"),
    bytes: integer("bytes").notNull().default(0),
    total_rows: integer("total_rows").notNull().default(0),
    row_counts: jsonb("row_counts").$type<Json>().notNull().default({}),
    checksum: text("checksum"),
    error: text("error"),
    created_at: ts("created_at").notNull().defaultNow(),
    updated_at: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_tenant_backups_owner").on(t.owner_id, t.created_at)],
);

// Audit trail for backup/restore actions. backup_id deliberately has no foreign
// key: deleting a backup must not erase the record that it once existed.
export const backup_audit_log = pgTable(
  "backup_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    backup_id: uuid("backup_id"),
    // backup_created | backup_downloaded | backup_deleted | backup_imported |
    // restore_started | restore_completed | restore_failed
    action: text("action").notNull(),
    result: text("result").notNull().default("ok"), // ok | error
    /** Counts and error messages only — never backup contents. */
    detail: jsonb("detail").$type<Json>(),
    created_at: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_backup_audit_user").on(t.user_id, t.created_at)],
);

// Single-row style credential store (e.g. YouTube OAuth refresh token).
export const app_credentials = pgTable("app_credentials", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Json>().notNull(),
  updated_at: ts("updated_at").notNull().defaultNow(),
});

// Row types
export type Profile = typeof profiles.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type CurriculumPlan = typeof curriculum_plans.$inferSelect;
export type Drama = typeof dramas.$inferSelect;
export type Song = typeof songs.$inferSelect;
export type VocabRow = typeof vocabulary.$inferSelect;
export type PushSubscription = typeof push_subscriptions.$inferSelect;
export type VideoJob = typeof video_jobs.$inferSelect;
export type VideoSchedule = typeof video_schedules.$inferSelect;
export type LearningActivity = typeof learning_activity.$inferSelect;
export type LessonProgress = typeof lesson_progress.$inferSelect;
export type TenantBackup = typeof tenant_backups.$inferSelect;
export type BackupAuditLog = typeof backup_audit_log.$inferSelect;
