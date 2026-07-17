import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/auth-middleware";
import { generateSceneData } from "@/lib/generate-drama.functions";
import type { Json } from "@/db/schema";

async function assertAdmin(userId: string) {
  const { db, tables } = await import("@/db");
  const rows = await db
    .select({ role: tables.profiles.role })
    .from(tables.profiles)
    .where(eq(tables.profiles.id, userId))
    .limit(1);
  if (rows[0]?.role !== "admin") throw new Error("관리자만 사용할 수 있어요.");
}

// Peek: check whether captions exist for a video without calling the AI.
async function videoHasCaptions(videoId: string): Promise<boolean> {
  try {
    const { fetchYouTubeCaptions } = await import("./youtube-captions.server");
    const caps = await fetchYouTubeCaptions(videoId);
    return !!caps && caps.segments.length > 0;
  } catch {
    return false;
  }
}

// Resync a single drama by re-running AI generation with real caption
// timestamps. Only overwrites scenes when captions are actually found.
export const resyncDramaCaptions = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { db, tables } = await import("@/db");
    const rows = await db
      .select({
        id: tables.dramas.id,
        title: tables.dramas.title,
        youtube_url: tables.dramas.youtube_url,
        level: tables.dramas.level,
        genre: tables.dramas.genre,
      })
      .from(tables.dramas)
      .where(eq(tables.dramas.id, data.id))
      .limit(1);
    const row = rows[0];
    if (!row) throw new Error("드라마를 찾을 수 없습니다.");
    if (!row.youtube_url) {
      throw new Error("유튜브 기반 드라마가 아니에요 (웹 전용 영상은 자막 재동기화 대상이 아닙니다).");
    }

    const result = await generateSceneData({
      youtubeUrl: row.youtube_url,
      level: row.level as "beginner" | "intermediate" | "advanced",
      genre: row.genre ?? "",
      title: row.title ?? "",
    });
    if (!result.hasCaptions) {
      return { id: data.id, updated: false, reason: "no-captions" as const };
    }

    await db
      .update(tables.dramas)
      .set({
        scenes: result.parsed.scenes as unknown as Json,
        has_captions: true,
        ...(result.parsed.duration_seconds != null
          ? { duration_seconds: result.parsed.duration_seconds }
          : {}),
      })
      .where(eq(tables.dramas.id, data.id));
    return { id: data.id, updated: true, reason: "ok" as const };
  });

// Scan all dramas with has_captions=false, and resync those whose YouTube
// video actually exposes a caption track. Returns a per-drama summary.
export const resyncAllDramasWithoutCaptions = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { db, tables } = await import("@/db");
    const rows = await db
      .select({
        id: tables.dramas.id,
        title: tables.dramas.title,
        youtube_video_id: tables.dramas.youtube_video_id,
        youtube_url: tables.dramas.youtube_url,
        level: tables.dramas.level,
        genre: tables.dramas.genre,
      })
      .from(tables.dramas)
      .where(eq(tables.dramas.has_captions, false))
      .orderBy(desc(tables.dramas.created_at));

    const results: {
      id: string;
      title: string;
      status: "updated" | "no-captions" | "error";
      message?: string;
    }[] = [];

    for (const r of rows) {
      const title = r.title ?? "(제목 없음)";
      const videoId = r.youtube_video_id ?? "";
      try {
        // Cheap pre-check to skip AI calls when captions clearly absent.
        if (!videoId || !(await videoHasCaptions(videoId))) {
          results.push({ id: r.id, title, status: "no-captions" });
          continue;
        }
        const gen = await generateSceneData({
          youtubeUrl: r.youtube_url ?? `https://www.youtube.com/watch?v=${videoId}`,
          level: r.level as "beginner" | "intermediate" | "advanced",
          genre: r.genre ?? "",
          title,
        });
        if (!gen.hasCaptions) {
          results.push({ id: r.id, title, status: "no-captions" });
          continue;
        }
        await db
          .update(tables.dramas)
          .set({
            scenes: gen.parsed.scenes as unknown as Json,
            has_captions: true,
          })
          .where(eq(tables.dramas.id, r.id));
        results.push({ id: r.id, title, status: "updated" });
      } catch (e) {
        results.push({
          id: r.id,
          title,
          status: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const updated = results.filter((r) => r.status === "updated").length;
    const skipped = results.filter((r) => r.status === "no-captions").length;
    const failed = results.filter((r) => r.status === "error").length;
    return { total: results.length, updated, skipped, failed, results };
  });
