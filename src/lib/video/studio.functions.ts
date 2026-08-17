import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/auth-middleware";
import { assertEditor } from "@/lib/courses.functions";
import type { Json, VideoJob } from "@/db/schema";
import type { VideoJobConfig } from "./config";

const ConfigInput = z.object({
  keyword: z.string().trim().min(1, "키워드를 입력하세요").max(60),
  topic: z.string().trim().min(1, "주제를 입력하거나 추천받으세요").max(120),
  audience: z.string().trim().min(1).max(80).default("중국어 초급 성인 학습자"),
  level: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  lengthSeconds: z.number().int().min(30).max(300),
  language: z.enum(["ko", "zh"]),
  focus: z.enum(["culture", "grammar", "entertainment", "daily"]),
  resolution: z.enum(["1280x720", "1920x1080"]),
  clipCount: z.number().int().min(3).max(20),
  voice: z.string().min(1),
  burnSubtitles: z.boolean().default(true),
  uploadMode: z.enum(["auto", "approval", "web"]),
  privacy: z.enum(["private", "unlisted", "public"]).default("private"),
  courseId: z.string().uuid().nullable().optional(),
  newCourseTitle: z.string().trim().max(80).optional(),
  speakingRate: z.number().min(0.7).max(1.3).optional(),
  repeatZh: z.boolean().optional(),
  bgm: z.boolean().default(true),
});

const CreateInput = z.object({
  config: ConfigInput,
  count: z.number().int().min(1).max(20).default(1),
});

export const createVideoJobs = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => CreateInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    const ids: string[] = [];
    for (let i = 0; i < data.count; i++) {
      const [row] = await db
        .insert(tables.video_jobs)
        .values({
          created_by: context.userId,
          config: data.config as unknown as Json,
        })
        .returning({ id: tables.video_jobs.id });
      ids.push(row.id);
    }
    const { kickVideoWorker } = await import("./pipeline.server");
    kickVideoWorker();
    return { ids };
  });

export const listVideoJobs = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<VideoJob[]> => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    const rows = await db
      .select()
      .from(tables.video_jobs)
      .orderBy(desc(tables.video_jobs.created_at))
      .limit(30);
    return rows;
  });

const IdInput = z.object({ id: z.string().uuid() });

export const approveVideoUpload = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => IdInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { uploadAndFinalize } = await import("./pipeline.server");
    // Fire and forget — UI polls job status.
    void uploadAndFinalize(data.id).catch(() => {});
    return { ok: true };
  });

export const retryVideoJob = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => IdInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    const rows = await db
      .select()
      .from(tables.video_jobs)
      .where(eq(tables.video_jobs.id, data.id))
      .limit(1);
    const job = rows[0];
    if (!job) throw new Error("작업을 찾을 수 없습니다.");
    if (job.status !== "failed") throw new Error("실패한 작업만 재시도할 수 있어요.");
    // Rendered video already exists → only the upload phase failed.
    if (job.video_path && job.error?.startsWith("업로드/콘텐츠")) {
      const { uploadAndFinalize } = await import("./pipeline.server");
      await db
        .update(tables.video_jobs)
        .set({ error: null })
        .where(eq(tables.video_jobs.id, data.id));
      void uploadAndFinalize(data.id).catch(() => {});
    } else {
      await db
        .update(tables.video_jobs)
        .set({ status: "queued", error: null, progress: 0, step: "대기 중" })
        .where(eq(tables.video_jobs.id, data.id));
      const { kickVideoWorker } = await import("./pipeline.server");
      kickVideoWorker();
    }
    return { ok: true };
  });

export const deleteVideoJob = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => IdInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    const rows = await db
      .select({
        video_path: tables.video_jobs.video_path,
        thumbnail_path: tables.video_jobs.thumbnail_path,
      })
      .from(tables.video_jobs)
      .where(eq(tables.video_jobs.id, data.id))
      .limit(1);
    await db.delete(tables.video_jobs).where(eq(tables.video_jobs.id, data.id));
    // Clean media files. Files under dramas/ are owned by the published
    // drama (web-only mode) — deleting the job entry must not break it.
    if (rows[0]) {
      const { rm } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const { getMediaDir } = await import("@/lib/suno.server");
      for (const p of [rows[0].video_path, rows[0].thumbnail_path]) {
        if (p && !p.startsWith("dramas/")) {
          await rm(join(getMediaDir(), p), { force: true }).catch(() => {});
        }
      }
    }
    return { ok: true };
  });

export const getYouTubeStatus = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    await assertEditor(context.userId);
    const { youtubeConnected } = await import("./youtube.server");
    return { connected: await youtubeConnected() };
  });

// ── 웹 전용 영상 → YouTube 이전 ─────────────────────────────────────────────

/** 볼륨에서 재생 중인(웹 전용) 드라마 목록 — 이전 대상. */
export const listWebHostedVideos = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    await assertEditor(context.userId);
    const { listWebHostedDramas } = await import("./rehost.server");
    return await listWebHostedDramas();
  });

/** 웹 전용 영상을 YouTube로 올리고 볼륨을 비운다. 한 번에 batch개씩 —
 * 업로드는 느리고 서버 요청 타임아웃이 있으니 여러 번 나눠 호출한다. */
export const rehostWebHostedVideos = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) =>
    z.object({ batch: z.number().int().min(1).max(10).default(3) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { youtubeConnected } = await import("./youtube.server");
    if (!(await youtubeConnected())) {
      throw new Error("YouTube가 연결되어 있지 않아요. 먼저 연결해주세요.");
    }
    const { rehostWebHostedDramas } = await import("./rehost.server");
    const results = await rehostWebHostedDramas(data.batch);
    const { listWebHostedDramas } = await import("./rehost.server");
    return { results, remaining: (await listWebHostedDramas()).length };
  });

// ── 예약·반복 ────────────────────────────────────────────────────────────────

const ScheduleConfigInput = ConfigInput.omit({ keyword: true, topic: true }).extend({
  // 실행 1회당 생성할 영상 수 (키워드를 순서대로 하나씩 소비).
  countPerRun: z.number().int().min(1).max(10).default(1),
});

const ScheduleInput = z.object({
  name: z.string().trim().min(1, "예약 이름을 입력하세요").max(60),
  keywords: z
    .array(z.string().trim().min(1).max(60))
    .min(1, "키워드를 1개 이상 입력하세요")
    .max(50),
  frequency: z.enum(["daily", "weekly"]),
  weekdays: z.array(z.number().int().min(0).max(6)).default([]),
  time_kst: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "시간은 HH:MM 형식"),
  config: ScheduleConfigInput,
});

export const createVideoSchedule = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => ScheduleInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    if (data.frequency === "weekly" && data.weekdays.length === 0) {
      throw new Error("매주 반복은 요일을 1개 이상 선택하세요.");
    }
    const { db, tables } = await import("@/db");
    const [row] = await db
      .insert(tables.video_schedules)
      .values({
        created_by: context.userId,
        name: data.name,
        keywords: data.keywords,
        frequency: data.frequency,
        weekdays: data.weekdays,
        time_kst: data.time_kst,
        config: data.config as unknown as Json,
      })
      .returning({ id: tables.video_schedules.id });
    return { id: row.id };
  });

const UpdateScheduleInput = ScheduleInput.extend({ id: z.string().uuid() });

export const updateVideoSchedule = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => UpdateScheduleInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    if (data.frequency === "weekly" && data.weekdays.length === 0) {
      throw new Error("매주 반복은 요일을 1개 이상 선택하세요.");
    }
    const { db, tables } = await import("@/db");
    const [row] = await db
      .update(tables.video_schedules)
      .set({
        name: data.name,
        keywords: data.keywords,
        frequency: data.frequency,
        weekdays: data.weekdays,
        time_kst: data.time_kst,
        config: data.config as unknown as Json,
        // Keyword list may have changed — restart the rotation.
        next_keyword_index: 0,
      })
      .where(eq(tables.video_schedules.id, data.id))
      .returning({ id: tables.video_schedules.id });
    if (!row) throw new Error("예약을 찾을 수 없습니다.");
    return { ok: true as const };
  });

export const listVideoSchedules = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    return db
      .select()
      .from(tables.video_schedules)
      .orderBy(desc(tables.video_schedules.created_at));
  });

export const toggleVideoSchedule = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    await db
      .update(tables.video_schedules)
      .set({ enabled: data.enabled })
      .where(eq(tables.video_schedules.id, data.id));
    return { ok: true };
  });

export const deleteVideoSchedule = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => IdInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    await db.delete(tables.video_schedules).where(eq(tables.video_schedules.id, data.id));
    return { ok: true };
  });

export const runVideoScheduleNow = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => IdInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { runScheduleOnce } = await import("./scheduler.server");
    const jobId = await runScheduleOnce(data.id);
    return { jobId };
  });

const SuggestInput = z.object({
  keyword: z.string().trim().min(1).max(60),
  focus: z.enum(["culture", "grammar", "entertainment", "daily"]),
  audience: z.string().trim().max(80).default("중국어 초급 성인 학습자"),
});

export const suggestVideoTopics = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => SuggestInput.parse(i))
  .handler(async ({ data, context }): Promise<string[]> => {
    await assertEditor(context.userId);
    const { createTextProviderFor } = await import("@/lib/ai-gateway.server");
    const { generateText } = await import("ai");
    const gateway = await createTextProviderFor(context.userId);
    const focusKo = {
      culture: "중국 문화",
      grammar: "중국어 어법",
      entertainment: "중국 연예/트렌드",
      daily: "일상 회화",
    }[data.focus];
    const { text } = await generateText({
      model: gateway("google/gemini-2.5-flash"),
      prompt: `키워드 "${data.keyword}", 분야 "${focusKo}", 타겟 "${data.audience}"에 맞는 유튜브 교육 영상 주제 5개를 제안해줘. 클릭하고 싶은 구체적인 제목형 주제로. JSON 배열만 출력: ["주제1","주제2","주제3","주제4","주제5"]`,
      temperature: 0.8,
    });
    const s = text.indexOf("[");
    const e = text.lastIndexOf("]");
    if (s < 0 || e <= s) throw new Error("주제 추천 파싱 실패");
    return (JSON.parse(text.slice(s, e + 1)) as string[]).slice(0, 5);
  });
