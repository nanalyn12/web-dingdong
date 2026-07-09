import { createServerFn } from "@tanstack/react-start";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/auth-middleware";

async function assertAdmin(userId: string) {
  const { db, tables } = await import("@/db");
  const rows = await db
    .select({ role: tables.profiles.role })
    .from(tables.profiles)
    .where(eq(tables.profiles.id, userId))
    .limit(1);
  if (rows[0]?.role !== "admin") {
    throw new Error("관리자만 접근할 수 있어요.");
  }
}

const JobEnum = z.enum(["high_school", "university", "teacher", "worker", "other"]);

const TeacherApplyInput = z.object({
  realName: z.string().trim().min(2, "실명을 입력해 주세요.").max(80),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{9,20}$/, "올바른 전화번호 형식이 아니에요."),
  job: JobEnum,
  school: z
    .string()
    .trim()
    .min(2, "재직/강의 중인 학교 이름을 입력해 주세요.")
    .max(100),
  department: z
    .string()
    .trim()
    .min(1, "학과를 입력해 주세요.")
    .max(100),
});

/** Student requests teacher role with contact info + application note. */
export const requestTeacher = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => TeacherApplyInput.parse(input))
  .handler(async ({ data, context }) => {
    const { db, tables } = await import("@/db");
    const rows = await db
      .select({
        role: tables.profiles.role,
        teacher_status: tables.profiles.teacher_status,
      })
      .from(tables.profiles)
      .where(eq(tables.profiles.id, context.userId))
      .limit(1);
    const prof = rows[0];
    if (!prof) throw new Error("프로필이 없습니다.");
    if (prof.role === "teacher" || prof.role === "admin") {
      return { ok: true, already: true };
    }
    if (prof.teacher_status === "pending") {
      return { ok: true, already: true };
    }
    await db
      .update(tables.profiles)
      .set({
        real_name: data.realName,
        phone: data.phone,
        job: data.job,
        teacher_school: data.school,
        teacher_department: data.department,
        teacher_status: "pending",
        teacher_applied_at: new Date().toISOString(),
      })
      .where(eq(tables.profiles.id, context.userId));
    return { ok: true };
  });

export type PendingTeacher = {
  id: string;
  nickname: string | null;
  real_name: string | null;
  job: string | null;
  learning_goal: string | null;
  phone: string | null;
  teacher_application_note: string | null;
  teacher_school: string | null;
  teacher_department: string | null;
  teacher_applied_at: string | null;
  created_at: string;
  email: string | null;
  auth_phone: string | null;
};

export const listPendingTeachers = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<PendingTeacher[]> => {
    await assertAdmin(context.userId);
    const { db, tables } = await import("@/db");
    const rows = await db
      .select({
        id: tables.profiles.id,
        nickname: tables.profiles.nickname,
        real_name: tables.profiles.real_name,
        job: tables.profiles.job,
        learning_goal: tables.profiles.learning_goal,
        phone: tables.profiles.phone,
        teacher_application_note: tables.profiles.teacher_application_note,
        teacher_school: tables.profiles.teacher_school,
        teacher_department: tables.profiles.teacher_department,
        teacher_applied_at: tables.profiles.teacher_applied_at,
        created_at: tables.profiles.created_at,
        email: tables.user.email,
      })
      .from(tables.profiles)
      .leftJoin(tables.user, eq(tables.user.id, tables.profiles.id))
      .where(eq(tables.profiles.teacher_status, "pending"))
      .orderBy(asc(tables.profiles.teacher_applied_at));
    return rows.map((r) => ({ ...r, auth_phone: null }));
  });

const DecisionInput = z.object({
  // better-auth user ids are opaque strings, not UUIDs
  userId: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
});

export const decideTeacher = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => DecisionInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { db, tables } = await import("@/db");
    const patch =
      data.decision === "approve"
        ? { role: "teacher" as const, teacher_status: "approved" as const }
        : { teacher_status: "rejected" as const };
    await db
      .update(tables.profiles)
      .set(patch)
      .where(eq(tables.profiles.id, data.userId));
    return { ok: true };
  });
