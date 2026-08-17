import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/auth-middleware";
import { assertEditor } from "@/lib/courses.functions";

const ScheduleInput = z.object({
  name: z.string().trim().min(1, "예약 이름을 입력하세요").max(60),
  keywords: z
    .array(z.string().trim().min(1).max(60))
    .min(1, "키워드를 1개 이상 입력하세요")
    .max(50),
  frequency: z.enum(["daily", "weekly"]),
  weekdays: z.array(z.number().int().min(0).max(6)).default([]),
  time_kst: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "시간은 HH:MM 형식"),
  level: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  style: z.string().trim().min(1).max(80).default("cute mandarin pop"),
  vocal_gender: z.enum(["m", "f"]).nullable().default(null),
});

export const createSongSchedule = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => ScheduleInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    if (data.frequency === "weekly" && data.weekdays.length === 0) {
      throw new Error("매주 반복은 요일을 1개 이상 선택하세요.");
    }
    const { db, tables } = await import("@/db");
    const [row] = await db
      .insert(tables.song_schedules)
      .values({
        created_by: context.userId,
        name: data.name,
        keywords: data.keywords,
        frequency: data.frequency,
        weekdays: data.weekdays,
        time_kst: data.time_kst,
        level: data.level,
        style: data.style,
        vocal_gender: data.vocal_gender,
      })
      .returning({ id: tables.song_schedules.id });
    return { id: row.id };
  });

const UpdateInput = ScheduleInput.extend({ id: z.string().uuid() });

export const updateSongSchedule = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => UpdateInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    if (data.frequency === "weekly" && data.weekdays.length === 0) {
      throw new Error("매주 반복은 요일을 1개 이상 선택하세요.");
    }
    const { db, tables } = await import("@/db");
    const [row] = await db
      .update(tables.song_schedules)
      .set({
        name: data.name,
        keywords: data.keywords,
        frequency: data.frequency,
        weekdays: data.weekdays,
        time_kst: data.time_kst,
        level: data.level,
        style: data.style,
        vocal_gender: data.vocal_gender,
        next_keyword_index: 0, // keyword list may have changed — restart rotation
      })
      .where(eq(tables.song_schedules.id, data.id))
      .returning({ id: tables.song_schedules.id });
    if (!row) throw new Error("예약을 찾을 수 없습니다.");
    return { ok: true as const };
  });

export const listSongSchedules = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    return db.select().from(tables.song_schedules).orderBy(desc(tables.song_schedules.created_at));
  });

export const toggleSongSchedule = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    await db
      .update(tables.song_schedules)
      .set({ enabled: data.enabled })
      .where(eq(tables.song_schedules.id, data.id));
    return { ok: true as const };
  });

export const deleteSongSchedule = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    await db.delete(tables.song_schedules).where(eq(tables.song_schedules.id, data.id));
    return { ok: true as const };
  });

export const runSongScheduleNow = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { runSongScheduleOnce } = await import("@/lib/song-scheduler.server");
    const songId = await runSongScheduleOnce(data.id);
    return { songId };
  });
