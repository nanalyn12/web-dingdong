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
    const { db, tables } = await import("@/db");

    const has = (name: string) => !!process.env[name]?.trim();

    // YouTube는 env가 아니라 OAuth refresh token(app_credentials)로 판단.
    const creds = await db
      .select({ key: tables.app_credentials.key, value: tables.app_credentials.value })
      .from(tables.app_credentials);
    const credMap = new Map(creds.map((c) => [c.key, c.value]));
    const ytConnected = !!(credMap.get("youtube") as { refresh_token?: string } | undefined)
      ?.refresh_token;
    const backup = credMap.get("backup_status") as
      | { last_date?: string; rows?: number; bytes?: number }
      | undefined;

    return [
      {
        id: "gemini",
        label: "Google Gemini",
        what: "AI 대본·작사·레슨/연계 학습 생성",
        configured: has("GEMINI_API_KEY"),
        testable: true,
      },
      {
        id: "suno",
        label: "Suno (음악 생성)",
        what: "AI 학습송 생성 (수동·예약 모두)",
        configured: has("SUNO_API_KEY"),
        testable: true,
      },
      {
        id: "pexels",
        label: "Pexels",
        what: "영상 스튜디오의 스톡 영상 클립",
        configured: has("PEXELS_API_KEY"),
        testable: true,
      },
      {
        id: "google_tts",
        label: "Google Cloud TTS",
        what: "영상 나레이션 음성 합성",
        configured: has("GOOGLE_TTS_API_KEY"),
        testable: true,
      },
      {
        id: "youtube",
        label: "YouTube 업로드",
        what: "영상 자동 업로드 (미연결이어도 웹 전용으로 게시됨)",
        configured: ytConnected,
        detail: ytConnected ? undefined : "연결 만료/미연결 — 스튜디오에서 연결",
        testable: true,
      },
      {
        id: "webpush",
        label: "웹 푸시 알림",
        what: "복습·작업 완료 알림",
        configured: has("VAPID_PUBLIC_KEY") && has("VAPID_PRIVATE_KEY"),
        testable: false,
      },
      {
        id: "backup",
        label: "DB 자동 백업",
        what: "매일 04:30 KST 전체 백업",
        configured: !!backup?.last_date,
        detail: backup?.last_date
          ? `마지막 백업 ${backup.last_date} · ${backup.rows ?? 0}행 · ${Math.round((backup.bytes ?? 0) / 1024)}KB`
          : "아직 백업 기록 없음",
        testable: false,
      },
    ];
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
