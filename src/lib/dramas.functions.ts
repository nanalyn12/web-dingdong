import { createServerFn } from "@tanstack/react-start";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/auth-middleware";
import { assertEditor, getRole } from "@/lib/courses.functions";

export type DramaScene = {
  index: number;
  title: string;
  start_seconds: number;
  end_seconds: number;
  summary_ko: string;
  key_lines: {
    zh: string;
    pinyin?: string;
    ko?: string;
    speaker?: string;
    time_seconds?: number;
  }[];
  vocab: { zh: string; pinyin?: string; ko?: string; emoji?: string; hsk?: number }[];
  culture_tip?: { title: string; body: string };
  quiz: {
    type: "choice" | "fill";
    question: string;
    options?: string[];
    answer: string;
    explanation?: string;
  }[];
};

export type DramaRow = {
  id: string;
  title: string;
  title_zh: string | null;
  description: string | null;
  level: "beginner" | "intermediate" | "advanced";
  youtube_url: string | null;
  youtube_video_id: string | null;
  media_url: string | null; // self-hosted playback (/media/dramas/...)
  thumbnail_url: string | null;
  duration_seconds: number | null;
  genre: string | null;
  scenes: DramaScene[];
  has_captions: boolean;
  created_by: string | null;
  created_at: string;
};

/** What the library grid actually renders. Deliberately excludes `scenes`:
 * the card only needs how many there are, and shipping the full jsonb for
 * every drama made the list response grow past 2 MB once the scheduler had
 * produced a hundred-odd videos. */
export type DramaListRow = Omit<DramaRow, "scenes"> & {
  scene_count: number;
  // Narration language of the video job that produced this drama ("ko" | "zh").
  // Null for the handful written by hand rather than generated.
  narration_language: string | null;
};

export const listDramas = createServerFn({ method: "GET" }).handler(
  async (): Promise<DramaListRow[]> => {
    const { db, tables } = await import("@/db");
    const rows = await db
      .select({
        id: tables.dramas.id,
        title: tables.dramas.title,
        title_zh: tables.dramas.title_zh,
        description: tables.dramas.description,
        level: tables.dramas.level,
        youtube_url: tables.dramas.youtube_url,
        youtube_video_id: tables.dramas.youtube_video_id,
        media_url: tables.dramas.media_url,
        thumbnail_url: tables.dramas.thumbnail_url,
        duration_seconds: tables.dramas.duration_seconds,
        genre: tables.dramas.genre,
        has_captions: tables.dramas.has_captions,
        created_by: tables.dramas.created_by,
        created_at: tables.dramas.created_at,
        // jsonb_array_length throws on a non-array, so guard the type first.
        scene_count: sql<number>`case when jsonb_typeof(${tables.dramas.scenes}) = 'array'
          then jsonb_array_length(${tables.dramas.scenes}) else 0 end`.mapWith(Number),
        // A correlated subquery rather than a join: no video job today points at
        // the same drama twice, but a join would silently duplicate rows if one
        // ever did, and the library is the page that must not grow phantom cards.
        //
        // The outer column is written out rather than interpolated: Drizzle
        // renders `${tables.dramas.id}` unqualified as "id", which the subquery
        // then resolves against video_jobs, making the condition j.drama_id =
        // j.id — always false, and null for every row with no error.
        narration_language: sql<
          string | null
        >`(select j.config->>'language' from video_jobs j where j.drama_id = "dramas"."id" limit 1)`,
      })
      .from(tables.dramas)
      .orderBy(desc(tables.dramas.created_at));
    return rows as unknown as DramaListRow[];
  },
);

export const getDrama = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<DramaRow> => {
    const { db, tables } = await import("@/db");
    const rows = await db
      .select()
      .from(tables.dramas)
      .where(eq(tables.dramas.id, data.id))
      .limit(1);
    if (!rows[0]) throw new Error("드라마를 찾을 수 없습니다.");
    return rows[0] as unknown as DramaRow;
  });

export const deleteDrama = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { db, tables } = await import("@/db");
    const isAdmin = (await getRole(context.userId)) === "admin";
    const rows = await db
      .select({
        created_by: tables.dramas.created_by,
        media_url: tables.dramas.media_url,
        thumbnail_url: tables.dramas.thumbnail_url,
      })
      .from(tables.dramas)
      .where(eq(tables.dramas.id, data.id))
      .limit(1);
    if (!rows[0]) throw new Error("드라마를 찾을 수 없습니다.");
    if (!isAdmin && rows[0].created_by !== context.userId) {
      throw new Error("본인이 만든 드라마만 삭제할 수 있어요.");
    }
    await db.delete(tables.dramas).where(eq(tables.dramas.id, data.id));
    // Web-only dramas own their files on the volume — remove them too.
    const { rm } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { getMediaDir } = await import("@/lib/suno.server");
    for (const u of [rows[0].media_url, rows[0].thumbnail_url]) {
      if (u?.startsWith("/media/dramas/")) {
        await rm(join(getMediaDir(), u.slice("/media/".length)), { force: true }).catch(() => {});
      }
    }
    return { ok: true as const };
  });

/** Fix a drama's 난이도 after the fact.
 *
 * Registration picks the level once from a dropdown that defaults to 초급, so
 * bulk-generated videos ended up labelled 초급 whether or not they were — with
 * no way to correct one short of editing the database. Deliberately narrow:
 * it writes `level` and nothing else. */
export const updateDramaLevel = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        level: z.enum(["beginner", "intermediate", "advanced"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    const rows = await db
      .select({ id: tables.dramas.id })
      .from(tables.dramas)
      .where(eq(tables.dramas.id, data.id))
      .limit(1);
    if (!rows[0]) throw new Error("드라마를 찾을 수 없습니다.");

    await db.update(tables.dramas).set({ level: data.level }).where(eq(tables.dramas.id, data.id));
    return { ok: true as const, level: data.level };
  });

export const updateDramaLineTime = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        sceneIndex: z.number().int().min(0),
        lineIndex: z.number().int().min(0),
        timeSeconds: z.number().int().min(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");

    const rows = await db
      .select({ scenes: tables.dramas.scenes })
      .from(tables.dramas)
      .where(eq(tables.dramas.id, data.id))
      .limit(1);
    if (!rows[0]) throw new Error("드라마를 찾을 수 없습니다.");

    const scenes = (rows[0].scenes as unknown as DramaScene[]) ?? [];
    const scene = scenes[data.sceneIndex];
    if (!scene) throw new Error("장면을 찾을 수 없어요.");
    const line = scene.key_lines?.[data.lineIndex];
    if (!line) throw new Error("대사를 찾을 수 없어요.");
    line.time_seconds = data.timeSeconds;

    await db
      .update(tables.dramas)
      .set({ scenes: scenes as unknown as import("@/db/schema").Json })
      .where(eq(tables.dramas.id, data.id));
    return { ok: true as const };
  });
