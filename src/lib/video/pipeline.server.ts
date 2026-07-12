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
import type { Json } from "@/db/schema";
import { getMediaDir } from "@/lib/suno.server";
import type { ScriptScene, VideoJobConfig, VideoScript } from "./config";

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
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg 실패 (code ${code}): …${err.slice(-600)}`));
    });
  });
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

function escapeDrawtext(t: string): string {
  return t.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/%/g, "\\%");
}

// ─── script generation ───────────────────────────────────────────────────────

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
- narration: ${narrLang} 나레이션 1~2문장. 소리내어 읽으면 약 ${perScene}초 분량 (${cfg.language === "ko" ? `${Math.round(perScene * 5.5)}자 내외` : `${Math.round(perScene * 4)}자 내외`}). 마크다운/이모지 금지.
- zh: 이 장면에서 가르치는 핵심 중국어 문장/표현 (간체 한자만)
- pinyin: zh의 병음 (성조 기호)
- ko: zh의 한국어 번역
- pexels_query: 이 장면에 어울리는 스톡 영상 검색어 (영어 2~4단어, 구체적 사물/풍경/행동)

첫 장면은 주제 소개(훅), 마지막 장면은 요약+구독 유도.
반드시 아래 JSON만 출력 (코드펜스 금지):
{"title":"유튜브 제목(한국어, 40자 이내, 키워드 포함)","description":"유튜브 설명 2~3문장 + 해시태그 3개","tags":["태그1","태그2","태그3","태그4","태그5"],"scenes":[{"index":1,"narration":"...","zh":"...","pinyin":"...","ko":"...","pexels_query":"..."}]}`;

  const { text } = await generateText({
    model: gateway("google/gemini-2.5-flash"),
    prompt,
    temperature: 0.6,
    maxOutputTokens: 16000,
  });
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error(`대본 JSON 파싱 실패: ${cleaned.slice(0, 200)}`);
  const parsed = JSON.parse(cleaned.slice(s, e + 1)) as VideoScript;
  if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error("대본 장면이 비어 있습니다.");
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

// Returns WAV (LINEAR16) buffer + duration in seconds.
async function synthesize(
  textInput: string,
  voice: string,
): Promise<{ wav: Buffer; seconds: number }> {
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
        audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: 24000 },
      }),
    },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`TTS 실패 (${res.status}): ${t.slice(0, 200)}`);
  }
  const { audioContent } = (await res.json()) as { audioContent: string };
  const wav = Buffer.from(audioContent, "base64");
  // LINEAR16 mono 24kHz → 2 bytes/sample; WAV header 44 bytes.
  const seconds = (wav.length - 44) / (24000 * 2);
  return { wav, seconds: Math.max(0.5, seconds) };
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

function buildSrt(
  scenes: ScriptScene[],
  starts: number[],
  durations: number[],
  language: string,
): string {
  return scenes
    .map((sc, i) => {
      const line =
        language === "zh"
          ? `${sc.narration}`
          : `${sc.narration}${sc.zh ? `\n${sc.zh} (${sc.pinyin})` : ""}`;
      return `${i + 1}\n${srtTime(starts[i])} --> ${srtTime(starts[i] + durations[i])}\n${line}\n`;
    })
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

  try {
    await setJob(jobId, { status: "running", error: null });

    // 1) Script
    await step(jobId, "대본 생성 중 (Gemini)", 5);
    const script = job.script
      ? (job.script as unknown as VideoScript)
      : await generateScript(cfg);
    await setJob(jobId, { script: script as unknown as Json });
    const scenes = script.scenes;

    // 2) TTS per scene → durations
    await step(jobId, "나레이션 합성 중 (TTS)", 15);
    const durations: number[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const { wav, seconds } = await synthesize(scenes[i].narration, cfg.voice);
      await writeFile(join(work, `audio-${i}.wav`), wav);
      durations.push(seconds + 0.4); // small breathing gap
    }
    const starts = durations.reduce<number[]>((acc, _d, i) => {
      acc.push(i === 0 ? 0 : acc[i - 1] + durations[i - 1]);
      return acc;
    }, []);
    const total = starts[starts.length - 1] + durations[durations.length - 1];

    // 3) SRT
    const srt = buildSrt(scenes, starts, durations, cfg.language);
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
    const shifted = buildSrt(
      scenes,
      starts.map((st) => st + 1.5),
      durations,
      cfg.language,
    );
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

    // 9) Thumbnail: frame from first scene + title overlay
    await step(jobId, "썸네일 생성 중", 92);
    const thumbName = `videos/${jobId}-thumb.jpg`;
    const thumbPath = join(getMediaDir(), thumbName);
    const thumbText = escapeDrawtext(script.title.slice(0, 22));
    await run(ff, [
      "-y", "-ss", "2.0", "-i", finalPath, "-frames:v", "1",
      "-vf",
      `drawtext=fontfile='${filterPath(font)}':text='${thumbText}':fontcolor=white:borderw=4:bordercolor=black:fontsize=${Math.round(H / 10)}:x=(w-text_w)/2:y=h-text_h-${Math.round(H / 8)}`,
      "-q:v", "3", thumbPath,
    ]);

    await setJob(jobId, {
      video_path: finalName,
      thumbnail_path: thumbName,
      progress: 100,
    });

    if (cfg.uploadMode === "auto") {
      await uploadAndFinalize(jobId);
    } else {
      await setJob(jobId, { status: "awaiting_approval", step: "업로드 승인 대기", progress: 100 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[video ${jobId.slice(0, 8)}] failed:`, msg);
    await setJob(jobId, { status: "failed", error: msg });
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
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
    const { uploadToYouTube } = await import("./youtube.server");
    const videoId = await uploadToYouTube({
      filePath: join(getMediaDir(), job.video_path),
      thumbnailPath: job.thumbnail_path
        ? join(getMediaDir(), job.thumbnail_path)
        : undefined,
      title: script.title,
      description: script.description,
      tags: script.tags ?? [],
      privacy: cfg.privacy,
    });
    await setJob(jobId, { youtube_video_id: videoId, step: "학습 콘텐츠 생성 중" });

    // Learning content: build drama scenes directly from our own script timings.
    // Use OUR thumbnail — YouTube serves a gray placeholder for private videos.
    const dramaId = await createDramaFromScript(
      job.created_by,
      cfg,
      script,
      videoId,
      job.srt ?? "",
      job.thumbnail_path ? `/media/${job.thumbnail_path}` : null,
    );

    // The mp4 lives on YouTube now — free the volume (keep the thumbnail).
    const { rm } = await import("node:fs/promises");
    await rm(join(getMediaDir(), job.video_path), { force: true }).catch(() => {});

    await setJob(jobId, {
      drama_id: dramaId,
      status: "done",
      step: "완료",
      video_path: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await setJob(jobId, { status: "failed", error: `업로드/콘텐츠 생성 실패: ${msg}` });
    throw e;
  }
}

// Parse SRT back into (start,end) pairs — single source of truth for timings.
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

async function createDramaFromScript(
  userId: string,
  cfg: VideoJobConfig,
  script: VideoScript,
  youtubeVideoId: string,
  srt: string,
  thumbnailUrl: string | null,
): Promise<string> {
  const times = parseSrtTimes(srt);
  const intro = 1.5;
  const scenes = script.scenes.map((sc, i) => ({
    index: i + 1,
    title: sc.ko ? sc.ko.slice(0, 12) : `장면 ${i + 1}`,
    start_seconds: Math.floor((times[i]?.start ?? 0) + intro),
    end_seconds: Math.ceil((times[i]?.end ?? 0) + intro),
    summary_ko: sc.narration.slice(0, 120),
    key_lines: sc.zh
      ? [
          {
            zh: sc.zh,
            pinyin: sc.pinyin,
            ko: sc.ko,
            time_seconds: Math.floor((times[i]?.start ?? 0) + intro),
          },
        ]
      : [],
    vocab: [],
    quiz: [],
  }));

  const [row] = await db
    .insert(tables.dramas)
    .values({
      title: script.title.slice(0, 80),
      title_zh: null,
      description: script.description?.slice(0, 300) ?? null,
      level: "beginner",
      genre: "AI 생성 영상",
      youtube_url: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
      youtube_video_id: youtubeVideoId,
      thumbnail_url:
        thumbnailUrl ?? `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`,
      duration_seconds: Math.ceil((times.at(-1)?.end ?? cfg.lengthSeconds) + intro),
      has_captions: true,
      scenes: scenes as unknown as Json,
      created_by: userId,
    })
    .returning({ id: tables.dramas.id });
  return row.id;
}
