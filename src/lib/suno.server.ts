import { pickAiKey, type AiKeyChoice } from "./api-key-choice";

// Suno API client + media storage helpers. SERVER-ONLY (.server.ts).
// Docs: https://docs.sunoapi.org/suno-api/
//   POST /api/v1/generate              → create music generation task
//   GET  /api/v1/generate/record-info  → poll music generation task
//   POST /api/v1/mp4/generate          → create MP4 video task
//   GET  /api/v1/mp4/record-info       → poll MP4 video task
//
// 인증은 Bearer 토큰. 어느 키를 쓸지는 호출자가 정한다 — 학습송을 만든 사람이
// 개인 Suno 키를 등록해 두었으면 그 키로, 아니면 플랫폼 공용 키로 나간다.
// Suno는 호출 건당 실제 크레딧이 나가므로 이 구분이 곧 비용 귀속이다.
//
// `sunoFetch`가 키를 필수 인자로 받는 이유는 ai-gateway.server.ts와 같다:
// 환경변수 폴백을 함수 안에 두면 호출부가 키를 의식하지 않게 되고, 그렇게
// 조용히 공용 키로 새는 경로가 늘어난다. 지금은 타입 검사가 그걸 막는다.

const SUNO_BASE = "https://api.sunoapi.org";

/** 이 사용자의 개인 Suno 키, 없으면 플랫폼 공용 키. */
export async function resolveSunoKey(userId: string | null | undefined): Promise<AiKeyChoice> {
  let userKey: string | null = null;
  if (userId) {
    const { getUserApiKey } = await import("@/lib/user-api-keys.server");
    userKey = await getUserApiKey(userId, "suno");
  }
  return pickAiKey({ userKey, sharedKey: process.env.SUNO_API_KEY, provider: "suno" });
}

/**
 * 저장 전 키 확인용 호출. 판정은 하지 않고 원자료(상태 코드)만 돌려준다 —
 * 어디까지를 "잘못된 키"로 볼지는 순수 함수 `classifySunoProbe`가 정한다.
 *
 * 잔여 크레딧 조회를 쓰는 이유: 부작용이 없고 크레딧도 소모하지 않는다.
 */
export async function probeSunoKey(
  apiKey: string,
): Promise<{ httpStatus: number; apiCode?: number }> {
  try {
    const res = await fetch(`${SUNO_BASE}/api/v1/generate/credit`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    let apiCode: number | undefined;
    try {
      const body = (await res.json()) as { code?: number };
      if (typeof body?.code === "number") apiCode = body.code;
    } catch {
      // 본문이 JSON이 아니어도 상태 코드만으로 판정할 수 있다.
    }
    return { httpStatus: res.status, apiCode };
  } catch {
    return { httpStatus: 0 }; // 네트워크 실패 → 확인 불가(저장은 막지 않는다)
  }
}

async function sunoFetch<T>(
  path: string,
  init: { apiKey: string; method?: string; query?: Record<string, string>; body?: unknown },
): Promise<T> {
  const url = new URL(SUNO_BASE + path);
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${init.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  // Suno answers with {code, msg, data}; on a gateway error the body is not JSON
  // at all, in which case we keep the raw text so the thrown message can quote it.
  let payload: {
    code?: number;
    msg?: string;
    message?: string;
    raw?: string;
    data?: unknown;
  } | null = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  const snippet = (s: string) => (s.length > 240 ? s.slice(0, 240) + "…" : s);
  const httpHint =
    res.status === 401
      ? "Suno API 키가 올바르지 않거나 만료되었습니다."
      : res.status === 402 || res.status === 429
        ? "Suno 크레딧이 부족하거나 요청 한도를 초과했어요."
        : res.status === 400
          ? "Suno 요청 형식이 잘못되었습니다 (가사/스타일/모델 값 확인)."
          : res.status >= 500
            ? "Suno 서버 오류입니다. 잠시 후 다시 시도해주세요."
            : null;
  if (!res.ok) {
    const apiMsg = payload?.msg || payload?.message;
    const raw = typeof payload?.raw === "string" ? snippet(payload.raw) : null;
    const detail = apiMsg || raw || `(HTTP ${res.status})`;
    throw new Error(
      `Suno API 오류 [${res.status}] — ${httpHint ?? detail}${apiMsg && httpHint ? ` (${apiMsg})` : ""}`,
    );
  }
  if (payload && typeof payload === "object" && "code" in payload && payload.code !== 200) {
    const codeHint =
      payload.code === 401
        ? "API 키 인증 실패"
        : payload.code === 402
          ? "크레딧 부족"
          : payload.code === 429
            ? "요청 한도 초과 — 잠시 후 다시 시도"
            : payload.code === 430
              ? "민감 단어가 포함되어 거부됨"
              : payload.code === 451
                ? "다운로드 실패 (Suno 측 자산 만료 가능)"
                : payload.code === 455
                  ? "Suno 시스템 점검 중"
                  : null;
    throw new Error(`Suno: ${codeHint ?? payload.msg ?? "알 수 없는 오류"} (code ${payload.code})`);
  }
  return (payload?.data ?? payload) as T;
}

// ─── Music Generation ───────────────────────────────────────────────────────

export type SunoGenerateInput = {
  prompt: string; // exact lyrics (Custom Mode + non-instrumental)
  style: string; // e.g. "k-pop, cute, mandarin pop"
  title: string;
  model?: "V4" | "V4_5" | "V4_5PLUS" | "V4_5ALL" | "V5" | "V5_5";
  negativeTags?: string;
  vocalGender?: "m" | "f";
  /** 이 곡의 소유자. 개인 Suno 키가 있으면 그 키로(=그 사람의 크레딧으로) 나간다. */
  userId: string | null;
};

export async function sunoCreateMusic(input: SunoGenerateInput): Promise<{ taskId: string }> {
  const { key } = await resolveSunoKey(input.userId);
  return sunoFetch<{ taskId: string }>("/api/v1/generate", {
    apiKey: key,
    method: "POST",
    body: {
      customMode: true,
      instrumental: false,
      prompt: input.prompt,
      style: input.style,
      title: input.title,
      model: input.model ?? "V4_5",
      negativeTags: input.negativeTags,
      vocalGender: input.vocalGender,
      // callBackUrl is required by the API but we poll instead.
      callBackUrl: "https://example.com/no-callback",
    },
  });
}

// NOTE: Suno's record-info endpoint returns camelCase (audioUrl, imageUrl).
// We keep snake_case fields for back-compat and add camelCase as the source of truth.
export type SunoTrack = {
  id: string;
  audioUrl?: string;
  sourceAudioUrl?: string;
  streamAudioUrl?: string;
  imageUrl?: string;
  sourceImageUrl?: string;
  audio_url?: string;
  source_audio_url?: string;
  stream_audio_url?: string;
  image_url?: string;
  source_image_url?: string;
  title?: string;
  tags?: string;
  duration?: number;
};

export type SunoMusicRecord = {
  taskId: string;
  status:
    | "PENDING"
    | "TEXT_SUCCESS"
    | "FIRST_SUCCESS"
    | "SUCCESS"
    | "CREATE_TASK_FAILED"
    | "GENERATE_AUDIO_FAILED"
    | "CALLBACK_EXCEPTION"
    | "SENSITIVE_WORD_ERROR";
  errorMessage?: string | null;
  response?: { sunoData?: SunoTrack[] } | null;
};

export async function sunoGetMusic(
  taskId: string,
  userId: string | null,
): Promise<SunoMusicRecord> {
  const { key } = await resolveSunoKey(userId);
  return sunoFetch<SunoMusicRecord>("/api/v1/generate/record-info", {
    apiKey: key,
    query: { taskId },
  });
}

// ─── Timestamped (aligned) lyrics ───────────────────────────────────────────
// Suno force-aligns the submitted lyrics against the rendered vocal and returns
// per-word start/end times. This is the only trustworthy source of karaoke
// sync — without it the client can only guess line times from character counts.

export type SunoAlignedWord = {
  word: string;
  success: boolean;
  startS: number;
  endS: number;
  palign?: number;
};

export type SunoTimestampedLyrics = {
  alignedWords?: SunoAlignedWord[];
  waveformData?: number[];
  hootCer?: number;
  isStreamed?: boolean;
};

export async function sunoGetTimestampedLyrics(args: {
  taskId: string;
  audioId: string;
  userId: string | null;
}): Promise<SunoTimestampedLyrics> {
  const { key } = await resolveSunoKey(args.userId);
  return sunoFetch<SunoTimestampedLyrics>("/api/v1/generate/get-timestamped-lyrics", {
    apiKey: key,
    method: "POST",
    body: { taskId: args.taskId, audioId: args.audioId },
  });
}

// ─── MP4 Video ──────────────────────────────────────────────────────────────

export async function sunoCreateMp4(args: {
  taskId: string;
  audioId: string;
  author?: string;
  domainName?: string;
  userId: string | null;
}): Promise<{ taskId: string }> {
  const { key } = await resolveSunoKey(args.userId);
  return sunoFetch<{ taskId: string }>("/api/v1/mp4/generate", {
    apiKey: key,
    method: "POST",
    body: {
      taskId: args.taskId,
      audioId: args.audioId,
      author: args.author,
      domainName: args.domainName,
      callBackUrl: "https://example.com/no-callback",
    },
  });
}

export type SunoMp4Status =
  | "PENDING"
  | "SUCCESS"
  | "CREATE_TASK_FAILED"
  | "GENERATE_MP4_FAILED"
  | "CALLBACK_EXCEPTION";

export type SunoMp4Record = {
  taskId: string;
  status: SunoMp4Status;
  errorMessage?: string | null;
  response?: { videoUrl?: string } | null;
};

/** Unlike the music endpoint, the MP4 endpoint reports progress in
 * `successFlag` — there is no `status` field on the payload at all. Reading
 * `status` yielded undefined, which callers read as "still generating", so a
 * finished video was never downloaded and quietly expired after 15 days.
 * Normalize here so callers keep one field to check. */
export async function sunoGetMp4(taskId: string, userId: string | null): Promise<SunoMp4Record> {
  const { key } = await resolveSunoKey(userId);
  const raw = await sunoFetch<
    Omit<SunoMp4Record, "status"> & {
      status?: SunoMp4Status;
      successFlag?: SunoMp4Status;
    }
  >("/api/v1/mp4/record-info", { apiKey: key, query: { taskId } });
  return { ...raw, status: raw.successFlag ?? raw.status ?? "PENDING" };
}

// ─── Storage helpers ────────────────────────────────────────────────────────
// Suno-hosted files expire in ~15 days. Copy them onto the app's persistent
// disk (a Railway volume mounted at MEDIA_DIR) and serve them through the
// /media/* route. The stored URL is site-relative so it works on any domain.

export function getMediaDir(): string {
  return process.env.MEDIA_DIR || "./data/media";
}

export async function downloadAndStore(
  sourceUrl: string,
  destPath: string,
  _contentType: string,
): Promise<{ path: string; url: string }> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname, join, normalize } = await import("node:path");

  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`다운로드 실패 (${res.status}): ${sourceUrl}`);
  const buf = new Uint8Array(await res.arrayBuffer());

  const safePath = normalize(destPath).replace(/^([./\\])+/, "");
  const fullPath = join(getMediaDir(), safePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buf);

  return { path: safePath, url: `/media/${safePath.replace(/\\/g, "/")}` };
}
