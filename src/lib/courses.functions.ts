import { createServerFn } from "@tanstack/react-start";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/auth-middleware";

const LevelEnum = z.enum(["beginner", "intermediate", "advanced"]);

const CreateCourseInput = z.object({
  title: z.string().min(1, "제목은 필수입니다"),
  description: z.string().optional().default(""),
  level: LevelEnum,
  weeks: z.number().int().min(1).max(15).default(1),
});

export async function getRole(userId: string): Promise<string | null> {
  const { db, tables } = await import("@/db");
  const rows = await db
    .select({ role: tables.profiles.role })
    .from(tables.profiles)
    .where(eq(tables.profiles.id, userId))
    .limit(1);
  return rows[0]?.role ?? null;
}

export async function assertEditor(userId: string) {
  const role = await getRole(userId);
  if (role !== "teacher" && role !== "admin") {
    throw new Error("권한이 없습니다. teacher 또는 admin만 수행할 수 있어요.");
  }
}

export const createCourse = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => CreateCourseInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    const [row] = await db
      .insert(tables.courses)
      .values({
        title: data.title,
        description: data.description || null,
        level: data.level,
        weeks: data.weeks,
        created_by: context.userId,
      })
      .returning({ id: tables.courses.id });
    return { courseId: row.id };
  });

export type CourseWithCount = {
  id: string;
  title: string;
  description: string | null;
  level: string;
  weeks: number;
  lesson_count: number;
};

export const listCoursesWithCounts = createServerFn({ method: "GET" }).handler(
  async (): Promise<CourseWithCount[]> => {
    const { db, tables } = await import("@/db");
    const courses = await db
      .select({
        id: tables.courses.id,
        title: tables.courses.title,
        description: tables.courses.description,
        level: tables.courses.level,
        weeks: tables.courses.weeks,
      })
      .from(tables.courses)
      .orderBy(desc(tables.courses.created_at));
    if (courses.length === 0) return [];

    const ids = courses.map((c) => c.id);
    const lessons = await db
      .select({ course_id: tables.lessons.course_id })
      .from(tables.lessons)
      .where(inArray(tables.lessons.course_id, ids));

    const counts = new Map<string, number>();
    for (const l of lessons) {
      counts.set(l.course_id, (counts.get(l.course_id) ?? 0) + 1);
    }
    return courses.map((c) => ({
      ...c,
      weeks: c.weeks ?? 1,
      lesson_count: counts.get(c.id) ?? 0,
    }));
  },
);

export type CourseWithLessons = {
  id: string;
  title: string;
  level: string;
  lessons: { id: string; title: string; order_index: number }[];
};

export const listCoursesWithLessons = createServerFn({ method: "GET" }).handler(
  async (): Promise<CourseWithLessons[]> => {
    const { db, tables } = await import("@/db");
    const courses = await db
      .select({
        id: tables.courses.id,
        title: tables.courses.title,
        level: tables.courses.level,
      })
      .from(tables.courses)
      .orderBy(desc(tables.courses.created_at));
    if (courses.length === 0) return [];

    const ids = courses.map((c) => c.id);
    const lessons = await db
      .select({
        id: tables.lessons.id,
        course_id: tables.lessons.course_id,
        title: tables.lessons.title,
        order_index: tables.lessons.order_index,
      })
      .from(tables.lessons)
      .where(inArray(tables.lessons.course_id, ids))
      .orderBy(asc(tables.lessons.order_index));

    const byCourse = new Map<
      string,
      { id: string; title: string; order_index: number }[]
    >();
    for (const l of lessons) {
      const arr = byCourse.get(l.course_id) ?? [];
      arr.push({ id: l.id, title: l.title, order_index: l.order_index });
      byCourse.set(l.course_id, arr);
    }
    return courses.map((c) => ({
      id: c.id,
      title: c.title,
      level: c.level,
      lessons: byCourse.get(c.id) ?? [],
    }));
  },
);

const GetLessonInput = z.object({ lessonId: z.string().uuid() });

/** Public lesson fetch for the lesson page (was a client-side query). */
export const getLesson = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => GetLessonInput.parse(input))
  .handler(async ({ data }) => {
    const { db, tables } = await import("@/db");
    const rows = await db
      .select({
        id: tables.lessons.id,
        title: tables.lessons.title,
        content_md: tables.lessons.content_md,
        level: tables.lessons.level,
        key_expressions: tables.lessons.key_expressions,
        dialogues: tables.lessons.dialogues,
        slides: tables.lessons.slides,
        quiz: tables.lessons.quiz,
        comic_panels: tables.lessons.comic_panels,
        cultural_note: tables.lessons.cultural_note,
        cultural_snippet: tables.lessons.cultural_snippet,
      })
      .from(tables.lessons)
      .where(eq(tables.lessons.id, data.lessonId))
      .limit(1);
    if (!rows[0]) throw new Error("세부 강의를 찾을 수 없습니다.");
    return rows[0];
  });

const UpdateLessonInput = z.object({
  lessonId: z.string().uuid(),
  title: z.string().min(1, "제목은 필수입니다"),
});

export const updateLesson = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => UpdateLessonInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    // Permission: admin can edit anyone; teacher only own.
    const isAdmin = (await getRole(context.userId)) === "admin";
    const rows = await db
      .select({ created_by: tables.lessons.created_by })
      .from(tables.lessons)
      .where(eq(tables.lessons.id, data.lessonId))
      .limit(1);
    if (!rows[0]) throw new Error("세부 강의를 찾을 수 없습니다.");
    if (!isAdmin && rows[0].created_by !== context.userId) {
      throw new Error("본인이 만든 세부 강의만 수정할 수 있어요.");
    }
    await db
      .update(tables.lessons)
      .set({ title: data.title })
      .where(eq(tables.lessons.id, data.lessonId));
    return { ok: true as const };
  });

const DeleteLessonInput = z.object({ lessonId: z.string().uuid() });

export const deleteLesson = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => DeleteLessonInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    const isAdmin = (await getRole(context.userId)) === "admin";
    const rows = await db
      .select({ created_by: tables.lessons.created_by })
      .from(tables.lessons)
      .where(eq(tables.lessons.id, data.lessonId))
      .limit(1);
    if (!rows[0]) throw new Error("세부 강의를 찾을 수 없습니다.");
    if (!isAdmin && rows[0].created_by !== context.userId) {
      throw new Error("본인이 만든 세부 강의만 삭제할 수 있어요.");
    }
    await db.delete(tables.lessons).where(eq(tables.lessons.id, data.lessonId));
    return { ok: true as const };
  });

const DeleteCourseInput = z.object({ courseId: z.string().uuid() });

export const deleteCourse = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => DeleteCourseInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    const isAdmin = (await getRole(context.userId)) === "admin";
    const rows = await db
      .select({ created_by: tables.courses.created_by })
      .from(tables.courses)
      .where(eq(tables.courses.id, data.courseId))
      .limit(1);
    if (!rows[0]) throw new Error("강의를 찾을 수 없습니다.");
    if (!isAdmin && rows[0].created_by !== context.userId) {
      throw new Error("본인이 만든 강의만 삭제할 수 있어요.");
    }
    // lessons cascade via FK
    await db.delete(tables.courses).where(eq(tables.courses.id, data.courseId));
    return { ok: true as const };
  });
