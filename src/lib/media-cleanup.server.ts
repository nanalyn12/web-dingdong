// 볼륨에 남은 고아 미디어 파일 청소. SERVER-ONLY.
//
// 앱의 삭제 경로를 거치지 않고 행이 사라지면(직접 DB 편집, 크래시 잔여) 그
// 행이 소유하던 mp4·썸네일이 볼륨에 영원히 남는다. 영상 렌더는 여유 공간이
// 없으면 통째로 실패하므로(pipeline.server.ts의 assertRenderSpace) 이 청소는
// 있으면 좋은 정도가 아니라 렌더가 계속 돌게 하는 조건이다.
//
// 어떤 파일을 지울지의 판정은 순수 모듈 media-cleanup.ts에 있다.
import { isOrphanMediaFile } from "./media-cleanup";

declare global {
  var __mediaCleanupStarted: boolean | undefined;
}

/**
 * DB 행이 사라진 미디어 파일을 지운다.
 *  - `videos/<jobId>.(mp4|-thumb.jpg)`  → video_jobs 소유
 *  - `dramas/<dramaId>.(mp4|-thumb.jpg)` → dramas 소유 (웹 전용 재생)
 *
 * 서버 기동당 한 번, Railway에서만 — 볼륨이 거기 있다. 로컬은 프로덕션
 * DATABASE_URL을 공유하므로, 여기서 돌리면 로컬에 없는 파일을 기준으로
 * 판단하게 된다.
 */
export async function cleanupOrphanVideoFiles(): Promise<void> {
  if (globalThis.__mediaCleanupStarted) return;
  globalThis.__mediaCleanupStarted = true;

  if (!process.env.RAILWAY_ENVIRONMENT && !process.env.RAILWAY_PROJECT_ID) return;

  const { readdir, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { getMediaDir } = await import("@/lib/suno.server");
  const { db, tables } = await import("@/db");

  async function sweep(subdir: string, liveIds: Set<string>): Promise<number> {
    const dir = join(getMediaDir(), subdir);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      return 0; // dir not created yet
    }
    let removed = 0;
    for (const file of files) {
      if (!isOrphanMediaFile(file, liveIds)) continue;
      await rm(join(dir, file), { force: true }).catch(() => {});
      removed++;
    }
    return removed;
  }

  const jobs = await db.select({ id: tables.video_jobs.id }).from(tables.video_jobs);
  const dramas = await db.select({ id: tables.dramas.id }).from(tables.dramas);

  const removed =
    (await sweep("videos", new Set(jobs.map((r) => r.id.toLowerCase())))) +
    (await sweep("dramas", new Set(dramas.map((r) => r.id.toLowerCase()))));

  if (removed) {
    console.log(`[media-cleanup] removed ${removed} orphaned media file(s)`);
  }
}
