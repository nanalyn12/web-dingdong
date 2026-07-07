import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
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
  youtube_url: string;
  youtube_video_id: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  genre: string | null;
  scenes: DramaScene[];
  has_captions: boolean;
  created_by: string | null;
  created_at: string;
};

export const listDramas = createServerFn({ method: "GET" }).handler(
  async (): Promise<DramaRow[]> => {
    const { db, tables } = await import("@/db");
    const rows = await db
      .select()
      .from(tables.dramas)
      .orderBy(desc(tables.dramas.created_at));
    return rows as unknown as DramaRow[];
  },
);

export const getDrama = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
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
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db, tables } = await import("@/db");
    const isAdmin = (await getRole(context.userId)) === "admin";
    const rows = await db
      .select({ created_by: tables.dramas.created_by })
      .from(tables.dramas)
      .where(eq(tables.dramas.id, data.id))
      .limit(1);
    if (!rows[0]) throw new Error("드라마를 찾을 수 없습니다.");
    if (!isAdmin && rows[0].created_by !== context.userId) {
      throw new Error("본인이 만든 드라마만 삭제할 수 있어요.");
    }
    await db.delete(tables.dramas).where(eq(tables.dramas.id, data.id));
    return { ok: true as const };
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
