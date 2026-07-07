import { createServerFn } from "@tanstack/react-start";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/auth-middleware";
import type { Profile } from "@/db/schema";

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
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { db, tables } = await import("@/db");
    const userId = context.userId;
    const email = context.email;

    const teacherAllow = parseList("TEACHER_EMAILS");
    const adminAllow = [...parseList("ADMIN_EMAILS"), ...BUILTIN_ADMIN_EMAILS];
    const shouldBeAdmin = !!email && adminAllow.includes(email);
    const shouldBeTeacher = !!email && teacherAllow.includes(email);
    const now = new Date().toISOString();

    // Single idempotent path: upsert by primary key. We do NOT set `role`
    // here so we never demote an existing admin/teacher; promotion is a
    // separate UPDATE below.
    const [upserted] = await db
      .insert(tables.profiles)
      .values({ id: userId, last_active_at: now })
      .onConflictDoUpdate({
        target: tables.profiles.id,
        set: { last_active_at: now, updated_at: sql`now()` },
      })
      .returning();
    let profile: Profile = upserted;

    // Promotion (admin first; never demote).
    let patch: Partial<Profile> | null = null;
    if (shouldBeAdmin && profile.role !== "admin") {
      patch = { role: "admin", teacher_status: "approved" };
    } else if (shouldBeTeacher && profile.role === "student") {
      patch = { role: "teacher", teacher_status: "approved" };
    }
    if (patch) {
      const [updated] = await db
        .update(tables.profiles)
        .set(patch)
        .where(eq(tables.profiles.id, userId))
        .returning();
      profile = updated;
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
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<Profile | null> => {
    const { db, tables } = await import("@/db");
    const rows = await db
      .select()
      .from(tables.profiles)
      .where(eq(tables.profiles.id, context.userId))
      .limit(1);
    return rows[0] ?? null;
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
  .middleware([requireAuth])
  .inputValidator((input: unknown) => OnboardingInput.parse(input))
  .handler(async ({ data, context }) => {
    const { db, tables } = await import("@/db");
    await db
      .update(tables.profiles)
      .set({
        real_name: data.real_name,
        nickname: data.nickname,
        job: data.job,
        learning_goal: data.learning_goal || null,
        interest_categories: data.interest_categories,
        hsk_goal: data.hsk_goal,
        last_active_at: new Date().toISOString(),
      })
      .where(eq(tables.profiles.id, context.userId));
    return { ok: true };
  });

export const touchLastActive = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { db, tables } = await import("@/db");
    await db
      .update(tables.profiles)
      .set({ last_active_at: new Date().toISOString() })
      .where(eq(tables.profiles.id, context.userId));
    return { ok: true };
  });
