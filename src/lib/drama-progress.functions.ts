import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/auth-middleware";
import type { Json } from "@/db/schema";

export type DramaProgress = {
  last_seconds: number;
  completed_scenes: number[];
  quiz_scores: Record<string, { score: number; total: number }>;
};

export const getMyDramaProgress = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => z.object({ dramaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<DramaProgress | null> => {
    const { db, tables } = await import("@/db");
    const rows = await db
      .select()
      .from(tables.drama_progress)
      .where(
        and(
          eq(tables.drama_progress.user_id, context.userId),
          eq(tables.drama_progress.drama_id, data.dramaId),
        ),
      )
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    return {
      last_seconds: r.last_seconds,
      completed_scenes: (r.completed_scenes as number[]) ?? [],
      quiz_scores:
        (r.quiz_scores as Record<string, { score: number; total: number }>) ?? {},
    };
  });

const SaveInput = z.object({
  dramaId: z.string().uuid(),
  lastSeconds: z.number().min(0).optional(),
  completedScenes: z.array(z.number().int().min(0)).max(100).optional(),
  quizScore: z
    .object({
      sceneIndex: z.number().int().min(0),
      score: z.number().int().min(0),
      total: z.number().int().min(1),
    })
    .optional(),
});

export const saveMyDramaProgress = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => SaveInput.parse(i))
  .handler(async ({ data, context }) => {
    const { db, tables } = await import("@/db");
    const existing = await db
      .select()
      .from(tables.drama_progress)
      .where(
        and(
          eq(tables.drama_progress.user_id, context.userId),
          eq(tables.drama_progress.drama_id, data.dramaId),
        ),
      )
      .limit(1);
    const prev = existing[0];
    const scenes = new Set<number>((prev?.completed_scenes as number[]) ?? []);
    for (const s of data.completedScenes ?? []) scenes.add(s);
    const quiz = {
      ...((prev?.quiz_scores as Record<string, unknown>) ?? {}),
    } as Record<string, unknown>;
    if (data.quizScore) {
      quiz[String(data.quizScore.sceneIndex)] = {
        score: data.quizScore.score,
        total: data.quizScore.total,
      };
    }
    const values = {
      user_id: context.userId,
      drama_id: data.dramaId,
      last_seconds: data.lastSeconds ?? prev?.last_seconds ?? 0,
      completed_scenes: [...scenes].sort((a, b) => a - b) as unknown as Json,
      quiz_scores: quiz as unknown as Json,
      updated_at: new Date().toISOString(),
    };
    await db
      .insert(tables.drama_progress)
      .values(values)
      .onConflictDoUpdate({
        target: [tables.drama_progress.user_id, tables.drama_progress.drama_id],
        set: values,
      });
    return { ok: true };
  });

/** Progress for all dramas of the signed-in user (for list badges). */
export const listMyDramaProgress = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { db, tables } = await import("@/db");
    const rows = await db
      .select({
        drama_id: tables.drama_progress.drama_id,
        completed_scenes: tables.drama_progress.completed_scenes,
        last_seconds: tables.drama_progress.last_seconds,
      })
      .from(tables.drama_progress)
      .where(eq(tables.drama_progress.user_id, context.userId));
    return rows.map((r) => ({
      drama_id: r.drama_id,
      completed: ((r.completed_scenes as number[]) ?? []).length,
      last_seconds: r.last_seconds,
    }));
  });
