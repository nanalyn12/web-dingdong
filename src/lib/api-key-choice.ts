// 개인 API 키(BYOK)의 공통 규칙. 순수 모듈 — DB·네트워크·node 내장 모듈에
// 의존하지 않으므로 서버와 화면 양쪽에서 안전하게 import한다.
//
// 이 앱의 외부 AI 비용은 두 갈래다: 개인 키를 등록한 사용자는 자기 요금으로
// 돌고, 나머지는 플랫폼 공용 키를 쓴다. 그 갈림길이 제공자마다·호출부마다
// 흩어지면 새 경로를 추가할 때 조용히 공용 키로 새는 길이 하나 더 생긴다.
// 실제로 그랬다 — Gemini는 호출부 16곳 중 1곳만, Suno는 0곳이 개인 키를 썼다.
// 규칙을 여기 한 곳에 두고, 각 제공자의 게이트웨이가 이것만 부른다.

export const API_KEY_PROVIDERS = ["gemini", "suno"] as const;
export type ApiKeyProvider = (typeof API_KEY_PROVIDERS)[number];

export type ApiKeyProviderMeta = {
  /** 화면에 보이는 제공자 이름 */
  label: string;
  /** 플랫폼 공용 키의 환경변수 이름 (오류 안내에 쓰인다) */
  envName: string;
  /** 키를 어디서 발급받는지 */
  issuerLabel: string;
  /** 입력란 placeholder */
  placeholder: string;
  /** 이 키로 무엇이 동작하는지 */
  what: string;
  /** 편집 권한자(강의·학습송 제작자)에게만 의미가 있는 키인가 */
  editorOnly: boolean;
};

export const API_KEY_PROVIDER_META: Record<ApiKeyProvider, ApiKeyProviderMeta> = {
  gemini: {
    label: "Google Gemini",
    envName: "GEMINI_API_KEY",
    issuerLabel: "Google AI Studio (aistudio.google.com)",
    placeholder: "AIza… 로 시작하는 키를 붙여넣으세요",
    what: "叮叮 대화, 레슨·드라마·학습송 대본, 병음·번역 생성",
    editorOnly: false,
  },
  suno: {
    label: "Suno",
    envName: "SUNO_API_KEY",
    issuerLabel: "sunoapi.org",
    placeholder: "Suno API 키를 붙여넣으세요",
    // Suno는 호출 건당 실제 크레딧이 나가므로 개인 키의 실익이 가장 크다.
    what: "AI 학습송 음원·영상 생성 (수동·예약 모두)",
    editorOnly: true,
  },
};

export type AiKeySource = "user" | "shared";
export type AiKeyChoice = { key: string; source: AiKeySource };

function usable(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * 어느 키로 부를지 정하는 규칙. 개인 키가 있으면 언제나 그것이 이긴다.
 *
 * 빈 문자열을 "없음"으로 보는 이유: 반쯤 채운 .env나 비워 둔 Railway 변수는
 * 미설정이 아니라 빈 문자열로 도착한다.
 */
export function pickAiKey(input: {
  userKey: string | null | undefined;
  sharedKey: string | null | undefined;
  /** 오류 안내에 쓸 제공자. 기본값은 Gemini. */
  provider?: ApiKeyProvider;
}): AiKeyChoice {
  const own = usable(input.userKey);
  if (own) return { key: own, source: "user" };

  const shared = usable(input.sharedKey);
  if (shared) return { key: shared, source: "shared" };

  const meta = API_KEY_PROVIDER_META[input.provider ?? "gemini"];
  throw new Error(
    `${meta.label} 키가 없습니다 — 'AI 설정'에서 본인 ${meta.label} API 키를 등록하거나, ` +
      `관리자가 ${meta.envName} 환경변수를 설정해야 해요.`,
  );
}

// ── Suno 키 검증 판정 ───────────────────────────────────────────────────────

export type SunoProbeVerdict = "ok" | "invalid_key" | "unverified";

/**
 * 저장 전 Suno 키 확인 결과를 분류한다.
 *
 * `invalid_key`일 때만 저장을 막는다. 프로브 경로가 바뀌었거나(404) Suno가
 * 잠깐 불안정하다는(5xx) 이유로 멀쩡한 키를 못 넣게 되는 쪽이, 잘못된 키가
 * 잠시 저장되는 것보다 나쁜 실패다. 402(크레딧 부족)는 오히려 키가 유효하다는
 * 증거이므로 막지 않는다.
 */
export function classifySunoProbe(input: {
  /** fetch가 실패해 응답 자체가 없으면 0 */
  httpStatus: number;
  /** Suno는 200 본문 안에 {code}로 오류를 담아 보내기도 한다 */
  apiCode?: number;
}): SunoProbeVerdict {
  if (input.httpStatus === 401 || input.httpStatus === 403) return "invalid_key";
  if (input.apiCode === 401 || input.apiCode === 403) return "invalid_key";
  if (input.httpStatus === 200 && (input.apiCode === undefined || input.apiCode === 200)) {
    return "ok";
  }
  return "unverified";
}
