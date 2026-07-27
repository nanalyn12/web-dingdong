import { createServerFn } from "@tanstack/react-start";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
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
  // ISO string. The server already returns newest-first; this is here so the
  // list can offer other orderings without a second round trip.
  created_at: string;
  // Narration languages of the video lessons in this course, deduped. Empty for
  // courses with no video lesson. A course can carry both.
  video_languages: string[];
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
        created_at: tables.courses.created_at,
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
    // Narration language per course. The language lives on the video job that
    // produced the lesson, so this joins back through lesson_id rather than
    // duplicating the field onto courses.
    const { sql } = await import("drizzle-orm");
    const langRows = await db.execute<{ course_id: string; lang: string }>(sql`
      SELECT DISTINCT l.course_id, j.config->>'language' AS lang
        FROM video_jobs j
        JOIN lessons l ON l.id = j.lesson_id
       WHERE j.config->>'language' IS NOT NULL`);
    const langs = new Map<string, Set<string>>();
    for (const row of langRows.rows ?? []) {
      if (!row.course_id || !row.lang) continue;
      const set = langs.get(row.course_id) ?? new Set<string>();
      set.add(row.lang);
      langs.set(row.course_id, set);
    }

    return courses.map((c) => ({
      ...c,
      weeks: c.weeks ?? 1,
      lesson_count: counts.get(c.id) ?? 0,
      video_languages: [...(langs.get(c.id) ?? [])],
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
        video: tables.lessons.video,
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

// ── 강의 구조 편집 (이동·합치기·분리) ─────────────────────────────────────

type SqlRunner = { execute(query: ReturnType<typeof sql>): Promise<unknown> };

/** Re-number a course's lessons to 1..n (two-phase to dodge the unique index).
 * Phase 1 shifts everything above the current max so no transient value can
 * collide; phase 2 assigns 1..n (all below the shifted range). */
async function renumberCourseLessons(tx: SqlRunner, courseId: string) {
  await tx.execute(sql`
    UPDATE lessons
    SET order_index = order_index + (
      SELECT coalesce(max(order_index), 0) + 1 FROM lessons WHERE course_id = ${courseId}
    )
    WHERE course_id = ${courseId}`);
  await tx.execute(sql`
    UPDATE lessons l SET order_index = sub.rn
    FROM (
      SELECT id, row_number() OVER (ORDER BY order_index) AS rn
      FROM lessons WHERE course_id = ${courseId}
    ) sub
    WHERE l.id = sub.id`);
}

/** Keep weeks >= lesson count so the progress ring stays sensible. */
async function syncCourseWeeks(tx: SqlRunner, courseId: string) {
  await tx.execute(sql`
    UPDATE courses
    SET weeks = GREATEST(weeks, (SELECT count(*) FROM lessons WHERE course_id = ${courseId}))
    WHERE id = ${courseId}`);
}

type DbOrTx = Pick<
  typeof import("@/db").db,
  "select" | "update" | "insert" | "delete" | "execute"
>;

/** Move lessons into targetCourseId (appended at the end, original order kept). */
async function moveLessonRows(
  tx: DbOrTx,
  lessonRows: Array<{ id: string; course_id: string; order_index: number }>,
  targetCourseId: string,
) {
  const { tables } = await import("@/db");
  const moving = lessonRows
    .filter((l) => l.course_id !== targetCourseId)
    .sort(
      (a, b) =>
        a.course_id.localeCompare(b.course_id) || a.order_index - b.order_index,
    );
  if (moving.length === 0) return { movedCount: 0, sourceCourseIds: [] as string[] };

  const [{ maxIdx }] = await tx
    .select({ maxIdx: sql<number>`coalesce(max(order_index), 0)::int` })
    .from(tables.lessons)
    .where(eq(tables.lessons.course_id, targetCourseId));

  // maxIdx+1.. is free in the target course, so no offset phase is needed here.
  for (let i = 0; i < moving.length; i++) {
    await tx
      .update(tables.lessons)
      .set({ course_id: targetCourseId, order_index: maxIdx + 1 + i })
      .where(eq(tables.lessons.id, moving[i].id));
  }
  const sourceCourseIds = [...new Set(moving.map((l) => l.course_id))];
  await renumberCourseLessons(tx, targetCourseId);
  for (const cid of sourceCourseIds) await renumberCourseLessons(tx, cid);
  await syncCourseWeeks(tx, targetCourseId);
  return { movedCount: moving.length, sourceCourseIds };
}

const MoveLessonsInput = z.object({
  lessonIds: z.array(z.string().uuid()).min(1).max(100),
  targetCourseId: z.string().uuid(),
});

/** 선택한 세부 강의들을 다른 강의로 이동 (뒤에 이어 붙임). */
export const moveLessons = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => MoveLessonsInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    const isAdmin = (await getRole(context.userId)) === "admin";

    const target = await db
      .select({ id: tables.courses.id })
      .from(tables.courses)
      .where(eq(tables.courses.id, data.targetCourseId))
      .limit(1);
    if (!target[0]) throw new Error("이동할 대상 강의를 찾을 수 없습니다.");

    const lessons = await db
      .select({
        id: tables.lessons.id,
        course_id: tables.lessons.course_id,
        order_index: tables.lessons.order_index,
        created_by: tables.lessons.created_by,
      })
      .from(tables.lessons)
      .where(inArray(tables.lessons.id, data.lessonIds));
    if (lessons.length !== data.lessonIds.length) {
      throw new Error("일부 세부 강의를 찾을 수 없습니다.");
    }
    if (!isAdmin && lessons.some((l) => l.created_by !== context.userId)) {
      throw new Error("본인이 만든 세부 강의만 이동할 수 있어요.");
    }

    const moved = await db.transaction((tx) =>
      moveLessonRows(tx, lessons, data.targetCourseId),
    );
    return { ok: true as const, moved: moved.movedCount };
  });

const MergeCoursesInput = z.object({
  sourceCourseId: z.string().uuid(),
  targetCourseId: z.string().uuid(),
});

/** 강의 합치기: source의 모든 세부 강의를 target 뒤에 붙이고 source를 삭제. */
export const mergeCourses = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => MergeCoursesInput.parse(input))
  .handler(async ({ data, context }) => {
    if (data.sourceCourseId === data.targetCourseId) {
      throw new Error("같은 강의끼리는 합칠 수 없어요.");
    }
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    const isAdmin = (await getRole(context.userId)) === "admin";

    const [source] = await db
      .select({ created_by: tables.courses.created_by })
      .from(tables.courses)
      .where(eq(tables.courses.id, data.sourceCourseId))
      .limit(1);
    const [target] = await db
      .select({ id: tables.courses.id })
      .from(tables.courses)
      .where(eq(tables.courses.id, data.targetCourseId))
      .limit(1);
    if (!source || !target) throw new Error("강의를 찾을 수 없습니다.");
    if (!isAdmin && source.created_by !== context.userId) {
      throw new Error("본인이 만든 강의만 합칠 수 있어요.");
    }

    const lessons = await db
      .select({
        id: tables.lessons.id,
        course_id: tables.lessons.course_id,
        order_index: tables.lessons.order_index,
      })
      .from(tables.lessons)
      .where(eq(tables.lessons.course_id, data.sourceCourseId));

    const moved = await db.transaction(async (tx) => {
      const r = await moveLessonRows(tx, lessons, data.targetCourseId);
      await tx
        .delete(tables.courses)
        .where(eq(tables.courses.id, data.sourceCourseId));
      return r;
    });
    return { ok: true as const, moved: moved.movedCount };
  });

const SplitCourseInput = z.object({
  sourceCourseId: z.string().uuid(),
  lessonIds: z.array(z.string().uuid()).min(1).max(100),
  title: z.string().min(1, "새 강의 제목은 필수입니다"),
  description: z.string().optional().default(""),
});

/** 강의 분리: 선택한 세부 강의들로 새 강의를 만들어 옮김. */
export const splitCourse = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => SplitCourseInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    const isAdmin = (await getRole(context.userId)) === "admin";

    const [source] = await db
      .select({
        created_by: tables.courses.created_by,
        level: tables.courses.level,
      })
      .from(tables.courses)
      .where(eq(tables.courses.id, data.sourceCourseId))
      .limit(1);
    if (!source) throw new Error("강의를 찾을 수 없습니다.");
    if (!isAdmin && source.created_by !== context.userId) {
      throw new Error("본인이 만든 강의만 분리할 수 있어요.");
    }

    const lessons = await db
      .select({
        id: tables.lessons.id,
        course_id: tables.lessons.course_id,
        order_index: tables.lessons.order_index,
      })
      .from(tables.lessons)
      .where(inArray(tables.lessons.id, data.lessonIds));
    if (lessons.length !== data.lessonIds.length) {
      throw new Error("일부 세부 강의를 찾을 수 없습니다.");
    }
    if (lessons.some((l) => l.course_id !== data.sourceCourseId)) {
      throw new Error("선택한 세부 강의가 이 강의에 속해 있지 않아요.");
    }

    const newCourseId = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(tables.courses)
        .values({
          title: data.title,
          description: data.description || null,
          level: source.level,
          weeks: data.lessonIds.length,
          created_by: context.userId,
        })
        .returning({ id: tables.courses.id });
      await moveLessonRows(tx, lessons, row.id);
      return row.id;
    });
    return { ok: true as const, courseId: newCourseId };
  });
