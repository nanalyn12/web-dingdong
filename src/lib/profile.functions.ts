import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

const JobEnum = z.enum(["high_school", "university", "teacher", "worker", "other"]);

function parseList(varName: string): string[] {
  const raw = process.env[varName] ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// Hard-coded built-in admin so the seeded `admin` account always gets promoted
// even when the ADMIN_EMAILS secret hasn't been applied yet.
const BUILTIN_ADMIN_EMAILS = ["admin@dingdong.local"];


/**
 * Called right after sign-in to make sure the auth user has a profile row,
 * applies the TEACHER_EMAILS allowlist, and bumps `last_active_at`.
 */
export const ensureProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    const email = ((context.claims as { email?: string }).email ?? "")
      .toLowerCase();

    const teacherAllow = parseList("TEACHER_EMAILS");
    const adminAllow = [...parseList("ADMIN_EMAILS"), ...BUILTIN_ADMIN_EMAILS];
    const shouldBeAdmin = !!email && adminAllow.includes(email);
    const shouldBeTeacher = !!email && teacherAllow.includes(email);
    const now = new Date().toISOString();

    // Single idempotent path: upsert by primary key. If two requests race
    // (signup auto-login + loader call), both land on the same row with
    // ON CONFLICT DO UPDATE — no duplicate_key, no SELECT→INSERT race.
    // We do NOT set `role` here so we never demote an existing admin/teacher;
    // promotion is handled in a separate UPDATE below.
    const { data: upserted, error: upsertErr } = await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: userId, last_active_at: now },
        { onConflict: "id", ignoreDuplicates: false },
      )
      .select("*")
      .single();
    if (upsertErr) throw new Error(upsertErr.message);
    let profile: Profile = upserted;

    // Promotion (admin first; never demote).
    let patch: Partial<Profile> | null = null;
    if (shouldBeAdmin && profile.role !== "admin") {
      patch = { role: "admin", teacher_status: "approved" };
    } else if (shouldBeTeacher && profile.role === "student") {
      patch = { role: "teacher", teacher_status: "approved" };
    }
    if (patch) {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .update(patch)
        .eq("id", userId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      profile = data;
    }

    console.log("[ensureProfile]", {
      userId,
      email,
      role: profile.role,
      shouldBeAdmin,
      shouldBeTeacher,
    });

    const needsOnboarding = !profile.nickname || !profile.job;
    return { profile, needsOnboarding };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Profile | null> => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

const OnboardingInput = z.object({
  real_name: z.string().trim().min(1).max(80),
  nickname: z.string().trim().min(1).max(40),
  job: JobEnum,
  learning_goal: z.string().trim().max(500).optional().default(""),
  interest_categories: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  hsk_goal: z.number().int().min(1).max(9),
});

export const saveOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OnboardingInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({
        real_name: data.real_name,
        nickname: data.nickname,
        job: data.job,
        learning_goal: data.learning_goal || null,
        interest_categories: data.interest_categories,
        hsk_goal: data.hsk_goal,
        last_active_at: new Date().toISOString(),
      })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const touchLastActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase
      .from("profiles")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", context.userId);
    return { ok: true };
  });
