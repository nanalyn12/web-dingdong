// In-process video schedule ticker. SERVER-ONLY.
// Started lazily from src/server.ts on the first request; checks every minute
// whether an enabled schedule is due (KST) and creates a video job for it.
import { and, eq, inArray } from "drizzle-orm";

import { db, tables } from "@/db";
import type { Json } from "@/db/schema";

const TICK_MS = 60_000;

declare global {
  // eslint-disable-next-line no-var
  var __videoSchedulerStarted: boolean | undefined;
}

export function initVideoScheduler() {
  if (globalThis.__videoSchedulerStarted) return;
  globalThis.__videoSchedulerStarted = true;

  void recoverStaleJobs();
  setInterval(() => {
    void tick().catch((e) => console.error("[scheduler] tick failed:", e));
  }, TICK_MS);
  console.log("[scheduler] video scheduler started");
}

// Crash recovery: a server restart orphans running jobs; queued jobs need a
// worker kick.
async function recoverStaleJobs() {
  try {
    await db
      .update(tables.video_jobs)
      .set({
        status: "failed",
        error: "서버가 재시작되어 작업이 중단됐어요. 재시도해주세요.",
      })
      .where(eq(tables.video_jobs.status, "running"));
    const queued = await db
      .select({ id: tables.video_jobs.id })
      .from(tables.video_jobs)
      .where(eq(tables.video_jobs.status, "queued"))
      .limit(1);
    if (queued[0]) {
      const { kickVideoWorker } = await import("./pipeline.server");
      kickVideoWorker();
    }
  } catch (e) {
    console.error("[scheduler] recovery failed:", e);
  }
}

function nowKst(): { hhmm: string; weekday: number; dateKey: string } {
  const kst = new Date(Date.now() + 9 * 3600_000);
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return {
    hhmm: `${hh}:${mm}`,
    weekday: kst.getUTCDay(),
    dateKey: kst.toISOString().slice(0, 10),
  };
}

async function tick() {
  const { hhmm, weekday, dateKey } = nowKst();

  // Nightly DB backup piggybacks on the minute ticker (skips if today's
  // file already exists, so double-fires within the minute are harmless).
  const { isBackupTime, maybeRunDailyBackup } = await import("@/lib/backup.server");
  if (isBackupTime(hhmm)) {
    void maybeRunDailyBackup(dateKey).catch((e) =>
      console.error("[backup] failed:", e),
    );
  }

  const schedules = await db
    .select()
    .from(tables.video_schedules)
    .where(
      and(
        eq(tables.video_schedules.enabled, true),
        eq(tables.video_schedules.time_kst, hhmm),
      ),
    );

  for (const s of schedules) {
    if (s.frequency === "weekly" && !(s.weekdays ?? []).includes(weekday)) continue;
    // Skip if already ran today (tick can fire twice within the same minute
    // across restarts; last_run_at is stored in UTC ISO).
    if (s.last_run_at) {
      const lastKst = new Date(new Date(s.last_run_at).getTime() + 9 * 3600_000)
        .toISOString()
        .slice(0, 10);
      if (lastKst === dateKey) continue;
    }
    await runScheduleOnce(s.id);
  }
}

/** Creates the schedule's jobs (countPerRun, rotating keywords — one keyword
 *  per job). Exported for the "지금 실행" button; returns the first job id. */
export async function runScheduleOnce(scheduleId: string): Promise<string> {
  const rows = await db
    .select()
    .from(tables.video_schedules)
    .where(eq(tables.video_schedules.id, scheduleId))
    .limit(1);
  const s = rows[0];
  if (!s) throw new Error("예약을 찾을 수 없습니다.");
  const keywords = s.keywords ?? [];
  if (keywords.length === 0) throw new Error("키워드가 비어 있습니다.");

  // countPerRun lives in the schedule's config but is not part of the job
  // config — strip it before building jobs.
  const { countPerRun, ...base } = (s.config ?? {}) as Record<string, unknown>;
  const count = Math.min(10, Math.max(1, Number(countPerRun) || 1));
  const idx = s.next_keyword_index % keywords.length;

  const jobIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const keyword = keywords[(idx + i) % keywords.length];
    const config = {
      ...base,
      keyword,
      topic: "", // empty → the script generator picks a topic from the keyword
    };
    const [job] = await db
      .insert(tables.video_jobs)
      .values({
        created_by: s.created_by,
        config: config as unknown as Json,
      })
      .returning({ id: tables.video_jobs.id });
    jobIds.push(job.id);
  }

  await db
    .update(tables.video_schedules)
    .set({
      next_keyword_index: (idx + count) % keywords.length,
      last_run_at: new Date().toISOString(),
    })
    .where(eq(tables.video_schedules.id, scheduleId));

  const { kickVideoWorker } = await import("./pipeline.server");
  kickVideoWorker();
  console.log(
    `[scheduler] "${s.name}" → ${jobIds.length}개 작업 (키워드: ${keywords[idx]}${count > 1 ? " 외" : ""})`,
  );
  return jobIds[0];
}

export async function listSchedulesFor(userIds?: string[]): Promise<
  (typeof tables.video_schedules.$inferSelect)[]
> {
  if (userIds && userIds.length > 0) {
    return db
      .select()
      .from(tables.video_schedules)
      .where(inArray(tables.video_schedules.created_by, userIds));
  }
  return db.select().from(tables.video_schedules);
}
