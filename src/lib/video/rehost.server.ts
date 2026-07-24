// Move a self-hosted drama video onto YouTube. SERVER-ONLY.
//
// Web-only renders (uploadMode: "web", or the auth-expired fallback) keep their
// mp4 on the Railway volume forever. That is what filled the 500MB volume. This
// re-hosts an existing drama on YouTube after the fact: upload the file, point
// every reference at the video id, then free the bytes.
//
// The mp4 is the only copy — so nothing is deleted until the upload has
// returned a video id and the DB rows have been repointed. A crash between
// steps leaves the drama playable from the volume and the run can be repeated
// (already-migrated dramas are skipped).
import { eq } from "drizzle-orm";

import { db, tables } from "@/db";
import { getMediaDir } from "@/lib/suno.server";
import type { Json } from "@/db/schema";
import type { VideoJobConfig, VideoScript } from "./config";

export type RehostResult = {
  dramaId: string;
  title: string;
  status: "migrated" | "skipped" | "failed";
  videoId?: string;
  freedBytes?: number;
  reason?: string;
};

/** Dramas still playing from the volume, oldest first. */
export async function listWebHostedDramas(): Promise<
  { id: string; title: string; media_url: string }[]
> {
  const rows = await db
    .select({
      id: tables.dramas.id,
      title: tables.dramas.title,
      media_url: tables.dramas.media_url,
      created_at: tables.dramas.created_at,
    })
    .from(tables.dramas);
  return rows
    .filter((d) => d.media_url?.startsWith("/media/"))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((d) => ({ id: d.id, title: d.title, media_url: d.media_url! }));
}

/** Repoint any lesson whose video block plays this exact file.
 * 15 of the 18 web-only dramas are also a course lesson; missing these would
 * leave the lesson pointing at a file this function is about to delete. */
async function repointLessons(mediaUrl: string, videoId: string): Promise<number> {
  const lessons = await db
    .select({ id: tables.lessons.id, video: tables.lessons.video })
    .from(tables.lessons);
  let n = 0;
  for (const l of lessons) {
    const v = l.video as { media_url?: string; youtube_video_id?: string } | null;
    if (!v || v.media_url !== mediaUrl) continue;
    const { media_url: _drop, ...rest } = v;
    await db
      .update(tables.lessons)
      .set({ video: { ...rest, youtube_video_id: videoId } as unknown as Json })
      .where(eq(tables.lessons.id, l.id));
    n++;
  }
  return n;
}

/** Upload one drama's mp4 to YouTube and repoint drama + lessons + job at it.
 * Idempotent: a drama already on YouTube, or with no local file, is skipped. */
export async function rehostDramaOnYouTube(
  dramaId: string,
): Promise<RehostResult> {
  const { join } = await import("node:path");
  const { rm, stat } = await import("node:fs/promises");

  const [drama] = await db
    .select()
    .from(tables.dramas)
    .where(eq(tables.dramas.id, dramaId))
    .limit(1);
  if (!drama) return { dramaId, title: "", status: "failed", reason: "드라마 없음" };

  const base = { dramaId, title: drama.title };
  if (drama.youtube_video_id)
    return { ...base, status: "skipped", reason: "이미 YouTube에 있음" };
  if (!drama.media_url?.startsWith("/media/"))
    return { ...base, status: "skipped", reason: "로컬 파일 없음" };

  const relPath = drama.media_url.slice("/media/".length);
  const filePath = join(getMediaDir(), relPath);
  let freedBytes = 0;
  try {
    freedBytes = (await stat(filePath)).size;
  } catch {
    return { ...base, status: "failed", reason: "볼륨에 mp4가 없습니다" };
  }

  // The linked job carries the script, SRT and privacy choice. One of the 18
  // has no job row, so every use of it falls back to the drama itself.
  const [job] = await db
    .select()
    .from(tables.video_jobs)
    .where(eq(tables.video_jobs.drama_id, dramaId))
    .limit(1);
  const cfg = job?.config as unknown as VideoJobConfig | undefined;
  const script = job?.script as unknown as VideoScript | undefined;

  const { uploadToYouTube } = await import("./youtube.server");
  let videoId: string;
  try {
    videoId = await uploadToYouTube({
      filePath,
      thumbnailPath: drama.thumbnail_url?.startsWith("/media/")
        ? join(getMediaDir(), drama.thumbnail_url.slice("/media/".length))
        : undefined,
      title: script?.title ?? drama.title,
      description: script?.description ?? drama.description ?? "",
      tags: script?.tags ?? [],
      // Match how the video was originally published; these were all unlisted.
      privacy: cfg?.privacy ?? "unlisted",
    });
  } catch (e) {
    return {
      ...base,
      status: "failed",
      reason: e instanceof Error ? e.message : String(e),
    };
  }

  // Repoint everything BEFORE deleting the only copy of the file.
  await db
    .update(tables.dramas)
    .set({
      youtube_video_id: videoId,
      youtube_url: `https://www.youtube.com/watch?v=${videoId}`,
      media_url: null,
      // Keep the local thumbnail: YouTube serves a gray placeholder for
      // unlisted videos, and the jpg is ~100KB.
      updated_at: new Date().toISOString(),
    })
    .where(eq(tables.dramas.id, dramaId));

  const lessonsFixed = await repointLessons(drama.media_url, videoId);

  if (job) {
    await db
      .update(tables.video_jobs)
      .set({ youtube_video_id: videoId, video_path: null })
      .where(eq(tables.video_jobs.id, job.id));
  }

  // Best-effort extras, mirroring the normal upload path. None of these are
  // worth failing a migration that already succeeded.
  if (job?.srt) {
    try {
      const { uploadCaptionTrack } = await import("./youtube.server");
      await uploadCaptionTrack({
        videoId,
        srt: job.srt,
        language: cfg?.language === "zh" ? "zh-CN" : "ko",
        name: cfg?.language === "zh" ? "中文" : "한국어",
      });
    } catch (e) {
      console.warn(`[rehost ${dramaId.slice(0, 8)}] 자막 실패:`, e);
    }
  }
  try {
    const { updateVideoDescription, addToDingdongPlaylist, appBaseUrl } =
      await import("./youtube.server");
    const { bgmAttribution } = await import("./bgm.server");
    const learnUrl = `${appBaseUrl()}/dramas/${dramaId}`;
    const desc = script?.description ?? drama.description ?? "";
    await updateVideoDescription(
      videoId,
      script?.title ?? drama.title,
      `${desc}\n\n📚 딩동에서 이 영상으로 학습하기 (전체 대사·단어장·퀴즈):\n${learnUrl}${cfg ? bgmAttribution(cfg) : ""}`,
    );
    await addToDingdongPlaylist(videoId);
  } catch (e) {
    console.warn(`[rehost ${dramaId.slice(0, 8)}] 설명/재생목록 실패:`, e);
  }

  // Safe now — every reference points at YouTube.
  await rm(filePath, { force: true }).catch(() => {});

  console.log(
    `[rehost ${dramaId.slice(0, 8)}] → ${videoId} (레슨 ${lessonsFixed}개 갱신, ${Math.round(freedBytes / 1e6)}MB 확보)`,
  );
  return { ...base, status: "migrated", videoId, freedBytes };
}

/** Migrate up to `limit` web-hosted dramas, oldest first.
 * Sequential on purpose: uploads are large and the worker box is shared with
 * the render pipeline. Stops early on repeated failures so a broken YouTube
 * connection doesn't burn the whole daily upload allowance. */
export async function rehostWebHostedDramas(limit: number): Promise<RehostResult[]> {
  const pending = await listWebHostedDramas();
  const results: RehostResult[] = [];
  let consecutiveFailures = 0;
  for (const d of pending.slice(0, limit)) {
    const r = await rehostDramaOnYouTube(d.id);
    results.push(r);
    consecutiveFailures = r.status === "failed" ? consecutiveFailures + 1 : 0;
    if (consecutiveFailures >= 2) {
      console.warn("[rehost] 연속 실패 — 중단");
      break;
    }
  }
  return results;
}
