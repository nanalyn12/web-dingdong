import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, lte, sql } from "drizzle-orm";

import { requireAuth } from "@/lib/auth-middleware";
import { applyGrade, initialSrs, type SrsState } from "@/lib/vocab-srs";
import type { VocabRow as Row } from "@/db/schema";

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
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { db, tables } = await import("@/db");
    const rows = await db
      .select()
      .from(tables.vocabulary)
      .where(eq(tables.vocabulary.user_id, context.userId))
      .orderBy(desc(tables.vocabulary.created_at));
    return rows.map(shape);
  });

/** True if the signed-in user already saved this zh word (used by lesson cards). */
export const hasVocabZh = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: { zh: string }) => {
    if (!d?.zh) throw new Error("zh required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { db, tables } = await import("@/db");
    const rows = await db
      .select({ id: tables.vocabulary.id })
      .from(tables.vocabulary)
      .where(and(eq(tables.vocabulary.user_id, context.userId), eq(tables.vocabulary.zh, data.zh)))
      .limit(1);
    return { saved: rows.length > 0 };
  });

export const saveVocabulary = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: VocabInput) => {
    if (!d?.zh || typeof d.zh !== "string") throw new Error("zh required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { db, tables } = await import("@/db");
    const now = new Date();
    const seed = initialSrs(now);
    const values = {
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
    };
    const existed = await db
      .select({ id: tables.vocabulary.id })
      .from(tables.vocabulary)
      .where(and(eq(tables.vocabulary.user_id, context.userId), eq(tables.vocabulary.zh, data.zh)))
      .limit(1);
    const [row] = await db
      .insert(tables.vocabulary)
      .values(values)
      .onConflictDoUpdate({
        target: [tables.vocabulary.user_id, tables.vocabulary.zh],
        set: { ...values },
      })
      .returning();
    if (!existed[0]) {
      const { bumpActivity } = await import("@/lib/learning-activity.server");
      void bumpActivity(context.userId, { words_added: 1 }).catch(() => {});
    }
    return shape(row);
  });

export const deleteVocabulary = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { zh: string }) => {
    if (!d?.zh) throw new Error("zh required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { db, tables } = await import("@/db");
    await db
      .delete(tables.vocabulary)
      .where(and(eq(tables.vocabulary.user_id, context.userId), eq(tables.vocabulary.zh, data.zh)));
    return { ok: true };
  });

export const updateVocabularyTags = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string; tags: string[] }) => {
    if (!d?.id) throw new Error("id required");
    if (!Array.isArray(d.tags)) throw new Error("tags[] required");
    return {
      id: d.id,
      tags: [...new Set(d.tags.map((t) => t.trim()).filter(Boolean))],
    };
  })
  .handler(async ({ data, context }) => {
    const { db, tables } = await import("@/db");
    const [row] = await db
      .update(tables.vocabulary)
      .set({ tags: data.tags })
      .where(and(eq(tables.vocabulary.id, data.id), eq(tables.vocabulary.user_id, context.userId)))
      .returning();
    if (!row) throw new Error("단어를 찾을 수 없습니다.");
    return shape(row);
  });

export const listDueVocabulary = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: { limit?: number } | undefined) => ({
    limit: Math.min(200, Math.max(1, d?.limit ?? 50)),
  }))
  .handler(async ({ data, context }) => {
    const { db, tables } = await import("@/db");
    const rows = await db
      .select()
      .from(tables.vocabulary)
      .where(
        and(
          eq(tables.vocabulary.user_id, context.userId),
          lte(tables.vocabulary.srs_due_at, new Date().toISOString()),
        ),
      )
      .orderBy(asc(tables.vocabulary.srs_due_at))
      .limit(data.limit);
    return rows.map(shape);
  });

export const gradeVocabulary = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string; grade: 0 | 1 | 2 }) => {
    if (!d?.id) throw new Error("id required");
    if (![0, 1, 2].includes(d.grade)) throw new Error("grade 0|1|2");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { db, tables } = await import("@/db");
    const existing = await db
      .select()
      .from(tables.vocabulary)
      .where(and(eq(tables.vocabulary.id, data.id), eq(tables.vocabulary.user_id, context.userId)))
      .limit(1);
    if (!existing[0]) throw new Error("단어를 찾을 수 없습니다.");

    const cur = shape(existing[0]).srs;
    const next = applyGrade(cur, data.grade);

    const [row] = await db
      .update(tables.vocabulary)
      .set({
        srs_ease: next.ease,
        srs_interval_days: next.intervalDays,
        srs_reps: next.reps,
        srs_lapses: next.lapses,
        srs_due_at: next.dueAt,
        srs_last_reviewed_at: next.lastReviewedAt ?? new Date().toISOString(),
      })
      .where(and(eq(tables.vocabulary.id, data.id), eq(tables.vocabulary.user_id, context.userId)))
      .returning();
    const { bumpActivity } = await import("@/lib/learning-activity.server");
    void bumpActivity(context.userId, { reviews: 1 }).catch(() => {});
    return shape(row);
  });

export const listVocabTags = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { db, tables } = await import("@/db");
    const rows = await db
      .select({ tag: sql<string>`unnest(${tables.vocabulary.tags})` })
      .from(tables.vocabulary)
      .where(eq(tables.vocabulary.user_id, context.userId));
    const set = new Set<string>(rows.map((r) => r.tag));
    return [...set].sort();
  });
