// Video generation pipeline. SERVER-ONLY.
// Steps: script(Gemini) → clips(Pexels) → tts(Google Cloud) → srt → render(ffmpeg)
// → thumbnail → [youtube upload] → drama learning content.
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline as streamPipeline } from "node:stream/promises";
import { eq } from "drizzle-orm";

import { db, tables } from "@/db";
import { splitSentences, wrapSubtitle } from "./subtitles";
import type { Json } from "@/db/schema";
import { getMediaDir } from "@/lib/suno.server";
import { pinyinFor } from "./pinyin";
import { ensureSceneKorean } from "./translate.server";
import { FOCUS_LABEL, levelFromAudience } from "./config";
import type { SceneSegment, ScriptScene, VideoJobConfig, VideoScript } from "./config";
import type { LessonEnrichment } from "./lesson-enrich.server";

// ─── job state helpers ───────────────────────────────────────────────────────

async function setJob(jobId: string, patch: Record<string, unknown>) {
  await db
    .update(tables.video_jobs)
    .set({ ...patch, updated_at: new Date().toISOString() })
    .where(eq(tables.video_jobs.id, jobId));
}

async function step(jobId: string, label: string, progress: number) {
  console.log(`[video ${jobId.slice(0, 8)}] ${progress}% ${label}`);
  await setJob(jobId, { step: label, progress });
}

// ─── simple in-process queue (concurrency 1) ────────────────────────────────

let working = false;

export function kickVideoWorker() {
  if (working) return;
  working = true;
  void (async () => {
    try {
      for (;;) {
        const next = await db
          .select({ id: tables.video_jobs.id })
          .from(tables.video_jobs)
          .where(eq(tables.video_jobs.status, "queued"))
          .orderBy(tables.video_jobs.created_at)
          .limit(1);
        if (!next[0]) break;
        await runVideoJob(next[0].id);
      }
    } finally {
      working = false;
    }
  })();
}

// ─── ffmpeg helpers ──────────────────────────────────────────────────────────

let cachedFfmpeg: string | undefined;

async function ffmpegPath(): Promise<string> {
  if (cachedFfmpeg) return cachedFfmpeg;
  if (process.env.FFMPEG_PATH) return (cachedFfmpeg = process.env.FFMPEG_PATH);
  // Prefer the system ffmpeg — full build with drawtext/subtitles filters
  // (installed on Railway via RAILPACK_DEPLOY_APT_PACKAGES=ffmpeg).
  const systemOk = await new Promise<boolean>((resolve) => {
    const ps = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    ps.on("error", () => resolve(false));
    ps.on("close", (code) => resolve(code === 0));
  });
  if (systemOk) return (cachedFfmpeg = "ffmpeg");
  // Fallback: ffmpeg-static (CJS, relies on __dirname — load natively via
  // createRequire so the bundler leaves it alone). Note: its Linux build
  // lacks drawtext/subtitles; fine for local Windows dev.
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  const p = req("ffmpeg-static") as string | null;
  if (!p) throw new Error("ffmpeg 바이너리를 찾을 수 없습니다.");
  return (cachedFfmpeg = p);
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ps = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    ps.stderr.on("data", (d) => {
      err += String(d);
      if (err.length > 8000) err = err.slice(-8000);
    });
    ps.on("error", reject);
    ps.on("close", (code) => {
      if (code === 0) return resolve();
      // ffmpeg buries the real cause under 600 chars of encoder statistics.
      // A full disk is the one failure the operator must act on, so say it
      // plainly instead of making them read x264 parameters.
      if (/No space left on device/i.test(err)) {
        return reject(
          new Error(
            "저장 공간이 부족해 영상을 쓰지 못했어요. Railway 볼륨을 늘리거나 오래된 영상을 정리해주세요.",
          ),
        );
      }
      reject(new Error(`ffmpeg 실패 (code ${code}): …${err.slice(-600)}`));
    });
  });
}

// ─── disk space ──────────────────────────────────────────────────────────────

/** Free bytes on the media volume, or null when the platform can't tell us. */
async function freeMediaBytes(): Promise<number | null> {
  try {
    const { statfs } = await import("node:fs/promises");
    const st = await statfs(getMediaDir());
    return st.bavail * st.bsize;
  } catch {
    return null; // statfs is unavailable on some platforms — skip the check
  }
}

/** Rough size of the finished mp4. The rate is measured, not theoretical: the
 * rendered library averages ~1.8 Mbps at 720p (crf 23 over stock footage, which
 * compresses worse than a static talking head). 1080p is scaled from that. */
function estimateOutputBytes(cfg: VideoJobConfig): number {
  const bitsPerSec = cfg.resolution === "1920x1080" ? 3_500_000 : 1_800_000;
  return ((cfg.lengthSeconds + 2) * bitsPerSec) / 8 + 1_000_000;
}

/** Refuse to start a render that cannot possibly fit.
 *
 * Without this the job runs the whole way — Gemini script, Google TTS for every
 * sentence, a Pexels clip per scene — and only dies at the final mux, so a full
 * volume burns real API spend on each of the eight daily schedules. Headroom is
 * 2x the estimate: the mux writes the mp4, then the BGM pass rewrites it. */
async function assertRenderSpace(cfg: VideoJobConfig): Promise<void> {
  const free = await freeMediaBytes();
  if (free === null) return;
  const need = estimateOutputBytes(cfg) * 2;
  if (free >= need) return;
  const mb = (n: number) => `${Math.round(n / 1_000_000)}MB`;
  throw new Error(
    `저장 공간 부족 — 남은 용량 ${mb(free)}, 이 영상에 최소 ${mb(need)} 필요. ` +
      `Railway 볼륨을 늘리거나 오래된 영상을 정리한 뒤 다시 시도해주세요.`,
  );
}

// CJK-capable font for drawtext/subtitles — downloaded once, cached on disk.
const FONT_URL =
  "https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/Korean/NotoSansCJKkr-Bold.otf";

async function ensureFont(): Promise<string> {
  const dir = join(getMediaDir(), "fonts");
  const file = join(dir, "NotoSansCJKkr-Bold.otf");
  try {
    await readFile(file);
    return file;
  } catch {
    /* download below */
  }
  await mkdir(dir, { recursive: true });
  const res = await fetch(FONT_URL, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`폰트 다운로드 실패 (${res.status})`);
  await streamPipeline(Readable.fromWeb(res.body as never), createWriteStream(file));
  return file;
}

// Windows drive colons and backslashes break ffmpeg filter args.
function filterPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

// Split a title into up to two lines of ~max chars, breaking on spaces.
function wrapTitle(title: string, max: number): [string, string] {
  const t = title.trim().slice(0, max * 2);
  if (t.length <= max) return [t, ""];
  const cut = t.lastIndexOf(" ", max);
  const at = cut > max * 0.4 ? cut : max;
  return [t.slice(0, at).trim(), t.slice(at).trim()];
}

function escapeDrawtext(t: string): string {
  return t.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/%/g, "\\%");
}

// ─── script generation ───────────────────────────────────────────────────────

// Parse the model's JSON, tolerating the most common malformations Gemini
// emits in free-form mode (code fences, trailing commas, a stray unescaped
// newline inside a string). Returns null so the caller can retry.
function tryParseScript(text: string): VideoScript | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  const slice = cleaned.slice(s, e + 1);
  for (const candidate of [slice, slice.replace(/,\s*([}\]])/g, "$1")]) {
    try {
      const parsed = JSON.parse(candidate) as VideoScript;
      if (Array.isArray(parsed.scenes) && parsed.scenes.length > 0) return parsed;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

async function generateScript(cfg: VideoJobConfig): Promise<VideoScript> {
  const { createTextProvider } = await import("@/lib/ai-gateway.server");
  const { generateText } = await import("ai");
  const gateway = createTextProvider();

  const focusKo = {
    culture: "중국 문화 상식",
    grammar: "중국어 어법 포인트",
    entertainment: "중국 연예/트렌드",
    daily: "일상 회화 표현",
  }[cfg.focus];
  const perScene = Math.round(cfg.lengthSeconds / cfg.clipCount);
  const narrLang = cfg.language === "ko" ? "한국어" : "중국어(간체)";

  const topicLine = cfg.topic?.trim()
    ? `주제: "${cfg.topic}" — 반드시 이 주제를 그대로 다뤄. 키워드는 참고일 뿐, 주제를 바꾸지 마.`
    : `주제: (지정 없음 — 키워드 "${cfg.keyword}"에 딱 맞는 흥미로운 주제를 직접 정해)`;

  const prompt = `너는 한국인 중국어 학습자를 위한 유튜브 교육 영상 작가야.
키워드: "${cfg.keyword}" / 중점: ${focusKo}
${topicLine}
타겟 시청자: ${cfg.audience}
영상 길이: 약 ${cfg.lengthSeconds}초, 장면 ${cfg.clipCount}개 (장면당 약 ${perScene}초)
나레이션 언어: ${narrLang}

각 장면 구성:
- narration: ${narrLang} 나레이션 2~3문장. 소리내어 읽으면 약 ${perScene}초 분량 (${cfg.language === "ko" ? `${Math.round(perScene * 5.5)}자 내외` : `${Math.round(perScene * 4)}자 내외`}). 각 문장은 마침표/물음표/느낌표로 끝나야 해. 마크다운/이모지 금지.${
    cfg.language === "ko"
      ? `\n- narration 안에 이 장면의 핵심 중국어 표현(zh)을 간체 한자 그대로 자연스럽게 넣어 (예: "이럴 땐 你好라고 인사해요"). 발음을 한글로 옮겨 적지 마 — 한자로 쓰면 중국어 원어민 음성으로 읽어줘.`
      : ""
  }
- narration_ko: 위 narration 전체의 한국어 번역. 요약·의역 축약 금지 — narration의 모든 문장을 빠짐없이 옮길 것. 문장 수도 narration과 동일하게.${
    cfg.language === "ko" ? " (나레이션이 한국어면 narration을 그대로 복사)" : ""
  }
- zh: 이 장면에서 가르치는 핵심 중국어 문장/표현 (간체 한자만). narration 전체가 아니라 짧은 표현 1개.
- pinyin: zh의 병음 (성조 기호)
- ko: zh의 한국어 번역
- pexels_query: 이 장면에 어울리는 스톡 영상 검색어 (영어 2~4단어, 구체적 사물/풍경/행동)
- vocab: 이 장면에서 배우는 중국어 단어 3~5개. 각 항목 { "zh": 한자, "pinyin": 성조 병음, "ko": 뜻, "hsk": 1~9 }
- quiz: 이 장면 내용 기반 문제 정확히 2개. 1개는 {"type":"choice","question":"...","options":["A안","B안","C안","D안"],"answer":"정답 옵션 텍스트 그대로","explanation":"..."}, 1개는 {"type":"fill","question":"빈칸이 ___인 중국어 문장","answer":"빈칸 한자","explanation":"..."}

첫 장면은 주제 소개(훅), 마지막 장면은 요약+구독 유도.
반드시 아래 JSON만 출력 (코드펜스 금지):
{"title":"유튜브 제목(한국어, 40자 이내, 키워드 포함)","description":"유튜브 설명 2~3문장 + 해시태그 3개","tags":["태그1","태그2","태그3","태그4","태그5"],"scenes":[{"index":1,"narration":"...","narration_ko":"...","zh":"...","pinyin":"...","ko":"...","pexels_query":"...","vocab":[{"zh":"...","pinyin":"...","ko":"...","hsk":1}],"quiz":[{"type":"choice","question":"...","options":["..."],"answer":"...","explanation":"..."}]}]}`;

  // Gemini occasionally emits malformed JSON in free-form mode; regenerate
  // once (a fresh sample almost always parses) before giving up.
  let parsed: VideoScript | null = null;
  let lastText = "";
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    const { text } = await generateText({
      model: gateway("google/gemini-2.5-flash"),
      prompt,
      temperature: attempt === 0 ? 0.6 : 0.3,
      maxOutputTokens: 16000,
    });
    lastText = text;
    parsed = tryParseScript(text);
    if (!parsed && attempt === 0) {
      console.warn("[video] 대본 JSON 파싱 실패 — 재생성 시도");
    }
  }
  if (!parsed) {
    throw new Error(`대본 JSON 파싱 실패: ${lastText.slice(0, 200)}`);
  }
  parsed.scenes = parsed.scenes.slice(0, cfg.clipCount).map((sc, i) => ({
    ...sc,
    index: i + 1,
  }));
  return parsed;
}

// ─── Pexels ──────────────────────────────────────────────────────────────────

type PexelsVideoFile = { width: number; height: number; link: string };

async function pexelsClip(
  query: string,
  cfg: VideoJobConfig,
  dest: string,
): Promise<boolean> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error("PEXELS_API_KEY 미설정 — pexels.com/api 에서 무료 발급");
  const [w] = cfg.resolution.split("x").map(Number);
  const res = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=landscape&per_page=3`,
    { headers: { Authorization: key } },
  );
  if (!res.ok) throw new Error(`Pexels 검색 실패 (${res.status})`);
  const data = (await res.json()) as {
    videos?: { video_files: PexelsVideoFile[] }[];
  };
  const video = data.videos?.[0];
  if (!video) return false;
  // Smallest file that still covers the target width.
  const files = [...video.video_files].sort((a, b) => a.width - b.width);
  const file = files.find((f) => f.width >= w) ?? files[files.length - 1];
  if (!file) return false;
  const dl = await fetch(file.link);
  if (!dl.ok || !dl.body) return false;
  await streamPipeline(Readable.fromWeb(dl.body as never), createWriteStream(dest));
  return true;
}

// ─── Google Cloud TTS ───────────────────────────────────────────────────────

const SAMPLE_RATE = 24000;
const WAV_HEADER = 44;

// Returns WAV (LINEAR16 24kHz mono) buffer.
async function synthesize(
  textInput: string,
  voice: string,
  speakingRate = 1.0,
): Promise<Buffer> {
  const key = process.env.GOOGLE_TTS_API_KEY;
  if (!key) throw new Error("GOOGLE_TTS_API_KEY 미설정 — Cloud Text-to-Speech API 키 필요");
  const languageCode = voice.split("-").slice(0, 2).join("-");
  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: textInput },
        voice: { languageCode, name: voice },
        audioConfig: {
          audioEncoding: "LINEAR16",
          sampleRateHertz: SAMPLE_RATE,
          speakingRate,
        },
      }),
    },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`TTS 실패 (${res.status}): ${t.slice(0, 200)}`);
  }
  const { audioContent } = (await res.json()) as { audioContent: string };
  return Buffer.from(audioContent, "base64");
}

function wavSeconds(wav: Buffer): number {
  return Math.max(0, (wav.length - WAV_HEADER) / (SAMPLE_RATE * 2));
}

// Concatenate LINEAR16 WAVs (same format) into one — strip headers, patch sizes.
function concatWavs(wavs: Buffer[]): Buffer {
  const bodies = wavs.map((w) => w.subarray(WAV_HEADER));
  const dataLen = bodies.reduce((s, b) => s + b.length, 0);
  const header = Buffer.from(wavs[0].subarray(0, WAV_HEADER));
  header.writeUInt32LE(36 + dataLen, 4); // RIFF chunk size
  header.writeUInt32LE(dataLen, 40); // data chunk size
  return Buffer.concat([header, ...bodies]);
}

function silenceWav(seconds: number): Buffer {
  const dataLen = Math.round(SAMPLE_RATE * seconds) * 2;
  const buf = Buffer.alloc(WAV_HEADER + dataLen);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);
  return buf;
}

const HAN_RUN = /[㐀-鿿][㐀-鿿\s，。！？、]*[㐀-鿿。！？]|[㐀-鿿]/g;

/**
 * Synthesize one sentence, speaking Han runs with the paired Chinese voice
 * and everything else with the selected narration voice. No SSML needed —
 * runs are synthesized separately and the WAVs concatenated.
 */
async function synthesizeMixed(
  sentence: string,
  voice: string,
  zhVoice: string | undefined,
  opts: { speakingRate?: number; repeatZh?: boolean } = {},
): Promise<Buffer> {
  const rate = opts.speakingRate ?? 1.0;
  if (!zhVoice || !/[㐀-鿿]/.test(sentence)) {
    return synthesize(sentence, voice, rate);
  }
  const parts: { text: string; v: string; zh?: boolean }[] = [];
  let last = 0;
  for (const m of sentence.matchAll(HAN_RUN)) {
    const idx = m.index ?? 0;
    const before = sentence.slice(last, idx).trim();
    if (before) parts.push({ text: before, v: voice });
    parts.push({ text: m[0].trim(), v: zhVoice, zh: true });
    last = idx + m[0].length;
  }
  const tail = sentence.slice(last).trim();
  if (tail) parts.push({ text: tail, v: voice });
  if (parts.length === 0) return synthesize(sentence, voice, rate);

  const wavs: Buffer[] = [];
  for (let i = 0; i < parts.length; i++) {
    // Strip dangling punctuation-only fragments (e.g. lone quotes).
    if (!/[\p{L}\p{N}㐀-鿿]/u.test(parts[i].text)) continue;
    const wav = await synthesize(parts[i].text, parts[i].v, rate);
    wavs.push(wav);
    // Learner mode: read the Chinese run one more time, slightly slower.
    if (opts.repeatZh && parts[i].zh) {
      wavs.push(silenceWav(0.3));
      wavs.push(await synthesize(parts[i].text, parts[i].v, Math.min(rate, 0.9)));
    }
    if (i < parts.length - 1) wavs.push(silenceWav(0.12));
  }
  if (wavs.length === 0) return synthesize(sentence, voice, rate);
  return concatWavs(wavs);
}

// ─── SRT ─────────────────────────────────────────────────────────────────────

function srtTime(t: number): string {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.round((t - Math.floor(t)) * 1000);
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function buildSrtFromSegments(
  segments: { text: string; start: number; end: number }[],
  offset: number,
): string {
  return segments
    .map(
      (s, i) =>
        `${i + 1}\n${srtTime(s.start + offset)} --> ${srtTime(s.end + offset)}\n${wrapSubtitle(s.text)}\n`,
    )
    .join("\n");
}

// ─── main pipeline ───────────────────────────────────────────────────────────

export async function runVideoJob(jobId: string): Promise<void> {
  const rows = await db
    .select()
    .from(tables.video_jobs)
    .where(eq(tables.video_jobs.id, jobId))
    .limit(1);
  const job = rows[0];
  if (!job) return;
  const cfg = job.config as unknown as VideoJobConfig;

  const work = join(tmpdir(), `dingdong-video-${jobId.slice(0, 8)}`);
  await mkdir(work, { recursive: true });
  // Set once the mp4 + thumbnail are complete on the volume — from that point
  // a failure is an upload problem and the files are worth keeping.
  let rendered = false;

  try {
    await setJob(jobId, { status: "running", error: null });

    // 0) Fail fast on a full volume — before spending Gemini/TTS/Pexels calls.
    await assertRenderSpace(cfg);

    // 1) Script
    await step(jobId, "대본 생성 중 (Gemini)", 5);
    const script = job.script
      ? (job.script as unknown as VideoScript)
      : await generateScript(cfg);

    // 1b) Korean narration. The generator is asked for narration_ko inline, but
    //     on a long script it drops or truncates the field often enough that
    //     everything derived from it — the lesson body, the drama's Korean
    //     lines, the scene summaries — shipped untranslated. Repair it here,
    //     once, before anything reads it.
    await step(jobId, "한국어 번역 확인 중", 10);
    const ko = await ensureSceneKorean(cfg, script.scenes);
    if (ko.repaired) {
      console.log(`[video] narration_ko 보정: ${ko.repaired}/${script.scenes.length} 장면`);
    }
    script.scenes = ko.scenes;

    await setJob(jobId, { script: script as unknown as Json });
    const scenes = script.scenes;

    // 2) TTS — sentence by sentence. Han runs inside Korean narration are
    //    spoken by the paired Chinese voice; per-sentence durations give
    //    exact timings for subtitles and the transcript.
    await step(jobId, "나레이션 합성 중 (TTS)", 15);
    const { ZH_PAIR_VOICE } = await import("./config");
    const zhVoice =
      cfg.language === "ko"
        ? (ZH_PAIR_VOICE[cfg.voice] ?? "cmn-CN-Standard-A")
        : undefined;
    const GAP = 0.4; // physical silence between sentences
    const durations: number[] = [];
    let clock = 0;
    for (let i = 0; i < scenes.length; i++) {
      const sentences = splitSentences(scenes[i].narration || scenes[i].zh || "…");
      const pieces: Buffer[] = [];
      const segs: { text: string; start: number; end: number }[] = [];
      for (const sentence of sentences) {
        const wav = await synthesizeMixed(sentence, cfg.voice, zhVoice, {
          speakingRate: cfg.speakingRate,
          repeatZh: cfg.repeatZh,
        });
        const sec = wavSeconds(wav);
        segs.push({ text: sentence, start: clock, end: clock + sec });
        clock += sec + GAP;
        pieces.push(wav, silenceWav(GAP));
      }
      const sceneWav = concatWavs(pieces);
      await writeFile(join(work, `audio-${i}.wav`), sceneWav);
      durations.push(wavSeconds(sceneWav));
      scenes[i].segments = segs;
    }
    await setJob(jobId, { script: { ...script, scenes } as unknown as Json });

    // 3) SRT — one entry per sentence.
    const allSegs = scenes.flatMap((s) => s.segments ?? []);
    const srt = buildSrtFromSegments(allSegs, 0);
    await setJob(jobId, { srt });
    await writeFile(join(work, "subs.srt"), srt, "utf8");

    // 4) Pexels clips
    const ff = await ffmpegPath();
    const [W, H] = cfg.resolution.split("x").map(Number);
    const clipPaths: (string | null)[] = [];
    for (let i = 0; i < scenes.length; i++) {
      await step(
        jobId,
        `스톡 영상 수집 중 (${i + 1}/${scenes.length})`,
        20 + Math.round((i / scenes.length) * 20),
      );
      const raw = join(work, `raw-${i}.mp4`);
      let ok = false;
      try {
        ok = await pexelsClip(scenes[i].pexels_query, cfg, raw);
      } catch (e) {
        if (i === 0) throw e; // config errors (missing key) should fail fast
        ok = false;
      }
      clipPaths.push(ok ? raw : null);
    }

    // 5) Normalize each scene to exact duration/size (loop if clip too short;
    //    dark gradient card when Pexels had nothing).
    for (let i = 0; i < scenes.length; i++) {
      await step(
        jobId,
        `장면 렌더링 중 (${i + 1}/${scenes.length})`,
        40 + Math.round((i / scenes.length) * 30),
      );
      const out = join(work, `scene-${i}.mp4`);
      const d = durations[i].toFixed(2);
      if (clipPaths[i]) {
        await run(ff, [
          "-y", "-stream_loop", "-1", "-i", clipPaths[i]!,
          "-t", d, "-an",
          "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,format=yuv420p`,
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", out,
        ]);
      } else {
        await run(ff, [
          "-y", "-f", "lavfi", "-i", `color=c=0x1a1033:s=${W}x${H}:d=${d}:r=30`,
          "-vf", "format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", out,
        ]);
      }
    }

    // 6) Intro title card (1.5s)
    await step(jobId, "인트로/오디오 조립 중", 72);
    const font = await ensureFont();
    const intro = join(work, "intro.mp4");
    const introTitle = escapeDrawtext(script.title.slice(0, 30));
    await run(ff, [
      "-y", "-f", "lavfi", "-i", `color=c=0x1a1033:s=${W}x${H}:d=1.5:r=30`,
      "-vf",
      `drawtext=fontfile='${filterPath(font)}':text='${introTitle}':fontcolor=white:fontsize=${Math.round(H / 14)}:x=(w-text_w)/2:y=(h-text_h)/2,format=yuv420p`,
      "-c:v", "libx264", "-preset", "veryfast", intro,
    ]);

    // 7) Concat video parts + audio parts
    const listFile = join(work, "list.txt");
    const items = [intro, ...scenes.map((_s, i) => join(work, `scene-${i}.mp4`))];
    await writeFile(
      listFile,
      items.map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"),
      "utf8",
    );
    const videoOnly = join(work, "video.mp4");
    await run(ff, ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", videoOnly]);

    const audioList = join(work, "alist.txt");
    await writeFile(
      audioList,
      scenes.map((_s, i) => `file '${join(work, `audio-${i}.wav`).replace(/\\/g, "/")}'`).join("\n"),
      "utf8",
    );
    const audioAll = join(work, "audio.wav");
    await run(ff, ["-y", "-f", "concat", "-safe", "0", "-i", audioList, "-c", "copy", audioAll]);

    // 8) Final mux — audio delayed by intro length; optional subtitle burn.
    await step(jobId, "최종 렌더링 중", 82);
    const finalName = `videos/${jobId}.mp4`;
    const finalPath = join(getMediaDir(), finalName);
    await mkdir(join(getMediaDir(), "videos"), { recursive: true });
    // Shift SRT by intro duration for the burned/muxed output.
    const shifted = buildSrtFromSegments(allSegs, 1.5);
    const shiftedSrt = join(work, "subs-shifted.srt");
    await writeFile(shiftedSrt, shifted, "utf8");

    const muxArgs = [
      "-y", "-i", videoOnly, "-itsoffset", "1.5", "-i", audioAll,
      "-map", "0:v:0", "-map", "1:a:0",
    ];
    if (cfg.burnSubtitles) {
      muxArgs.push(
        "-vf",
        `subtitles='${filterPath(shiftedSrt)}':fontsdir='${filterPath(join(getMediaDir(), "fonts"))}':force_style='FontName=Noto Sans CJK KR Bold,FontSize=14,Outline=1'`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
      );
    } else {
      muxArgs.push("-c:v", "copy");
    }
    muxArgs.push("-c:a", "aac", "-b:a", "160k", "-shortest", finalPath);
    await run(ff, muxArgs);

    // 8.5) Background music — focus-matched track mixed quietly under the
    // narration. Video stream is stream-copied, so this pass is fast (~1s).
    // Any failure keeps the BGM-less output (non-fatal).
    const { bgmEnabled, ensureBgmFile } = await import("./bgm.server");
    if (bgmEnabled(cfg)) {
      const bgmPath = await ensureBgmFile(cfg.focus);
      if (bgmPath) {
        try {
          const mixed = join(work, "final-bgm.mp4");
          await run(ff, [
            "-y", "-i", finalPath, "-stream_loop", "-1", "-i", bgmPath,
            "-filter_complex",
            "[0:a]aformat=channel_layouts=stereo[nar];[1:a]aformat=channel_layouts=stereo,volume=0.15[bg];[nar][bg]amix=inputs=2:duration=first:normalize=0[aout]",
            "-map", "0:v", "-map", "[aout]",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", mixed,
          ]);
          const { copyFile } = await import("node:fs/promises");
          await copyFile(mixed, finalPath);
        } catch (e) {
          console.warn("[video] BGM 믹싱 실패 — BGM 없이 유지:", e);
        }
      }
    }

    // 9) Thumbnail — frame from the pre-subtitle video (no burned captions),
    //    title wrapped to two lines on a translucent box.
    await step(jobId, "썸네일 생성 중", 92);
    const thumbName = `videos/${jobId}-thumb.jpg`;
    const thumbPath = join(getMediaDir(), thumbName);
    const [line1, line2] = wrapTitle(script.title, 15);
    const fs1 = Math.round(H / 9);
    const boxArgs = `box=1:boxcolor=black@0.45:boxborderw=${Math.round(H / 40)}`;
    const draw1 = `drawtext=fontfile='${filterPath(font)}':text='${escapeDrawtext(line1)}':fontcolor=white:fontsize=${fs1}:${boxArgs}:x=(w-text_w)/2:y=${line2 ? `h-2.6*${fs1}` : `h-1.8*${fs1}`}`;
    const draw2 = line2
      ? `,drawtext=fontfile='${filterPath(font)}':text='${escapeDrawtext(line2)}':fontcolor=white:fontsize=${fs1}:${boxArgs}:x=(w-text_w)/2:y=h-1.3*${fs1}`
      : "";
    await run(ff, [
      "-y", "-ss", "3.2", "-i", videoOnly, "-frames:v", "1",
      "-vf", draw1 + draw2,
      "-q:v", "3", thumbPath,
    ]);

    await setJob(jobId, {
      video_path: finalName,
      thumbnail_path: thumbName,
      progress: 100,
    });
    rendered = true;

    if (cfg.uploadMode === "auto") {
      await uploadAndFinalize(jobId);
    } else if (cfg.uploadMode === "web") {
      await finalizeWebOnly(jobId);
    } else {
      await setJob(jobId, { status: "awaiting_approval", step: "업로드 승인 대기", progress: 100 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[video ${jobId.slice(0, 8)}] failed:`, msg);
    // A render that died mid-write leaves a half-finished mp4 on the volume,
    // and the boot-time orphan sweep won't touch it while the job row exists.
    // On a schedule that retries daily those partials pile up on exactly the
    // disk that was already too full.
    //
    // Only render-stage failures though — once the mp4 is finished, a failed
    // upload keeps it on purpose so 재시도 can resume from the upload step.
    if (!rendered) {
      await discardJobOutput(jobId);
      await setJob(jobId, { status: "failed", error: msg, video_path: null });
    } else {
      await setJob(jobId, { status: "failed", error: msg });
    }
    const { notifyAdmins } = await import("@/lib/notify.server");
    await notifyAdmins("🎬 영상 생성 실패", `${cfg.topic || cfg.keyword}: ${msg}`);
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/** Remove a job's rendered mp4/thumbnail from the volume. Safe to call when
 * they were never written. */
async function discardJobOutput(jobId: string): Promise<void> {
  const dir = getMediaDir();
  for (const name of [`videos/${jobId}.mp4`, `videos/${jobId}-thumb.jpg`]) {
    await rm(join(dir, name), { force: true }).catch(() => {});
  }
}

// Upload to YouTube then create the drama learning content.
export async function uploadAndFinalize(jobId: string): Promise<void> {
  const rows = await db
    .select()
    .from(tables.video_jobs)
    .where(eq(tables.video_jobs.id, jobId))
    .limit(1);
  const job = rows[0];
  if (!job?.video_path) throw new Error("업로드할 영상이 없습니다.");
  const cfg = job.config as unknown as VideoJobConfig;
  const script = job.script as unknown as VideoScript;

  try {
    await setJob(jobId, { status: "uploading", step: "YouTube 업로드 중", progress: 100 });
    const { uploadToYouTube, YouTubeAuthError, YouTubeUploadLimitError } =
      await import("./youtube.server");
    let videoId: string;
    try {
      videoId = await uploadToYouTube({
        filePath: join(getMediaDir(), job.video_path),
        thumbnailPath: job.thumbnail_path
          ? join(getMediaDir(), job.thumbnail_path)
          : undefined,
        title: script.title,
        description: script.description + (await import("./bgm.server")).bgmAttribution(cfg),
        tags: script.tags ?? [],
        privacy: cfg.privacy,
      });
    } catch (e) {
      // Web-first fallback: when YouTube — not our render — is the problem,
      // don't discard the already-rendered video. Publish it web-only so the
      // site still gets the content. (Aligns with the web-is-main direction.)
      // Auth expiry needs a reconnect; a daily upload limit just needs time,
      // and neither is worth losing an mp4 over.
      const limited = e instanceof YouTubeUploadLimitError;
      if (limited || e instanceof YouTubeAuthError) {
        const reason = limited ? "일일 업로드 한도 초과" : "auth 만료";
        console.warn(`[video ${jobId.slice(0, 8)}] YouTube ${reason} → 웹 전용 게시`);
        const { notifyAdmins } = await import("@/lib/notify.server");
        await notifyAdmins(
          limited
            ? "🎬 YouTube 일일 업로드 한도 — 웹 전용으로 게시했어요"
            : "🎬 YouTube 연결 만료 — 웹 전용으로 게시했어요",
          limited
            ? "YouTube가 오늘 분량을 더 받지 않아서, 렌더된 영상을 딩동 웹에 바로 게시했어요. 한도가 회복되면 스튜디오에서 유튜브로 다시 올릴 수 있어요."
            : "렌더된 영상을 딩동 웹에 바로 게시했어요. YouTube 업로드를 원하면 스튜디오에서 다시 연결해주세요.",
        );
        await finalizeWebOnly(jobId);
        return;
      }
      throw e;
    }
    await setJob(jobId, { youtube_video_id: videoId, step: "학습 콘텐츠 생성 중" });

    // CC track — the same SRT, but selectable and auto-translatable on YouTube
    // rather than baked into the pixels. Best-effort: a connection made before
    // the force-ssl scope existed will 403 here, and that must not fail a
    // video that already uploaded successfully.
    if (job.srt) {
      try {
        const { uploadCaptionTrack } = await import("./youtube.server");
        await uploadCaptionTrack({
          videoId,
          srt: job.srt,
          language: cfg.language === "zh" ? "zh-CN" : "ko",
          name: cfg.language === "zh" ? "中文" : "한국어",
        });
      } catch (e) {
        console.warn("[video] 유튜브 자막 업로드 실패 (비치명):", e);
      }
    }

    // Learning content: build drama scenes directly from our own script timings.
    // Use OUR thumbnail — YouTube serves a gray placeholder for private videos.
    const dramaId = await createDramaFromScript(
      job.created_by,
      cfg,
      script,
      { youtubeVideoId: videoId },
      job.srt ?? "",
      job.thumbnail_path ? `/media/${job.thumbnail_path}` : null,
    );

    // Funnel: append the DingDong learning link to the description and file
    // the video into the channel playlist. Both best-effort.
    try {
      const { updateVideoDescription, addToDingdongPlaylist, appBaseUrl } =
        await import("./youtube.server");
      const learnUrl = `${appBaseUrl()}/dramas/${dramaId}`;
      const { bgmAttribution } = await import("./bgm.server");
      await updateVideoDescription(
        videoId,
        script.title,
        `${script.description}\n\n📚 딩동에서 이 영상으로 학습하기 (전체 대사·단어장·퀴즈):\n${learnUrl}${bgmAttribution(cfg)}`,
      );
      await addToDingdongPlaylist(videoId);
    } catch (e) {
      console.warn("[video] 유튜브 설명/재생목록 갱신 실패 (비치명):", e);
    }

    // Optional course linkage: the video becomes a lesson in the course.
    let lessonId: string | null = null;
    if (cfg.courseId || cfg.newCourseTitle?.trim()) {
      try {
        lessonId = await createLessonFromScript(
          job.created_by,
          cfg,
          script,
          { youtubeVideoId: videoId },
          dramaId,
        );
      } catch (e) {
        console.warn("[video] 강의 연동 실패 (비치명):", e);
      }
    }

    // The mp4 lives on YouTube now — free the volume (keep the thumbnail).
    const { rm } = await import("node:fs/promises");
    await rm(join(getMediaDir(), job.video_path), { force: true }).catch(() => {});

    await setJob(jobId, {
      drama_id: dramaId,
      lesson_id: lessonId,
      status: "done",
      step: "완료",
      video_path: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await setJob(jobId, { status: "failed", error: `업로드/콘텐츠 생성 실패: ${msg}` });
    const { notifyAdmins } = await import("@/lib/notify.server");
    await notifyAdmins("🎬 영상 업로드 실패", msg);
    throw e;
  }
}

// Web-only mode: no YouTube — the rendered mp4 stays on the volume and the
// drama/lesson play it through /media/*. Files move under dramas/<dramaId>
// so deleting the studio job entry can never break published content.
export async function finalizeWebOnly(jobId: string): Promise<void> {
  const rows = await db
    .select()
    .from(tables.video_jobs)
    .where(eq(tables.video_jobs.id, jobId))
    .limit(1);
  const job = rows[0];
  if (!job?.video_path) throw new Error("완성된 영상이 없습니다.");
  const cfg = job.config as unknown as VideoJobConfig;
  const script = job.script as unknown as VideoScript;

  try {
    await setJob(jobId, { step: "학습 콘텐츠 생성 중", progress: 100 });

    const dramaId = await createDramaFromScript(
      job.created_by,
      cfg,
      script,
      { mediaUrl: `/media/${job.video_path}` },
      job.srt ?? "",
      job.thumbnail_path ? `/media/${job.thumbnail_path}` : null,
    );

    // Move the files under dramas/<dramaId> (drama owns them from here on).
    const { mkdir, rename } = await import("node:fs/promises");
    await mkdir(join(getMediaDir(), "dramas"), { recursive: true });
    const newVideo = `dramas/${dramaId}.mp4`;
    await rename(join(getMediaDir(), job.video_path), join(getMediaDir(), newVideo));
    let newThumb: string | null = null;
    if (job.thumbnail_path) {
      newThumb = `dramas/${dramaId}-thumb.jpg`;
      await rename(
        join(getMediaDir(), job.thumbnail_path),
        join(getMediaDir(), newThumb),
      ).catch(() => {
        newThumb = null;
      });
    }
    await db
      .update(tables.dramas)
      .set({
        media_url: `/media/${newVideo}`,
        ...(newThumb ? { thumbnail_url: `/media/${newThumb}` } : {}),
      })
      .where(eq(tables.dramas.id, dramaId));

    let lessonId: string | null = null;
    if (cfg.courseId || cfg.newCourseTitle?.trim()) {
      try {
        lessonId = await createLessonFromScript(
          job.created_by,
          cfg,
          script,
          { mediaUrl: `/media/${newVideo}` },
          dramaId,
        );
      } catch (e) {
        console.warn("[video] 강의 연동 실패 (비치명):", e);
      }
    }

    await setJob(jobId, {
      drama_id: dramaId,
      lesson_id: lessonId,
      status: "done",
      step: "완료 (웹 전용)",
      video_path: newVideo,
      thumbnail_path: newThumb,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await setJob(jobId, { status: "failed", error: `웹 콘텐츠 생성 실패: ${msg}` });
    const { notifyAdmins } = await import("@/lib/notify.server");
    await notifyAdmins("🎬 웹 콘텐츠 생성 실패", msg);
    throw e;
  }
}

// Parse SRT back into (start,end) pairs — fallback for jobs generated before
// sentence segments existed.
function parseSrtTimes(srt: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const re = /(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(srt))) {
    const [h1, m1, s1, ms1, h2, m2, s2, ms2] = m.slice(1).map(Number);
    out.push({
      start: h1 * 3600 + m1 * 60 + s1 + ms1 / 1000,
      end: h2 * 3600 + m2 * 60 + s2 + ms2 / 1000,
    });
  }
  return out;
}

// Every Han run in a string, not just the first. Korean narration routinely
// names two expressions in one sentence ("你好 대신 早上好"), and matching
// without /g returned only 你好 — so the sentence the scene was built to teach
// disappeared behind a passing mention of it.
const HAN_RUNS = /[㐀-鿿][㐀-鿿，、]*[㐀-鿿]|[㐀-鿿]/g;

/** Re-join sentence fragments that an older split produced inside a quotation.
 *
 * splitSentences now keeps `"你吃饭了吗？"라고 인사해요.` whole, but videos
 * rendered before that carry the broken pair in their stored segments, and the
 * timings are tied to audio that cannot be re-cut. Merging them for display
 * costs nothing and removes lines that begin with a bare quote.
 *
 * Korean narration only: on Chinese narration each segment is paired with its
 * own Korean sentence by index, and merging would shift that alignment. */
function mergeQuoteFragments(cfg: VideoJobConfig, segs: SceneSegment[]): SceneSegment[] {
  if (cfg.language !== "ko") return segs;
  const out: SceneSegment[] = [];
  for (const seg of segs) {
    const prev = out[out.length - 1];
    if (prev && /^["'”’」』）)]/.test(seg.text.trim())) {
      out[out.length - 1] = {
        text: `${prev.text}${seg.text.trim()}`,
        start: prev.start,
        end: seg.end,
      };
      continue;
    }
    out.push(seg);
  }
  return out;
}

/** The Chinese a Korean-narration line should display.
 *
 * Prefers the scene's featured expression when the sentence mentions it, then
 * the longest run — a longer run is the expression being taught, where a bare
 * 你好 is usually the thing being contrasted against. */
function pickHan(text: string, featured: string | undefined): string {
  const runs: string[] = text.match(HAN_RUNS) ?? [];
  if (!runs.length) return "";
  const f = (featured ?? "").trim();
  if (f && (runs.includes(f) || text.includes(f))) return f;
  return [...runs].sort((a, b) => b.length - a.length)[0];
}

/** Attach the finished video to a course as a "video" lesson. */
async function createLessonFromScript(
  userId: string,
  cfg: VideoJobConfig,
  script: VideoScript,
  videoRef: { youtubeVideoId?: string | null; mediaUrl?: string | null },
  dramaId: string,
): Promise<string> {
  const { asc, eq } = await import("drizzle-orm");

  let courseId = cfg.courseId ?? null;
  if (!courseId && cfg.newCourseTitle?.trim()) {
    const [course] = await db
      .insert(tables.courses)
      .values({
        title: cfg.newCourseTitle.trim().slice(0, 80),
        description: `"${cfg.keyword}" 키워드로 생성된 영상 강의 모음`,
        level: "beginner",
        weeks: 4,
        created_by: userId,
      })
      .returning({ id: tables.courses.id });
    courseId = course.id;
  }
  if (!courseId) throw new Error("연동할 강의가 없습니다.");

  const existing = await db
    .select({ order_index: tables.lessons.order_index })
    .from(tables.lessons)
    .where(eq(tables.lessons.course_id, courseId))
    .orderBy(asc(tables.lessons.order_index));
  const nextOrder = existing.reduce((m, r) => Math.max(m, r.order_index), 0) + 1;

  const contentMd = buildLessonMarkdown(script);

  const keyExpressions = script.scenes
    .filter((sc) => sc.zh)
    .map((sc) => ({ zh: sc.zh, pinyin: pinyinFor(sc.zh, sc.pinyin), ko: sc.ko }));

  // 실전대화·슬라이드·퀴즈. Non-fatal: a video lesson without practice material
  // is still a usable lesson, and this runs after the video is already
  // published. The script's own per-scene quizzes are the fallback — they cost
  // nothing and were being thrown away.
  let enrichment: LessonEnrichment = { dialogues: [], slides: [], quiz: [] };
  try {
    const { buildLessonEnrichment } = await import("./lesson-enrich.server");
    enrichment = await buildLessonEnrichment(cfg, script);
  } catch (e) {
    console.warn("[video] 강의 보강 콘텐츠 생성 실패 (비치명):", e);
  }
  // Also covers a call that succeeded but produced no usable quiz item.
  if (enrichment.quiz.length === 0) {
    const { quizFromScript } = await import("./lesson-enrich.server");
    enrichment.quiz = quizFromScript(script);
  }

  const [lesson] = await db
    .insert(tables.lessons)
    .values({
      course_id: courseId,
      created_by: userId,
      order_index: nextOrder,
      title: script.title.slice(0, 80),
      lesson_type: "video",
      level: levelFromAudience(cfg.audience),
      content_md: contentMd,
      key_expressions: keyExpressions as unknown as Json,
      dialogues: enrichment.dialogues as unknown as Json,
      slides: enrichment.slides as unknown as Json,
      quiz: enrichment.quiz as unknown as Json,
      video: {
        youtube_video_id: videoRef.youtubeVideoId ?? undefined,
        media_url: videoRef.mediaUrl ?? undefined,
        drama_id: dramaId,
      } as unknown as Json,
    })
    .returning({ id: tables.lessons.id });

  // Keep weeks >= lesson count so the course card's progress ring never
  // shows a "full" course that keeps growing.
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`
    UPDATE courses
    SET weeks = GREATEST(weeks, (SELECT count(*) FROM lessons WHERE course_id = ${courseId}))
    WHERE id = ${courseId}`);

  return lesson.id;
}

/** Lesson body built from a script. Exported so the backfill that repairs
 * already-published videos produces identical markdown. */
export function buildLessonMarkdown(script: VideoScript): string {
  return script.scenes
    .map((sc, i) => {
      // A blank pinyin used to render as an empty "()" under the key sentence.
      const py = pinyinFor(sc.zh, sc.pinyin);
      const zhBlock = sc.zh ? `\n\n**${sc.zh}**${py ? ` (${py})` : ""}\n${sc.ko}` : "";
      // Chinese narration is unreadable to a learner without its translation,
      // and `sc.ko` only covers the short teaching line.
      const koBlock =
        sc.narration_ko && sc.narration_ko !== sc.narration
          ? `\n\n> ${sc.narration_ko}`
          : "";
      return `## ${i + 1}. ${sc.ko || `장면 ${i + 1}`}\n\n${sc.narration}${koBlock}${zhBlock}`;
    })
    .join("\n\n");
}

// Playback source for created content: a YouTube upload or a self-hosted
// file on the volume ("web-only" mode).
type VideoRef = { youtubeVideoId?: string | null; mediaUrl?: string | null };

/** Derive drama learning scenes from a finished script.
 *
 * Exported so the backfill that repairs already-published videos runs the
 * exact same derivation as the pipeline — two copies would drift. */
export function buildDramaScenes(
  cfg: VideoJobConfig,
  script: VideoScript,
  srt: string,
): { scenes: unknown[]; durationSeconds: number } {
  const times = parseSrtTimes(srt);
  const intro = 1.5;
  const scenes = script.scenes.map((sc, i) => {
    const segs = mergeQuoteFragments(cfg, sc.segments ?? []);
    const sceneStart = segs[0]?.start ?? times[i]?.start ?? 0;
    const sceneEnd = segs.at(-1)?.end ?? times[i]?.end ?? sceneStart;

    // One key line per narration sentence (exact timestamps). Chinese-narration
    // videos put the sentence in zh; Korean narration extracts the Han run.
    // `sc.ko` translates only the short `zh` teaching line. Pairing it with
    // every narration sentence made a 60-character Chinese scene show a
    // one-clause Korean gloss, so translate from narration_ko and align it
    // sentence by sentence.
    //
    // ensureSceneKorean writes ko_sentences aligned to these segments. Older
    // scripts have only the paragraph: re-splitting it is safe when the counts
    // agree, but indexing into a translation that merged two sentences shifted
    // every later line onto the wrong Korean, so use it whole in that case.
    const paragraphKo = splitSentences(sc.narration_ko ?? "");
    const koSentences =
      sc.ko_sentences?.length === segs.length
        ? sc.ko_sentences
        : paragraphKo.length === segs.length
          ? paragraphKo
          : null;
    const key_lines = segs.length
      ? segs.map((seg, si) => {
          const isZhNarration = cfg.language === "zh";
          const lineZh = isZhNarration ? seg.text : pickHan(seg.text, sc.zh);
          const koForSeg = koSentences?.[si] ?? sc.narration_ko ?? sc.ko ?? "";
          return {
            zh: lineZh,
            // The script only carries pinyin for the short teaching line, so
            // every other Chinese line used to render with none at all. Derive
            // it, and keep the script's reading for the line it actually
            // describes.
            pinyin: pinyinFor(lineZh, lineZh === sc.zh ? sc.pinyin : ""),
            ko: isZhNarration ? koForSeg : seg.text,
            time_seconds: Math.floor(seg.start + intro),
          };
        })
      : sc.zh
        ? [
            {
              zh: sc.zh,
              pinyin: pinyinFor(sc.zh, sc.pinyin),
              ko: sc.ko,
              time_seconds: Math.floor(sceneStart + intro),
            },
          ]
        : [];

    // A scene is built to teach one expression, but on Korean narration that
    // expression only reached the screen when a narration sentence happened to
    // spell it out — the closing scene of a greetings video taught 再见 and
    // showed 你好. Lead with it when the narration never does; it costs nothing,
    // the script already carries the reading and the translation.
    if (
      cfg.language === "ko" &&
      sc.zh &&
      key_lines.length &&
      !key_lines.some((l) => l.zh === sc.zh)
    ) {
      key_lines.unshift({
        zh: sc.zh,
        pinyin: pinyinFor(sc.zh, sc.pinyin),
        ko: sc.ko,
        time_seconds: Math.floor(sceneStart + intro),
      });
    }

    return {
      index: i + 1,
      title: sc.ko ? sc.ko.slice(0, 12) : `장면 ${i + 1}`,
      start_seconds: Math.floor(sceneStart + intro),
      end_seconds: Math.ceil(sceneEnd + intro),
      // Must be Korean — on Chinese-narration videos `narration` is Chinese.
      summary_ko: (sc.narration_ko || sc.narration).slice(0, 120),
      key_lines,
      // The model leaves vocab pinyin blank often enough that the word card
      // rendered a bare hanzi; it is derivable, so derive it.
      vocab: (sc.vocab ?? [])
        .filter((v) => v?.zh)
        .map((v) => ({ ...v, pinyin: pinyinFor(v.zh, v.pinyin) })),
      quiz: (sc.quiz ?? []).filter((q) => q?.question && q?.answer),
    };
  });

  return {
    scenes,
    durationSeconds: Math.ceil((times.at(-1)?.end ?? cfg.lengthSeconds) + intro),
  };
}

async function createDramaFromScript(
  userId: string,
  cfg: VideoJobConfig,
  script: VideoScript,
  videoRef: VideoRef,
  srt: string,
  thumbnailUrl: string | null,
): Promise<string> {
  const { scenes, durationSeconds } = buildDramaScenes(cfg, script, srt);

  const [row] = await db
    .insert(tables.dramas)
    .values({
      title: script.title.slice(0, 80),
      title_zh: null,
      description: script.description?.slice(0, 300) ?? null,
      // The studio already knows what the video is about and who it is for;
      // hard-coding one genre and level made every drama identical and left
      // the library unfilterable.
      level: levelFromAudience(cfg.audience),
      genre: FOCUS_LABEL[cfg.focus] ?? "AI 생성 영상",
      youtube_url: videoRef.youtubeVideoId
        ? `https://www.youtube.com/watch?v=${videoRef.youtubeVideoId}`
        : null,
      youtube_video_id: videoRef.youtubeVideoId ?? null,
      media_url: videoRef.mediaUrl ?? null,
      thumbnail_url:
        thumbnailUrl ??
        (videoRef.youtubeVideoId
          ? `https://img.youtube.com/vi/${videoRef.youtubeVideoId}/hqdefault.jpg`
          : null),
      duration_seconds: durationSeconds,
      has_captions: true,
      scenes: scenes as unknown as Json,
      created_by: userId,
    })
    .returning({ id: tables.dramas.id });
  return row.id;
}
