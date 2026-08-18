import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  SUNO_FAILURE_KINDS,
  classifySunoFailure,
  isRetryableSunoFailure,
  sunoFailureMessage,
} from "./suno-failure";

// ── L1-1 / L1-2 / L1-5: 상태 코드 → 실패 성격 ──────────────────────────────

describe("classifySunoFailure", () => {
  it("402는 크레딧 소진이다", () => {
    expect(classifySunoFailure({ httpStatus: 402 })).toBe("credits");
  });

  it("본문 code로 온 402도 같게 분류한다", () => {
    expect(classifySunoFailure({ httpStatus: 200, apiCode: 402 })).toBe("credits");
  });

  it("429는 일시적 한도다", () => {
    expect(classifySunoFailure({ httpStatus: 429 })).toBe("rate_limit");
    expect(classifySunoFailure({ httpStatus: 200, apiCode: 429 })).toBe("rate_limit");
  });

  it("402와 429를 한 덩어리로 묶지 않는다", () => {
    // 이 둘을 합쳐 놓은 것이 "충전해야 하는데 1~2분 뒤 재시도하라"는 오안내의 뿌리였다.
    expect(classifySunoFailure({ httpStatus: 402 })).not.toBe(
      classifySunoFailure({ httpStatus: 429 }),
    );
  });

  it("나머지 상태도 성격대로 나눈다", () => {
    expect(classifySunoFailure({ httpStatus: 401 })).toBe("auth");
    expect(classifySunoFailure({ httpStatus: 400 })).toBe("bad_request");
    expect(classifySunoFailure({ httpStatus: 500 })).toBe("server");
    expect(classifySunoFailure({ httpStatus: 503 })).toBe("server");
    expect(classifySunoFailure({ httpStatus: 200, apiCode: 430 })).toBe("sensitive_words");
    expect(classifySunoFailure({ httpStatus: 200, apiCode: 451 })).toBe("asset_expired");
    expect(classifySunoFailure({ httpStatus: 200, apiCode: 455 })).toBe("maintenance");
  });

  it("모르는 상태는 unknown이다", () => {
    expect(classifySunoFailure({ httpStatus: 418 })).toBe("unknown");
    expect(classifySunoFailure({})).toBe("unknown");
  });
});

// ── L1-6 / L1-7: 재시도 판정 ───────────────────────────────────────────────

describe("isRetryableSunoFailure", () => {
  it("시간이 풀어 주는 실패만 재시도 가능이다", () => {
    expect(isRetryableSunoFailure("rate_limit")).toBe(true);
    expect(isRetryableSunoFailure("server")).toBe(true);
    expect(isRetryableSunoFailure("maintenance")).toBe(true);
  });

  it("사람이 손대야 풀리는 실패는 재시도 불가다", () => {
    for (const kind of [
      "credits",
      "auth",
      "bad_request",
      "sensitive_words",
      "asset_expired",
    ] as const) {
      expect(isRetryableSunoFailure(kind), kind).toBe(false);
    }
  });

  it("모르면 재시도를 권하지 않는다", () => {
    expect(isRetryableSunoFailure("unknown")).toBe(false);
  });
});

// ── L1-3 / L1-4 / L1-8: 사용자 문구 ────────────────────────────────────────

describe("sunoFailureMessage", () => {
  it("크레딧 소진과 요청 한도는 다른 말을 한다", () => {
    expect(sunoFailureMessage("credits")).not.toBe(sunoFailureMessage("rate_limit"));
  });

  it("크레딧 문구는 재시도를 권하지 않고 충전을 안내한다", () => {
    const m = sunoFailureMessage("credits");
    expect(m).toContain("크레딧");
    expect(m).not.toContain("다시 시도");
  });

  it("일시적 한도 문구는 다시 시도를 안내한다", () => {
    expect(sunoFailureMessage("rate_limit")).toContain("다시 시도");
  });

  it("모든 kind가 문구를 갖는다", () => {
    for (const kind of SUNO_FAILURE_KINDS) {
      expect(sunoFailureMessage(kind).length, kind).toBeGreaterThan(0);
    }
  });
});

// ── L1-9: 문자열 매칭 분류가 남지 않았는가 ─────────────────────────────────

describe("분류 경로", () => {
  it("songs.functions.ts가 오류 문장을 정규식으로 판정하지 않는다", () => {
    // 문장을 보고 성격을 되짚는 방식은 문구를 고칠 때마다 조용히 깨진다.
    const src = readFileSync(join(process.cwd(), "src", "lib", "songs.functions.ts"), "utf8");
    expect(src).not.toContain("한도|초과");
  });
});
