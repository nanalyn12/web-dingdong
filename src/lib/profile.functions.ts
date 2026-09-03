import { createServerFn } from "@tanstack/react-start";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/auth-middleware";
import { THEME_PREFERENCES } from "@/lib/theme";
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

// The admin allowlist is a BOOTSTRAP, not a standing rule. An allowlisted
// address nobody has registered yet is a free admin account for whoever signs
// up with it first, so the very first successful promotion writes this row and
// every later sign-in ignores the allowlist. Further admins are granted in-app.
// Locked out? Delete this row from app_credentials to re-arm the bootstrap.
const ADMIN_BOOTSTRAP_KEY = "admin_bootstrap";

type AdminBootstrap = { user_id: string; email: string; claimed_at: string };

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
    const onAdminAllowlist = !!email && adminAllow.includes(email);
    const shouldBeTeacher = !!email && teacherAllow.includes(email);
    const now = new Date().toISOString();

    // Bootstrap already spent? Then the allowlist no longer promotes anyone
    // except the account that claimed it (so that account can't lose admin).
    const bootstrapRow = onAdminAllowlist
      ? (
          await db
            .select({ value: tables.app_credentials.value })
            .from(tables.app_credentials)
            .where(eq(tables.app_credentials.key, ADMIN_BOOTSTRAP_KEY))
            .limit(1)
        )[0]
      : undefined;
    const bootstrap = bootstrapRow?.value as AdminBootstrap | undefined;
    const shouldBeAdmin = onAdminAllowlist && (!bootstrap || bootstrap.user_id === userId);

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

    // Spend the bootstrap once this account actually holds admin — including
    // the case where it already did before this change shipped, so an existing
    // deployment closes the window on the admin's next sign-in rather than
    // waiting for a promotion that will never happen again.
    if (shouldBeAdmin && !bootstrap && profile.role === "admin") {
      await db
        .insert(tables.app_credentials)
        .values({
          key: ADMIN_BOOTSTRAP_KEY,
          value: {
            user_id: userId,
            email,
            claimed_at: now,
          } satisfies AdminBootstrap,
        })
        .onConflictDoNothing({ target: tables.app_credentials.key });
    }

    console.log("[ensureProfile]", {
      userId,
      email,
      role: profile.role,
      onAdminAllowlist,
      shouldBeAdmin,
      shouldBeTeacher,
      adminBootstrapClaimed: !!bootstrap,
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

/**
 * The theme follows the account to another device; localStorage only mirrors
 * it so the pre-hydration boot script has something to read.
 */
export const saveThemePreference = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ theme: z.enum(THEME_PREFERENCES) }).parse(input))
  .handler(async ({ data, context }) => {
    const { db, tables } = await import("@/db");
    await db
      .update(tables.profiles)
      .set({ theme: data.theme })
      .where(eq(tables.profiles.id, context.userId));
    return { ok: true as const };
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
