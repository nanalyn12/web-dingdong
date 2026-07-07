import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.role !== "admin") {
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
  note: z
    .string()
    .trim()
    .min(20, "신청 사유를 20자 이상 작성해 주세요.")
    .max(1000, "신청 사유는 1000자 이하로 작성해 주세요."),
});

/** Student requests teacher role with contact info + application note. */
export const requestTeacher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TeacherApplyInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof, error: e1 } = await supabaseAdmin
      .from("profiles")
      .select("role, teacher_status")
      .eq("id", context.userId)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!prof) throw new Error("프로필이 없습니다.");
    if (prof.role === "teacher" || prof.role === "admin") {
      return { ok: true, already: true };
    }
    if (prof.teacher_status === "pending") {
      return { ok: true, already: true };
    }
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        real_name: data.realName,
        phone: data.phone,
        job: data.job,
        teacher_application_note: data.note,
        teacher_status: "pending",
        teacher_applied_at: new Date().toISOString(),
      })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
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
  teacher_applied_at: string | null;
  created_at: string;
  email: string | null;
  auth_phone: string | null;
};

export const listPendingTeachers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingTeacher[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, nickname, real_name, job, learning_goal, phone, teacher_application_note, teacher_applied_at, created_at",
      )
      .eq("teacher_status", "pending")
      .order("teacher_applied_at", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    // Enrich with auth email/phone
    const enriched = await Promise.all(
      rows.map(async (r) => {
        let email: string | null = null;
        let auth_phone: string | null = null;
        try {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.id);
          email = u?.user?.email ?? null;
          auth_phone = u?.user?.phone ?? null;
        } catch {
          // ignore
        }
        return { ...r, email, auth_phone } as PendingTeacher;
      }),
    );
    return enriched;
  });

const DecisionInput = z.object({
  userId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
});

export const decideTeacher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DecisionInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch =
      data.decision === "approve"
        ? { role: "teacher" as const, teacher_status: "approved" as const }
        : { teacher_status: "rejected" as const };
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
