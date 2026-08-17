import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAuth } from "@/lib/auth-middleware";
import { API_KEY_PROVIDERS, classifySunoProbe, type ApiKeyProvider } from "@/lib/api-key-choice";

// 개인 API 키 관리 + 오늘의 AI 사용량.
// SECURITY: 저장된 키 값은 어떤 경로로도 클라이언트에 돌려주지 않는다 —
// 화면에는 마지막 4자(hint)와 등록 여부만 내려간다. 키는 저장 전에
// secret-box.server.ts로 암호화한다.

export type ApiKeyState = {
  provider: (typeof API_KEY_PROVIDERS)[number];
  configured: boolean;
  hint: string | null; // 마지막 4자
  updated_at: string | null;
};

export type AiUsageState = {
  used: number;
  limit: number | null; // null = 무제한 (본인 키 사용 중이거나 admin)
  onOwnKey: boolean;
};

export const getMyAiSettings = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<{ keys: ApiKeyState[]; assistant: AiUsageState }> => {
    const { db, tables } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const { dailyLimitFor, getAiUsageToday } = await import("@/lib/ai-quota.server");

    const rows = await db
      .select({
        provider: tables.user_api_keys.provider,
        hint: tables.user_api_keys.hint,
        updated_at: tables.user_api_keys.updated_at,
      })
      .from(tables.user_api_keys)
      .where(eq(tables.user_api_keys.user_id, context.userId));
    const byProvider = new Map(rows.map((r) => [r.provider, r]));

    const profileRows = await db
      .select({ role: tables.profiles.role })
      .from(tables.profiles)
      .where(eq(tables.profiles.id, context.userId))
      .limit(1);
    const role = profileRows[0]?.role ?? "student";

    const onOwnKey = byProvider.has("gemini");
    return {
      keys: API_KEY_PROVIDERS.map((provider) => {
        const row = byProvider.get(provider);
        return {
          provider,
          configured: !!row,
          hint: row?.hint ?? null,
          updated_at: row?.updated_at ?? null,
        };
      }),
      assistant: {
        used: await getAiUsageToday(context.userId, "assistant"),
        limit: onOwnKey ? null : dailyLimitFor("assistant", role),
        onOwnKey,
      },
    };
  });

const SaveInput = z.object({
  provider: z.enum(API_KEY_PROVIDERS),
  // Gemini keys are ~39 chars, Suno keys ~32; keep the bound loose but reject
  // obvious junk.
  apiKey: z.string().trim().min(20).max(200),
});

/**
 * 저장 전 키 확인. 오타 난 키가 나중에 생성 중에야 터지면 "기능이 고장 났다"로
 * 보이지 그 사람의 키 문제로 보이지 않는다.
 *
 * 제공자마다 엄격도가 다르다. Gemini는 모델 목록 조회가 안정적이라 실패하면
 * 저장을 막는다. Suno는 인증 실패(401/403)일 때만 막는다 — 프로브 경로가
 * 바뀌었거나 Suno가 잠깐 불안정하다는 이유로 멀쩡한 키를 못 넣게 되는 쪽이
 * 더 나쁜 실패다. 판정 규칙은 classifySunoProbe에 있다.
 */
async function assertKeyUsable(provider: ApiKeyProvider, apiKey: string): Promise<void> {
  if (provider === "gemini") {
    const probe = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": apiKey },
    });
    if (!probe.ok) {
      throw new Error(
        probe.status === 400 || probe.status === 401 || probe.status === 403
          ? "키가 유효하지 않아요. Google AI Studio에서 발급한 키를 다시 확인해 주세요."
          : `키 확인에 실패했어요 (HTTP ${probe.status}). 잠시 후 다시 시도해 주세요.`,
      );
    }
    return;
  }

  const { probeSunoKey } = await import("@/lib/suno.server");
  const verdict = classifySunoProbe(await probeSunoKey(apiKey));
  if (verdict === "invalid_key") {
    throw new Error("Suno 키가 유효하지 않아요. sunoapi.org에서 발급한 키를 다시 확인해 주세요.");
  }
}

export const saveMyApiKey = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => SaveInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertKeyUsable(data.provider, data.apiKey);

    const { db, tables } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    const { seal } = await import("@/lib/secret-box.server");

    await db
      .insert(tables.user_api_keys)
      .values({
        user_id: context.userId,
        provider: data.provider,
        ciphertext: seal(data.apiKey),
        hint: data.apiKey.slice(-4),
      })
      .onConflictDoUpdate({
        target: [tables.user_api_keys.user_id, tables.user_api_keys.provider],
        set: {
          ciphertext: seal(data.apiKey),
          hint: data.apiKey.slice(-4),
          updated_at: sql`now()`,
        },
      });

    return { ok: true };
  });

const DeleteInput = z.object({ provider: z.enum(API_KEY_PROVIDERS) });

export const deleteMyApiKey = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => DeleteInput.parse(input))
  .handler(async ({ data, context }) => {
    const { db, tables } = await import("@/db");
    const { and, eq } = await import("drizzle-orm");
    await db
      .delete(tables.user_api_keys)
      .where(
        and(
          eq(tables.user_api_keys.user_id, context.userId),
          eq(tables.user_api_keys.provider, data.provider),
        ),
      );
    return { ok: true };
  });
