import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

const COLS =
  "id, title, title_zh, description, level, youtube_url, youtube_video_id, thumbnail_url, duration_seconds, genre, scenes, has_captions, created_by, created_at";


export const listDramas = createServerFn({ method: "GET" }).handler(
  async (): Promise<DramaRow[]> => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data, error } = await supabaseAdmin
      .from("dramas")
      .select(COLS)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as DramaRow[];
  },
);

export const getDrama = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<DramaRow> => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: row, error } = await supabaseAdmin
      .from("dramas")
      .select(COLS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("드라마를 찾을 수 없습니다.");
    return row as unknown as DramaRow;
  });

export const deleteDrama = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", context.userId)
      .maybeSingle();
    const isAdmin = prof?.role === "admin";
    const { data: row, error: gErr } = await supabaseAdmin
      .from("dramas")
      .select("created_by")
      .eq("id", data.id)
      .maybeSingle();
    if (gErr) throw new Error(gErr.message);
    if (!row) throw new Error("드라마를 찾을 수 없습니다.");
    if (!isAdmin && row.created_by !== context.userId) {
      throw new Error("본인이 만든 드라마만 삭제할 수 있어요.");
    }
    const { error } = await supabaseAdmin
      .from("dramas")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const updateDramaLineTime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", context.userId)
      .maybeSingle();
    const isEditor = prof?.role === "admin" || prof?.role === "teacher";
    if (!isEditor) throw new Error("교수자만 편집할 수 있어요.");

    const { data: row, error: gErr } = await supabaseAdmin
      .from("dramas")
      .select("scenes")
      .eq("id", data.id)
      .maybeSingle();
    if (gErr) throw new Error(gErr.message);
    if (!row) throw new Error("드라마를 찾을 수 없습니다.");

    const scenes = (row.scenes as unknown as DramaScene[]) ?? [];
    const scene = scenes[data.sceneIndex];
    if (!scene) throw new Error("장면을 찾을 수 없어요.");
    const line = scene.key_lines?.[data.lineIndex];
    if (!line) throw new Error("대사를 찾을 수 없어요.");
    line.time_seconds = data.timeSeconds;

    const { error } = await supabaseAdmin
      .from("dramas")
      .update({
        scenes: scenes as unknown as import("@/integrations/supabase/types").Json,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

