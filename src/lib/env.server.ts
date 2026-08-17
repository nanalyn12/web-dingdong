// Single source of truth for the server environment. Every secret this app uses
// arrives through here — never as a literal in source (see
// .claude/skills/secret-hygiene/SKILL.md).
//
// Why a boot-time check: without it, a missing key surfaces as a confusing
// runtime failure deep inside a feature (a 500 on video render, an AI call that
// throws mid-generation). Reporting the whole picture once at boot turns that
// into one readable line in the Railway log.
//
// SERVER-ONLY — never import from a client-bundled path.

declare global {
  var __serverEnvReported: boolean | undefined;
}

export type EnvEntry = {
  /** Environment variable name, exactly as it appears in .env.example. */
  name: string;
  /** Required keys make the app unusable when absent; optional ones only disable a feature. */
  required: boolean;
  /** What stops working without it. Written for a human reading a boot log. */
  feature: string;
};

/** Every operator-provided variable. Platform-injected ones (RAILWAY_*) are not
 *  listed — nobody sets those by hand, so warning about them would be noise. */
export const ENV_SPEC: EnvEntry[] = [
  { name: "DATABASE_URL", required: true, feature: "데이터베이스 전체 (앱이 동작하지 않음)" },
  {
    name: "BETTER_AUTH_SECRET",
    required: true,
    feature: "로그인 세션 서명 + 사용자 개인 API 키 암호화",
  },
  {
    name: "BETTER_AUTH_URL",
    required: false,
    feature: "배포 도메인 지정 (미설정 시 Railway 도메인 사용)",
  },
  { name: "GOOGLE_CLIENT_ID", required: false, feature: "구글 로그인 · 유튜브 업로드 연동" },
  { name: "GOOGLE_CLIENT_SECRET", required: false, feature: "구글 로그인 · 유튜브 업로드 연동" },
  { name: "ADMIN_EMAILS", required: false, feature: "관리자 자동 승격 허용 목록" },
  { name: "TEACHER_EMAILS", required: false, feature: "교사 자동 승격 허용 목록" },
  { name: "MEDIA_DIR", required: false, feature: "미디어 저장 경로 (미설정 시 ./data/media)" },
  {
    name: "GEMINI_API_KEY",
    required: false,
    feature: "AI 생성 전반 (대본 · 드라마 · 레슨 · 이미지 · 병음/번역)",
  },
  { name: "PEXELS_API_KEY", required: false, feature: "영상 스튜디오 배경 영상 소스" },
  { name: "GOOGLE_TTS_API_KEY", required: false, feature: "영상 내레이션 음성 합성" },
  { name: "SUNO_API_KEY", required: false, feature: "학습송 음원 생성" },
  { name: "SUPADATA_API_KEY", required: false, feature: "유튜브 자막 수집" },
  { name: "VAPID_PUBLIC_KEY", required: false, feature: "웹 푸시 알림" },
  { name: "VAPID_PRIVATE_KEY", required: false, feature: "웹 푸시 알림" },
  { name: "VAPID_SUBJECT", required: false, feature: "웹 푸시 알림 발신자 정보" },
  { name: "CRON_HOOK_SECRET", required: false, feature: "예약 웹훅(재참여 푸시 · 영상 생성) 인증" },
  {
    name: "FFMPEG_PATH",
    required: false,
    feature: "ffmpeg 경로 지정 (미설정 시 ffmpeg-static 사용)",
  },
];

export type EnvCheck = {
  missingRequired: string[];
  disabledFeatures: { name: string; feature: string }[];
};

/** A key set to an empty or whitespace-only string is treated as unset — that is
 *  what a half-filled .env or a blank Railway variable actually looks like. */
function isSet(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Pure check against an arbitrary source, so it is testable without touching
 *  the real process environment. */
export function checkEnv(source: Record<string, string | undefined>): EnvCheck {
  const missingRequired: string[] = [];
  const disabledFeatures: { name: string; feature: string }[] = [];

  for (const entry of ENV_SPEC) {
    if (isSet(source[entry.name])) continue;
    if (entry.required) missingRequired.push(entry.name);
    else disabledFeatures.push({ name: entry.name, feature: entry.feature });
  }

  return { missingRequired, disabledFeatures };
}

/** Throws when a required key is missing. Use where continuing is pointless —
 *  scripts, migrations, one-off jobs. */
export function assertServerEnv(source: Record<string, string | undefined> = process.env): void {
  const { missingRequired } = checkEnv(source);
  if (missingRequired.length === 0) return;

  const lines = missingRequired.map((name) => {
    const entry = ENV_SPEC.find((candidate) => candidate.name === name);
    return `  - ${name}: ${entry?.feature ?? ""}`;
  });
  throw new Error(`필수 환경변수가 설정되지 않았습니다:\n${lines.join("\n")}`);
}

type EnvLogger = { error: (message: string) => void; warn: (message: string) => void };

/** Boot-time report. Deliberately does NOT throw: a missing optional key should
 *  not take the whole site down, and a missing required key already fails loudly
 *  at the point of use — what was missing here was the single readable summary. */
export function reportServerEnv(
  source: Record<string, string | undefined> = process.env,
  logger: EnvLogger = console,
): void {
  const { missingRequired, disabledFeatures } = checkEnv(source);

  if (missingRequired.length > 0) {
    const lines = missingRequired.map((name) => {
      const entry = ENV_SPEC.find((candidate) => candidate.name === name);
      return `  - ${name}: ${entry?.feature ?? ""}`;
    });
    logger.error(`[env] 필수 환경변수 누락 — 앱이 정상 동작하지 않습니다:\n${lines.join("\n")}`);
  }

  if (disabledFeatures.length > 0) {
    const lines = disabledFeatures.map((entry) => `  - ${entry.name}: ${entry.feature}`);
    logger.warn(`[env] 다음 기능이 비활성 상태입니다:\n${lines.join("\n")}`);
  }
}
