// Server-only accessor for personal API keys. SECURITY: the plaintext key must
// never cross a server-function return boundary — callers hand it straight to
// the provider factory. The UI gets its data from user-api-keys.functions.ts,
// which only ever exposes `hint`.
// 제공자 목록과 메타데이터는 순수 모듈에 있다 — 설정 화면도 같은 목록을 봐야
// 제공자를 추가할 때 UI를 따로 고치지 않는다.
export { API_KEY_PROVIDERS, type ApiKeyProvider } from "@/lib/api-key-choice";
import type { ApiKeyProvider } from "@/lib/api-key-choice";

/** The user's own key for `provider`, or null when they have not set one (or
 *  the stored value can no longer be opened). Callers fall back to the shared
 *  app key — and to the shared quota that comes with it. */
export async function getUserApiKey(
  userId: string,
  provider: ApiKeyProvider,
): Promise<string | null> {
  const { db, tables } = await import("@/db");
  const { and, eq } = await import("drizzle-orm");
  const { open } = await import("@/lib/secret-box.server");

  const rows = await db
    .select({ ciphertext: tables.user_api_keys.ciphertext })
    .from(tables.user_api_keys)
    .where(
      and(eq(tables.user_api_keys.user_id, userId), eq(tables.user_api_keys.provider, provider)),
    )
    .limit(1);

  if (!rows[0]) return null;
  return open(rows[0].ciphertext);
}
