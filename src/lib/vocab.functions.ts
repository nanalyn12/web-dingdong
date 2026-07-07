import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyGrade, initialSrs, type SrsState } from "@/lib/vocab-srs";

export type VocabInput = {
  zh: string;
  pinyin?: string | null;
  ko?: string | null;
  hsk?: number | null;
  emoji?: string | null;
  lesson_id?: string | null;
  tags?: string[] | null;
  source?: "lesson" | "song" | "drama" | "manual" | null;
};

const SELECT =
  "id, zh, pinyin, ko, hsk, emoji, lesson_id, created_at, tags, source, srs_ease, srs_interval_days, srs_reps, srs_lapses, srs_due_at, srs_last_reviewed_at";

type Row = {
  id: string;
  zh: string;
  pinyin: string | null;
  ko: string | null;
  hsk: number | null;
  emoji: string | null;
  lesson_id: string | null;
  created_at: string;
  tags: string[] | null;
  source: string | null;
  srs_ease: number | null;
  srs_interval_days: number | null;
  srs_reps: number | null;
  srs_lapses: number | null;
  srs_due_at: string | null;
  srs_last_reviewed_at: string | null;
};

function shape(r: Row) {
  return {
    id: r.id,
    zh: r.zh,
    pinyin: r.pinyin,
    ko: r.ko,
    hsk: r.hsk,
    emoji: r.emoji,
    lesson_id: r.lesson_id,
    created_at: r.created_at,
    tags: r.tags ?? [],
    source: (r.source as "lesson" | "song" | "drama" | "manual" | null) ?? null,
    srs: {
      ease: r.srs_ease ?? 2.5,
      intervalDays: r.srs_interval_days ?? 0,
      reps: r.srs_reps ?? 0,
      lapses: r.srs_lapses ?? 0,
      dueAt: r.srs_due_at ?? r.created_at,
      lastReviewedAt: r.srs_last_reviewed_at ?? undefined,
    } as SrsState,
  };
}


export const listVocabulary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("vocabulary")
      .select(SELECT)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(shape);
  });

export const saveVocabulary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: VocabInput) => {
    if (!d?.zh || typeof d.zh !== "string") throw new Error("zh required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const now = new Date();
    const seed = initialSrs(now);
    const { error, data: row } = await context.supabase
      .from("vocabulary")
      .upsert(
        {
          user_id: context.userId,
          zh: data.zh,
          pinyin: data.pinyin ?? null,
          ko: data.ko ?? null,
          hsk: data.hsk ?? null,
          emoji: data.emoji ?? null,
          lesson_id: data.lesson_id ?? null,
          tags: data.tags ?? [],
          source: data.source ?? "manual",
          srs_ease: seed.ease,
          srs_interval_days: seed.intervalDays,
          srs_reps: seed.reps,
          srs_lapses: seed.lapses,
          srs_due_at: seed.dueAt,
        },
        { onConflict: "user_id,zh", ignoreDuplicates: false },
      )
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return shape(row as unknown as Row);
  });

export const deleteVocabulary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { zh: string }) => {
    if (!d?.zh) throw new Error("zh required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("vocabulary")
      .delete()
      .eq("user_id", context.userId)
      .eq("zh", data.zh);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateVocabularyTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; tags: string[] }) => {
    if (!d?.id) throw new Error("id required");
    if (!Array.isArray(d.tags)) throw new Error("tags[] required");
    return {
      id: d.id,
      tags: [...new Set(d.tags.map((t) => t.trim()).filter(Boolean))],
    };
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("vocabulary")
      .update({ tags: data.tags })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return shape(row as unknown as Row);
  });

export const listDueVocabulary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number } | undefined) => ({
    limit: Math.min(200, Math.max(1, d?.limit ?? 50)),
  }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("vocabulary")
      .select(SELECT)
      .lte("srs_due_at", new Date().toISOString())
      .order("srs_due_at", { ascending: true })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown as Row[]).map(shape);
  });

export const gradeVocabulary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; grade: 0 | 1 | 2 }) => {
    if (!d?.id) throw new Error("id required");
    if (![0, 1, 2].includes(d.grade)) throw new Error("grade 0|1|2");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { data: existing, error: readErr } = await context.supabase
      .from("vocabulary")
      .select(SELECT)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!existing) throw new Error("단어를 찾을 수 없습니다.");

    const cur = shape(existing as unknown as Row).srs;
    const next = applyGrade(cur, data.grade);

    const { data: row, error } = await context.supabase
      .from("vocabulary")
      .update({
        srs_ease: next.ease,
        srs_interval_days: next.intervalDays,
        srs_reps: next.reps,
        srs_lapses: next.lapses,
        srs_due_at: next.dueAt,
        srs_last_reviewed_at: next.lastReviewedAt ?? new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return shape(row as unknown as Row);
  });

export const listVocabTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("vocabulary")
      .select("tags");
    if (error) throw new Error(error.message);
    const set = new Set<string>();
    for (const r of (data ?? []) as { tags: string[] | null }[]) {
      for (const t of r.tags ?? []) set.add(t);
    }
    return [...set].sort();
  });
