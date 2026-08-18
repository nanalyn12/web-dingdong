// Suno 호출 실패의 성격 판정. 순수 모듈 — 네트워크·DB에 의존하지 않는다.
//
// 왜 따로 두는가: 예전에는 suno.server.ts가 상태 코드를 한국어 문장으로 바꿔
// 던지고, songs.functions.ts가 그 문장을 정규식(`/429|한도|초과|…/`)으로 되짚어
// 재시도 여부를 정했다. 그 사이에서 402(크레딧 소진)와 429(요청 한도)가
// "크레딧이 부족하거나 요청 한도를 초과했어요"라는 한 문장으로 합쳐졌고,
// 정규식이 "초과"에 걸려 크레딧이 바닥난 사용자에게 "1~2분 후 다시 시도하세요"를
// 계속 보여 줬다. 충전 전에는 절대 풀리지 않는데도.
//
// 그래서 성격을 상태 코드에서 **한 번만** 판정하고, 그 뒤로는 문장이 아니라
// 값(kind)으로 나른다. 문구를 고쳐도 판정이 흔들리지 않는다.

export const SUNO_FAILURE_KINDS = [
  "credits", // 크레딧 소진 — 충전해야 풀린다
  "rate_limit", // 순간 요청 한도 — 기다리면 풀린다
  "server", // Suno 측 5xx
  "maintenance", // 점검 중
  "auth", // 키가 틀렸거나 만료
  "bad_request", // 요청 형식 문제
  "sensitive_words", // 가사가 거부됨
  "asset_expired", // Suno 측 자산 만료
  "unknown",
] as const;

export type SunoFailureKind = (typeof SUNO_FAILURE_KINDS)[number];

/** Suno는 HTTP 상태로 알려 줄 때도 있고 200 본문의 `code`로 알려 줄 때도 있다.
 *  둘을 같은 표로 판정한다. */
export function classifySunoFailure(input: {
  httpStatus?: number;
  apiCode?: number;
}): SunoFailureKind {
  const byCode = (n: number | undefined): SunoFailureKind | null => {
    switch (n) {
      case 401:
      case 403:
        return "auth";
      case 402:
        return "credits";
      case 429:
        return "rate_limit";
      case 430:
        return "sensitive_words";
      case 451:
        return "asset_expired";
      case 455:
        return "maintenance";
      case 400:
        return "bad_request";
      default:
        return null;
    }
  };

  const fromBody = byCode(input.apiCode);
  if (fromBody) return fromBody;

  const status = input.httpStatus;
  if (status !== undefined && status >= 500) return "server";
  const fromStatus = byCode(status);
  if (fromStatus) return fromStatus;

  return "unknown";
}

/** 시간이 지나면 저절로 풀리는 실패만 재시도할 가치가 있다. 사람이 손대야
 *  풀리는 실패(충전·키 수정·가사 수정)에 재시도를 권하면, 사용자는 아무것도
 *  달라지지 않는 행동을 반복하게 된다. `unknown`은 안전한 쪽으로 둔다. */
export function isRetryableSunoFailure(kind: SunoFailureKind): boolean {
  return kind === "rate_limit" || kind === "server" || kind === "maintenance";
}

const MESSAGES: Record<SunoFailureKind, string> = {
  credits: "Suno 크레딧이 모두 소진됐어요. sunoapi.org에서 충전한 뒤 이용해 주세요.",
  rate_limit: "Suno 요청이 잠깐 몰렸어요. 1~2분 후 다시 시도해 주세요.",
  server: "Suno 서버에 일시적인 문제가 있어요. 잠시 후 다시 시도해 주세요.",
  maintenance: "Suno가 점검 중이에요. 점검이 끝난 뒤 다시 시도해 주세요.",
  auth: "Suno API 키가 올바르지 않거나 만료됐어요. 'AI 설정'에서 키를 다시 등록해 주세요.",
  bad_request: "Suno가 요청을 거부했어요. 가사·스타일·모델 값을 확인해 주세요.",
  sensitive_words: "가사에 Suno가 거부하는 표현이 있어요. 해당 부분을 고쳐서 다시 만들어 주세요.",
  asset_expired: "Suno 쪽 음원이 만료돼 가져올 수 없어요. 다시 생성해 주세요.",
  unknown: "Suno 요청에 실패했어요.",
};

export function sunoFailureMessage(kind: SunoFailureKind): string {
  return MESSAGES[kind];
}

/** 실패의 성격을 값으로 실어 나르는 에러. 호출부는 메시지를 파싱하지 않고
 *  `kind`를 읽는다. */
export class SunoApiError extends Error {
  readonly kind: SunoFailureKind;
  readonly httpStatus?: number;
  readonly apiCode?: number;

  constructor(input: {
    kind: SunoFailureKind;
    message: string;
    httpStatus?: number;
    apiCode?: number;
  }) {
    super(input.message);
    this.name = "SunoApiError";
    this.kind = input.kind;
    this.httpStatus = input.httpStatus;
    this.apiCode = input.apiCode;
  }
}
