import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LevelEnum = z.enum(["beginner", "intermediate", "advanced"]);

const CreateCourseInput = z.object({
  title: z.string().min(1, "제목은 필수입니다"),
  description: z.string().optional().default(""),
  level: LevelEnum,
  weeks: z.number().int().min(1).max(15).default(1),
});

export async function assertEditor(userId: string) {
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || (data.role !== "teacher" && data.role !== "admin")) {
    throw new Error("권한이 없습니다. teacher 또는 admin만 수행할 수 있어요.");
  }
}

export const createCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateCourseInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: row, error } = await supabaseAdmin
      .from("courses")
      .insert({
        title: data.title,
        description: data.description || null,
        level: data.level,
        weeks: data.weeks,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { courseId: row.id as string };
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
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: courses, error } = await supabaseAdmin
      .from("courses")
      .select("id, title, description, level, weeks, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!courses || courses.length === 0) return [];

    const ids = courses.map((c) => c.id);
    const { data: lessons, error: lErr } = await supabaseAdmin
      .from("lessons")
      .select("course_id")
      .in("course_id", ids);
    if (lErr) throw new Error(lErr.message);

    const counts = new Map<string, number>();
    for (const l of lessons ?? []) {
      counts.set(l.course_id, (counts.get(l.course_id) ?? 0) + 1);
    }
    return courses.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      level: c.level,
      weeks: (c as { weeks?: number }).weeks ?? 1,
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
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: courses, error } = await supabaseAdmin
      .from("courses")
      .select("id, title, level, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!courses || courses.length === 0) return [];

    const ids = courses.map((c) => c.id);
    const { data: lessons, error: lErr } = await supabaseAdmin
      .from("lessons")
      .select("id, course_id, title, order_index")
      .in("course_id", ids)
      .order("order_index", { ascending: true });
    if (lErr) throw new Error(lErr.message);

    const byCourse = new Map<
      string,
      { id: string; title: string; order_index: number }[]
    >();
    for (const l of lessons ?? []) {
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

const UpdateLessonInput = z.object({
  lessonId: z.string().uuid(),
  title: z.string().min(1, "제목은 필수입니다"),
});

export const updateLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateLessonInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    // Permission: admin can edit anyone; teacher only own.
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", context.userId)
      .maybeSingle();
    const isAdmin = prof?.role === "admin";
    const { data: lessonRow, error: lErr } = await supabaseAdmin
      .from("lessons")
      .select("created_by")
      .eq("id", data.lessonId)
      .maybeSingle();
    if (lErr) throw new Error(lErr.message);
    if (!lessonRow) throw new Error("세부 강의를 찾을 수 없습니다.");
    if (!isAdmin && lessonRow.created_by !== context.userId) {
      throw new Error("본인이 만든 세부 강의만 수정할 수 있어요.");
    }
    const { error } = await supabaseAdmin
      .from("lessons")
      .update({ title: data.title })
      .eq("id", data.lessonId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const DeleteLessonInput = z.object({ lessonId: z.string().uuid() });

export const deleteLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteLessonInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", context.userId)
      .maybeSingle();
    const isAdmin = prof?.role === "admin";
    const { data: lessonRow, error: lErr } = await supabaseAdmin
      .from("lessons")
      .select("created_by")
      .eq("id", data.lessonId)
      .maybeSingle();
    if (lErr) throw new Error(lErr.message);
    if (!lessonRow) throw new Error("세부 강의를 찾을 수 없습니다.");
    if (!isAdmin && lessonRow.created_by !== context.userId) {
      throw new Error("본인이 만든 세부 강의만 삭제할 수 있어요.");
    }
    const { error } = await supabaseAdmin
      .from("lessons")
      .delete()
      .eq("id", data.lessonId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const DeleteCourseInput = z.object({ courseId: z.string().uuid() });

export const deleteCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteCourseInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", context.userId)
      .maybeSingle();
    const isAdmin = prof?.role === "admin";
    const { data: courseRow, error: cErr } = await supabaseAdmin
      .from("courses")
      .select("created_by")
      .eq("id", data.courseId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!courseRow) throw new Error("강의를 찾을 수 없습니다.");
    if (!isAdmin && courseRow.created_by !== context.userId) {
      throw new Error("본인이 만든 강의만 삭제할 수 있어요.");
    }
    // Remove child lessons first (in case FK has no cascade).
    const { error: lDelErr } = await supabaseAdmin
      .from("lessons")
      .delete()
      .eq("course_id", data.courseId);
    if (lDelErr) throw new Error(lDelErr.message);
    const { error } = await supabaseAdmin
      .from("courses")
      .delete()
      .eq("id", data.courseId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
