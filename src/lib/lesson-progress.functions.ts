import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/auth-middleware";
import type { Json } from "@/db/schema";

// Server-side twin of the lesson page's localStorage progress. Guests keep
// using localStorage only; signed-in users also sync here so the dashboard
// can show lesson progress across devices.

export const getMyLessonProgress = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => z.object({ lessonId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { db, tables } = await import("@/db");
    const rows = await db
      .select()
      .from(tables.lesson_progress)
      .where(
        and(
          eq(tables.lesson_progress.user_id, context.userId),
          eq(tables.lesson_progress.lesson_id, data.lessonId),
        ),
      )
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    return {
      completed_tabs: (r.completed_tabs as string[]) ?? [],
      quiz_correct: r.quiz_correct,
      quiz_total: r.quiz_total,
      completed_at: r.completed_at,
    };
  });

/** Every lesson this user has touched, for the course pages to badge their
 * lists with. One request per reader rather than one per lesson row. */
export const listMyLessonProgress = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { db, tables } = await import("@/db");
    const rows = await db
      .select({
        lesson_id: tables.lesson_progress.lesson_id,
        completed_tabs: tables.lesson_progress.completed_tabs,
        completed_at: tables.lesson_progress.completed_at,
      })
      .from(tables.lesson_progress)
      .where(eq(tables.lesson_progress.user_id, context.userId));
    return rows.map((r) => ({
      lesson_id: r.lesson_id,
      tabs: ((r.completed_tabs as string[]) ?? []).length,
      completed: !!r.completed_at,
    }));
  });

const SaveInput = z.object({
  lessonId: z.string().uuid(),
  completedTabs: z.array(z.string().min(1).max(30)).max(20).optional(),
  quizScore: z
    .object({
      correct: z.number().int().min(0),
      total: z.number().int().min(1),
    })
    .optional(),
});

export const saveMyLessonProgress = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => SaveInput.parse(i))
  .handler(async ({ data, context }) => {
    const { db, tables } = await import("@/db");
    const existing = await db
      .select()
      .from(tables.lesson_progress)
      .where(
        and(
          eq(tables.lesson_progress.user_id, context.userId),
          eq(tables.lesson_progress.lesson_id, data.lessonId),
        ),
      )
      .limit(1);
    const prev = existing[0];

    const prevTabs = new Set<string>((prev?.completed_tabs as string[]) ?? []);
    const newTabs = (data.completedTabs ?? []).filter((t) => !prevTabs.has(t));
    const tabs = [...prevTabs, ...newTabs];

    const quizCorrect = data.quizScore?.correct ?? prev?.quiz_correct ?? null;
    const quizTotal = data.quizScore?.total ?? prev?.quiz_total ?? null;
    const passed =
      data.quizScore &&
      data.quizScore.correct >= Math.ceil(data.quizScore.total * 0.7);

    const values = {
      user_id: context.userId,
      lesson_id: data.lessonId,
      completed_tabs: tabs as unknown as Json,
      quiz_correct: quizCorrect,
      quiz_total: quizTotal,
      completed_at: prev?.completed_at ?? (passed ? new Date().toISOString() : null),
      updated_at: new Date().toISOString(),
    };
    await db
      .insert(tables.lesson_progress)
      .values(values)
      .onConflictDoUpdate({
        target: [tables.lesson_progress.user_id, tables.lesson_progress.lesson_id],
        set: values,
      });

    const { bumpActivity } = await import("@/lib/learning-activity.server");
    void bumpActivity(context.userId, {
      lessons: newTabs.length,
      quizzes: data.quizScore ? 1 : 0,
    }).catch(() => {});

    return { ok: true };
  });
