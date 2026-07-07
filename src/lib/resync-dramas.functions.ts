import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateSceneData } from "@/lib/generate-drama.functions";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (data?.role !== "admin") throw new Error("관리자만 사용할 수 있어요.");
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
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("dramas")
      .select("id, title, youtube_url, level, genre")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("드라마를 찾을 수 없습니다.");

    const result = await generateSceneData({
      youtubeUrl: row.youtube_url as string,
      level: row.level as "beginner" | "intermediate" | "advanced",
      genre: (row.genre as string | null) ?? "",
      title: (row.title as string | null) ?? "",
    });
    if (!result.hasCaptions) {
      return { id: data.id, updated: false, reason: "no-captions" as const };
    }

    const { error: uErr } = await supabaseAdmin
      .from("dramas")
      .update({
        scenes: result.parsed.scenes as unknown as import(
          "@/integrations/supabase/types"
        ).Json,
        has_captions: true,
        duration_seconds:
          result.parsed.duration_seconds ??
          (undefined as unknown as number | null | undefined),
      })
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);
    return { id: data.id, updated: true, reason: "ok" as const };
  });

// Scan all dramas with has_captions=false, and resync those whose YouTube
// video actually exposes a caption track. Returns a per-drama summary.
export const resyncAllDramasWithoutCaptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("dramas")
      .select("id, title, youtube_video_id, youtube_url, level, genre")
      .eq("has_captions", false)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const results: {
      id: string;
      title: string;
      status: "updated" | "no-captions" | "error";
      message?: string;
    }[] = [];

    for (const r of rows ?? []) {
      const title = (r.title as string) ?? "(제목 없음)";
      const videoId = (r.youtube_video_id as string) ?? "";
      try {
        // Cheap pre-check to skip AI calls when captions clearly absent.
        if (!videoId || !(await videoHasCaptions(videoId))) {
          results.push({ id: r.id as string, title, status: "no-captions" });
          continue;
        }
        const gen = await generateSceneData({
          youtubeUrl: r.youtube_url as string,
          level: r.level as "beginner" | "intermediate" | "advanced",
          genre: (r.genre as string | null) ?? "",
          title,
        });
        if (!gen.hasCaptions) {
          results.push({ id: r.id as string, title, status: "no-captions" });
          continue;
        }
        const { error: uErr } = await supabaseAdmin
          .from("dramas")
          .update({
            scenes: gen.parsed.scenes as unknown as import(
              "@/integrations/supabase/types"
            ).Json,
            has_captions: true,
          })
          .eq("id", r.id as string);
        if (uErr) throw new Error(uErr.message);
        results.push({ id: r.id as string, title, status: "updated" });
      } catch (e) {
        results.push({
          id: r.id as string,
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
