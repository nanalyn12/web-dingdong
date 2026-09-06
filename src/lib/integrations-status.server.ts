// 연동 상태 계산 — `/integrations` 화면과 홈 콘솔의 "미설정 연동" 숫자가
// 같은 함수를 쓰게 하려고 서버 전용 모듈로 뺐다. 두 곳이 각자 env 키 이름을
// 나열하면 키가 하나 늘어날 때 한쪽만 세고, 카드를 눌러 간 화면의 개수와
// 카드의 숫자가 어긋난다.
//
// SECURITY: 키 값은 절대 나가지 않는다 — 존재 여부(boolean)만 만든다.
// 이 모듈은 process.env를 직접 읽으므로 클라이언트 번들에서 import 금지
// (`.server.ts` 접미사가 그 계약이다). 호출부는 핸들러 안에서 지연 import 한다.

import type { IntegrationStatus } from "./integrations.functions";

export async function computeIntegrationStatus(): Promise<IntegrationStatus[]> {
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
}
