import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { pickAiKey, type AiKeyChoice } from "./api-key-choice";

// Gemini 호출의 단일 출입구. SERVER-ONLY.
//
// 키를 개인/공용 중 어느 쪽으로 고를지의 규칙은 제공자 공통이라
// api-key-choice.ts에 있다. 여기서는 그 규칙에 Gemini의 공용 키를 물려
// provider를 만들어 주는 일만 한다.
//
// `createTextProvider`가 키를 **필수 인자**로 받는 것이 핵심이다. 환경변수
// 폴백을 이 함수 밖으로 밀어내면, 키를 어디서 가져올지 정하지 않은 호출부는
// 컴파일이 되지 않는다. 완결성을 런타임 점검이 아니라 타입 검사가 보장한다.

export type { AiKeyChoice, AiKeySource } from "./api-key-choice";

/**
 * `userId`의 개인 키를 찾아보고 없으면 공용 키로 떨어진다.
 *
 * `userId`가 null인 경우(로그인 없는 전역 캐시 생성 등)는 공용 키만 본다.
 * 개인 키가 저장돼 있어도 열리지 않으면(BETTER_AUTH_SECRET 교체 등)
 * `getUserApiKey`가 null을 돌려주므로 조용히 공용 키로 이어진다 — 기능이
 * 멈추는 것보다 낫다.
 */
export async function resolveAiKey(userId: string | null | undefined): Promise<AiKeyChoice> {
  let userKey: string | null = null;
  if (userId) {
    const { getUserApiKey } = await import("@/lib/user-api-keys.server");
    userKey = await getUserApiKey(userId, "gemini");
  }
  return pickAiKey({ userKey, sharedKey: process.env.GEMINI_API_KEY, provider: "gemini" });
}

/**
 * 텍스트 모델 제공자. 모델 id는 전 저장소가 "google/gemini-..." 형태로 넘기므로
 * google/ 접두사를 떼어 준다.
 *
 * 키를 직접 들고 있는 곳에서만 쓴다. 보통은 `createTextProviderFor(userId)`가
 * 맞는 진입점이다.
 */
export function createTextProvider(apiKey: string) {
  if (!apiKey) {
    throw new Error("AI 키가 비어 있습니다.");
  }
  const provider = createOpenAICompatible({
    name: "gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    headers: { Authorization: `Bearer ${apiKey}` },
    // Without this the JSON schema of Output.object() is silently dropped
    // and the model free-forms its JSON shape.
    supportsStructuredOutputs: true,
  });
  return (modelId: string) => provider(modelId.replace(/^google\//, ""));
}

/**
 * 호출부가 쓰는 표준 진입점. 이 사용자의 키가 있으면 그것으로, 없으면 공용
 * 키로 도는 제공자를 만든다.
 *
 * 백그라운드 작업에는 그 작업의 소유자 id를 넘긴다 — 학습송 예약은
 * `song_schedules.created_by`, 영상 작업은 `video_jobs.created_by`.
 */
export async function createTextProviderFor(userId: string | null | undefined) {
  const { key } = await resolveAiKey(userId);
  return createTextProvider(key);
}
