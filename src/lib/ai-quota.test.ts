import { describe, expect, it } from "vitest";

import { AI_QUOTA_MARKER, parseQuotaMessage } from "./ai-quota";

describe("parseQuotaMessage", () => {
  it("쿼터 마커가 붙은 메시지에서 사용자용 문구만 꺼낸다", () => {
    const message = `${AI_QUOTA_MARKER} 오늘 AI 사용량을 모두 썼어요.`;
    expect(parseQuotaMessage(message)).toBe("오늘 AI 사용량을 모두 썼어요.");
  });

  it("마커가 없으면 쿼터 거절이 아니다", () => {
    expect(parseQuotaMessage("네트워크 오류가 발생했습니다.")).toBeNull();
  });

  it("마커가 문장 중간에 있으면 쿼터 거절로 보지 않는다", () => {
    // 접두사일 때만 인정한다 — 본문에 마커 문자열이 섞인 사용자 입력이
    // 쿼터 안내로 둔갑하면 안 된다.
    expect(parseQuotaMessage(`오류: ${AI_QUOTA_MARKER} 뭔가`)).toBeNull();
  });

  it("마커만 있고 본문이 없으면 빈 문자열을 돌려준다", () => {
    expect(parseQuotaMessage(AI_QUOTA_MARKER)).toBe("");
  });

  it("빈 메시지는 쿼터 거절이 아니다", () => {
    expect(parseQuotaMessage("")).toBeNull();
  });
});
