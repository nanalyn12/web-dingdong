import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/auth-middleware";
import { assertEditor } from "@/lib/courses.functions";

// 외부 연동 상태 대시보드.
// SECURITY: 키 값은 절대 클라이언트로 보내지 않는다 — 존재 여부(boolean)와
// 연결 테스트 결과만 노출한다. 테스트는 과금이 없거나 무시할 수준의
// 엔드포인트(목록/조회)만 호출한다.
// 추후 확장: 교사별 개인 키를 지원하면 scope: "app" | "user" 를 추가하고
// user 스코프는 해당 교사의 키 상태를 보여준다.

export const INTEGRATION_IDS = [
  "gemini",
  "suno",
  "pexels",
  "google_tts",
  "youtube",
  "webpush",
  "backup",
] as const;
export type IntegrationId = (typeof INTEGRATION_IDS)[number];

export type IntegrationStatus = {
  id: IntegrationId;
  label: string;
  what: string; // 이 연동이 없으면 무엇이 안 되는지
  configured: boolean;
  detail?: string; // 부가 정보 (예: 마지막 백업 시각)
  testable: boolean;
};

export const getIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<IntegrationStatus[]> => {
    await assertEditor(context.userId);
    const { computeIntegrationStatus } = await import("@/lib/integrations-status.server");
    return computeIntegrationStatus();
  });

export type TestResult = { ok: boolean; message: string };

/** 연동별 실연결 테스트. 과금 없는 조회 엔드포인트만 사용. */
export const testIntegration = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => z.object({ id: z.enum(INTEGRATION_IDS) }).parse(i))
  .handler(async ({ data, context }): Promise<TestResult> => {
    await assertEditor(context.userId);
    try {
      switch (data.id) {
        case "gemini": {
          const key = process.env.GEMINI_API_KEY;
          if (!key) return { ok: false, message: "GEMINI_API_KEY 미설정" };
          const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
            headers: { "x-goog-api-key": key },
          });
          return r.ok
            ? { ok: true, message: "정상 — 모델 목록 조회 성공" }
            : { ok: false, message: `인증 실패 (HTTP ${r.status})` };
        }
        case "suno": {
          const key = process.env.SUNO_API_KEY;
          if (!key) return { ok: false, message: "SUNO_API_KEY 미설정" };
          // record-info는 조회 전용(무과금). 더미 taskId라도 인증은 검증됨.
          const r = await fetch(
            "https://api.sunoapi.org/api/v1/generate/record-info?taskId=healthcheck",
            { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } },
          );
          if (r.status === 401) return { ok: false, message: "키 인증 실패 (401)" };
          const body = (await r.json().catch(() => null)) as { code?: number } | null;
          if (body?.code === 401) return { ok: false, message: "키 인증 실패" };
          if (body?.code === 402) return { ok: false, message: "크레딧 부족" };
          return { ok: true, message: "정상 — 키 인증 통과" };
        }
        case "pexels": {
          const key = process.env.PEXELS_API_KEY;
          if (!key) return { ok: false, message: "PEXELS_API_KEY 미설정" };
          const r = await fetch("https://api.pexels.com/videos/search?query=test&per_page=1", {
            headers: { Authorization: key },
          });
          return r.ok
            ? { ok: true, message: "정상 — 검색 응답 확인" }
            : { ok: false, message: `인증 실패 (HTTP ${r.status})` };
        }
        case "google_tts": {
          const key = process.env.GOOGLE_TTS_API_KEY;
          if (!key) return { ok: false, message: "GOOGLE_TTS_API_KEY 미설정" };
          const r = await fetch(
            `https://texttospeech.googleapis.com/v1/voices?key=${encodeURIComponent(key)}&languageCode=ko-KR`,
          );
          return r.ok
            ? { ok: true, message: "정상 — 음성 목록 조회 성공" }
            : { ok: false, message: `인증 실패 (HTTP ${r.status})` };
        }
        case "youtube": {
          const { YouTubeAuthError } = await import("@/lib/video/youtube.server");
          try {
            // accessToken()은 비공개 — 설명 갱신용 API를 쓰지 않고 토큰만 검증하기
            // 위해 연결 여부 확인 함수를 사용한다.
            const { youtubeConnected } = await import("@/lib/video/youtube.server");
            const connected = await youtubeConnected();
            return connected
              ? { ok: true, message: "연결됨 — 업로드 가능" }
              : { ok: false, message: "미연결 (웹 전용 게시로 자동 대체됨)" };
          } catch (e) {
            if (e instanceof YouTubeAuthError) {
              return { ok: false, message: "연결 만료 — 스튜디오에서 재연결 필요" };
            }
            throw e;
          }
        }
        default:
          return { ok: false, message: "이 연동은 테스트를 지원하지 않아요." };
      }
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message.slice(0, 200) : "테스트 실패",
      };
    }
  });
