// Suno API client + Supabase Storage helpers. SERVER-ONLY (.server.ts).
// Docs: https://docs.sunoapi.org/suno-api/
//   POST /api/v1/generate              → create music generation task
//   GET  /api/v1/generate/record-info  → poll music generation task
//   POST /api/v1/mp4/generate          → create MP4 video task
//   GET  /api/v1/mp4/record-info       → poll MP4 video task
//
// All calls are authenticated with Bearer SUNO_API_KEY (Edge Function Secret).

const SUNO_BASE = "https://api.sunoapi.org";

function getSunoKey(): string {
  const k = process.env.SUNO_API_KEY;
  if (!k) throw new Error("SUNO_API_KEY 시크릿이 설정되지 않았습니다.");
  return k;
}

async function sunoFetch<T>(
  path: string,
  init?: { method?: string; query?: Record<string, string>; body?: unknown },
): Promise<T> {
  const url = new URL(SUNO_BASE + path);
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${getSunoKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let payload: any = null;
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
    throw new Error(
      `Suno: ${codeHint ?? payload.msg ?? "알 수 없는 오류"} (code ${payload.code})`,
    );
  }
  return (payload?.data ?? payload) as T;
}

// ─── Music Generation ───────────────────────────────────────────────────────

export type SunoGenerateInput = {
  prompt: string;          // exact lyrics (Custom Mode + non-instrumental)
  style: string;           // e.g. "k-pop, cute, mandarin pop"
  title: string;
  model?: "V4" | "V4_5" | "V4_5PLUS" | "V4_5ALL" | "V5" | "V5_5";
  negativeTags?: string;
  vocalGender?: "m" | "f";
};

export async function sunoCreateMusic(input: SunoGenerateInput): Promise<{ taskId: string }> {
  return sunoFetch<{ taskId: string }>("/api/v1/generate", {
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

export async function sunoGetMusic(taskId: string): Promise<SunoMusicRecord> {
  return sunoFetch<SunoMusicRecord>("/api/v1/generate/record-info", {
    query: { taskId },
  });
}

// ─── MP4 Video ──────────────────────────────────────────────────────────────

export async function sunoCreateMp4(args: {
  taskId: string;
  audioId: string;
  author?: string;
  domainName?: string;
}): Promise<{ taskId: string }> {
  return sunoFetch<{ taskId: string }>("/api/v1/mp4/generate", {
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

export type SunoMp4Record = {
  taskId: string;
  status:
    | "PENDING"
    | "SUCCESS"
    | "CREATE_TASK_FAILED"
    | "GENERATE_MP4_FAILED"
    | "CALLBACK_EXCEPTION";
  errorMessage?: string | null;
  response?: { videoUrl?: string } | null;
};

export async function sunoGetMp4(taskId: string): Promise<SunoMp4Record> {
  return sunoFetch<SunoMp4Record>("/api/v1/mp4/record-info", {
    query: { taskId },
  });
}

// ─── Storage helpers ────────────────────────────────────────────────────────
// Suno-hosted files expire in ~15 days. Copy them to the `songs` bucket so
// learners always have access. Bucket is private — we mint long-lived signed
// URLs (10 years) and store them in the row.

const TEN_YEARS_SECONDS = 60 * 60 * 24 * 365 * 10;

export async function downloadAndStore(
  sourceUrl: string,
  destPath: string,
  contentType: string,
): Promise<{ path: string; url: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`다운로드 실패 (${res.status}): ${sourceUrl}`);
  const buf = new Uint8Array(await res.arrayBuffer());

  const { error: upErr } = await supabaseAdmin.storage
    .from("songs")
    .upload(destPath, buf, { contentType, upsert: true });
  if (upErr) throw new Error(`Storage 업로드 실패: ${upErr.message}`);

  const { data, error: signErr } = await supabaseAdmin.storage
    .from("songs")
    .createSignedUrl(destPath, TEN_YEARS_SECONDS);
  if (signErr || !data?.signedUrl) {
    throw new Error(`Signed URL 생성 실패: ${signErr?.message ?? "unknown"}`);
  }
  return { path: destPath, url: data.signedUrl };
}
