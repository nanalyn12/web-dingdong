// Per-user daily caps on AI calls that spend the SHARED app key. SERVER-ONLY.
//
// Why this exists: sign-up is open, so before this every account was an
// unmetered tap on our Gemini billing. A user who supplies their own key is
// spending their own money and is never counted here — see consumeAiQuota().
import type { Profile } from "@/db/schema";
import { AI_QUOTA_MARKER } from "@/lib/ai-quota";

type AppRole = Profile["role"];

export type AiQuotaKind = "assistant";

/** Daily allowance per role, for calls on the shared key. null = unlimited. */
const DAILY_LIMITS: Record<AiQuotaKind, Record<AppRole, number | null>> = {
  assistant: { student: 30, teacher: 200, admin: null },
};

/** Thrown when the shared-key allowance is spent. The message is user-facing —
 *  dingdong-bot.tsx shows it verbatim instead of its generic failure line. */
export class AiQuotaExceededError extends Error {
  readonly quotaExceeded = true;
  constructor(message: string) {
    super(message);
    this.name = "AiQuotaExceededError";
  }
}

/** KST calendar day. Counters reset at midnight Korean time, which is what a
 *  learner means by "today" — the server may well be running in UTC. */
export function kstDayKey(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

export function dailyLimitFor(kind: AiQuotaKind, role: AppRole): number | null {
  return DAILY_LIMITS[kind][role];
}

/**
 * Atomically claim one unit of today's allowance.
 *
 * The conditional UPSERT is what makes this safe: the row is only bumped
 * `WHERE count < limit`, so two concurrent requests at the boundary cannot both
 * succeed — one of them gets no row back and is rejected. A read-then-write
 * would let both through.
 */
export async function consumeAiQuota(opts: {
  userId: string;
  role: AppRole;
  kind: AiQuotaKind;
}): Promise<void> {
  const limit = dailyLimitFor(opts.kind, opts.role);
  if (limit === null) return;

  const { db, tables } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  const day = kstDayKey();

  const rows = await db
    .insert(tables.ai_usage_daily)
    .values({ user_id: opts.userId, day, kind: opts.kind, count: 1 })
    .onConflictDoUpdate({
      target: [
        tables.ai_usage_daily.user_id,
        tables.ai_usage_daily.day,
        tables.ai_usage_daily.kind,
      ],
      set: { count: sql`${tables.ai_usage_daily.count} + 1` },
      setWhere: sql`${tables.ai_usage_daily.count} < ${limit}`,
    })
    .returning({ count: tables.ai_usage_daily.count });

  if (!rows[0]) {
    throw new AiQuotaExceededError(
      `${AI_QUOTA_MARKER} 오늘의 대화 ${limit}회를 다 썼어. 내일 다시 만나자! 🐼 ` +
        "'AI 설정'에서 네 Gemini API 키를 등록하면 제한 없이 이야기할 수 있어.",
    );
  }
}

/** Today's usage for the settings screen. */
export async function getAiUsageToday(userId: string, kind: AiQuotaKind): Promise<number> {
  const { db, tables } = await import("@/db");
  const { and, eq } = await import("drizzle-orm");
  const rows = await db
    .select({ count: tables.ai_usage_daily.count })
    .from(tables.ai_usage_daily)
    .where(
      and(
        eq(tables.ai_usage_daily.user_id, userId),
        eq(tables.ai_usage_daily.day, kstDayKey()),
        eq(tables.ai_usage_daily.kind, kind),
      ),
    )
    .limit(1);
  return rows[0]?.count ?? 0;
}
