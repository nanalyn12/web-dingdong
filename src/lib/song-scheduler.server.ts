// In-process AI-song scheduler + Suno poller. SERVER-ONLY.
// Started from the video scheduler init (shares the same lifecycle). Two jobs:
//  1. A minute ticker that runs due song_schedules (draft lyrics → Suno submit).
//  2. A poller that advances songs still generating on Suno (audio then MP4),
//     so scheduled songs finish without any browser open.
import { and, eq, inArray } from "drizzle-orm";

import { db, tables } from "@/db";

const TICK_MS = 60_000;
const POLL_MS = 20_000;

declare global {
  // eslint-disable-next-line no-var
  var __songSchedulerStarted: boolean | undefined;
}

export function initSongScheduler() {
  if (globalThis.__songSchedulerStarted) return;
  globalThis.__songSchedulerStarted = true;

  setInterval(() => {
    void songTick().catch((e) => console.error("[song-sched] tick failed:", e));
  }, TICK_MS);
  setInterval(() => {
    void pollGeneratingSongs().catch((e) =>
      console.error("[song-sched] poll failed:", e),
    );
  }, POLL_MS);
  console.log("[song-sched] song scheduler + Suno poller started");
}

function nowKst(): { hhmm: string; weekday: number; dateKey: string } {
  const kst = new Date(Date.now() + 9 * 3600_000);
  return {
    hhmm: `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`,
    weekday: kst.getUTCDay(),
    dateKey: kst.toISOString().slice(0, 10),
  };
}

async function songTick() {
  const { hhmm, weekday, dateKey } = nowKst();
  const schedules = await db
    .select()
    .from(tables.song_schedules)
    .where(
      and(
        eq(tables.song_schedules.enabled, true),
        eq(tables.song_schedules.time_kst, hhmm),
      ),
    );
  for (const s of schedules) {
    if (s.frequency === "weekly" && !(s.weekdays ?? []).includes(weekday)) continue;
    if (s.last_run_at) {
      const lastKst = new Date(new Date(s.last_run_at).getTime() + 9 * 3600_000)
        .toISOString()
        .slice(0, 10);
      if (lastKst === dateKey) continue; // already ran today
    }
    await runSongScheduleOnce(s.id).catch((e) =>
      console.error(`[song-sched] "${s.name}" 실행 실패:`, e),
    );
  }
}

/** Create one song from a schedule (rotating keywords). Exported for the
 *  "지금 실행" button. Returns the created songId. */
export async function runSongScheduleOnce(scheduleId: string): Promise<string> {
  const rows = await db
    .select()
    .from(tables.song_schedules)
    .where(eq(tables.song_schedules.id, scheduleId))
    .limit(1);
  const s = rows[0];
  if (!s) throw new Error("예약을 찾을 수 없습니다.");
  const keywords = s.keywords ?? [];
  if (keywords.length === 0) throw new Error("키워드가 비어 있습니다.");

  const idx = s.next_keyword_index % keywords.length;
  const keyword = keywords[idx];
  const level = (["beginner", "intermediate", "advanced"].includes(s.level)
    ? s.level
    : "beginner") as "beginner" | "intermediate" | "advanced";

  const { draftSongInternal, submitSongToSuno } = await import(
    "@/lib/songs.functions"
  );
  const draft = await draftSongInternal({ keyword, level, style: s.style });
  const { songId } = await submitSongToSuno({
    draft,
    level,
    style: s.style,
    topic: keyword,
    userId: s.created_by,
    vocalGender:
      s.vocal_gender === "m" || s.vocal_gender === "f" ? s.vocal_gender : undefined,
  });

  await db
    .update(tables.song_schedules)
    .set({
      next_keyword_index: (idx + 1) % keywords.length,
      last_run_at: new Date().toISOString(),
    })
    .where(eq(tables.song_schedules.id, scheduleId));

  console.log(`[song-sched] "${s.name}" → song ${songId} (키워드: ${keyword})`);
  return songId;
}

// Advance every song still generating on Suno. Bounded per tick.
let pollBusy = false;
async function pollGeneratingSongs() {
  if (pollBusy) return;
  pollBusy = true;
  try {
    const songs = await db
      .select()
      .from(tables.songs)
      .where(
        inArray(tables.songs.status, ["generating_audio", "generating_video"]),
      )
      .limit(10);
    if (songs.length === 0) return;

    const { advanceSongAudio, advanceSongMp4 } = await import(
      "@/lib/songs.functions"
    );
    for (const row of songs) {
      try {
        if (row.status === "generating_audio") {
          await advanceSongAudio(row as never);
        } else if (row.status === "generating_video") {
          await advanceSongMp4(row as never);
        }
      } catch (e) {
        // advance* sets failed_* on hard errors; transient errors just retry
        // next tick. Log and continue with the other songs.
        console.warn(`[song-sched] poll ${row.id.slice(0, 8)}:`, e);
      }
    }
  } finally {
    pollBusy = false;
  }
}
