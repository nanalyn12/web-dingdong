import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookmarkPlus, Check, Clock, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useMyProfile, useSession } from "@/lib/auth-client";
import {
  getMyDramaProgress,
  saveMyDramaProgress,
} from "@/lib/drama-progress.functions";
import {
  getDrama,
  updateDramaLineTime,
  type DramaScene,
} from "@/lib/dramas.functions";
import { useZhTts } from "@/lib/use-zh-tts";
import { useVideoViewPrefs, VIDEO_SIZES, VIDEO_SIZE_CLASS } from "@/lib/video-view-prefs";
import { saveVocabulary } from "@/lib/vocab.functions";
import { addGuestVocab, guessEmoji } from "@/lib/vocab";


export const Route = createFileRoute("/_app/dramas/$id")({
  component: DramaDetail,
  errorComponent: ({ error }) => (
    <div className="glass rounded-3xl p-6 text-sm text-destructive">
      {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="glass rounded-3xl p-6">드라마를 찾을 수 없어요.</div>,
});

function fmtTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

// Per-line timestamp: explicit time_seconds when present, otherwise spread
// evenly across the scene span (same approximation the scene panel uses).
function lineTimes(scene: DramaScene): { time: number; isExact: boolean }[] {
  const n = scene.key_lines?.length ?? 0;
  if (n === 0) return [];
  const start = scene.start_seconds;
  const end = scene.end_seconds;
  const span = Math.max(0, end - start);
  const slot = span / Math.max(1, n);
  const buffer = Math.min(1.5, slot * 0.15);
  const usable = Math.max(0, span - buffer * 2);
  const step = usable / Math.max(1, n);
  return scene.key_lines.map((l, i) => {
    if (typeof l.time_seconds === "number") {
      return { time: Math.round(l.time_seconds), isExact: true };
    }
    const raw = start + buffer + step * (i + 0.5);
    const clamped = Math.min(Math.max(raw, start), Math.max(start, end - 1));
    return { time: Math.round(clamped), isExact: false };
  });
}

// Minimal YouTube IFrame API loader (no-op when videoId is empty —
// self-hosted dramas never load the YouTube API).
function useYoutubePlayer(videoId: string) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<unknown>(null);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    const ensureApi = () =>
      new Promise<void>((resolve) => {
        const w = window as unknown as {
          YT?: { Player: new (...args: unknown[]) => unknown };
          onYouTubeIframeAPIReady?: () => void;
        };
        if (w.YT?.Player) return resolve();
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.body.appendChild(tag);
        w.onYouTubeIframeAPIReady = () => resolve();
      });

    void ensureApi().then(() => {
      if (cancelled || !containerRef.current) return;
      const w = window as unknown as {
        YT: { Player: new (el: HTMLElement, opts: unknown) => unknown };
      };
      playerRef.current = new w.YT.Player(containerRef.current, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1 },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  useEffect(() => {
    const t = setInterval(() => {
      const p = playerRef.current as { getCurrentTime?: () => number } | null;
      if (p?.getCurrentTime) {
        try {
          setCurrentTime(p.getCurrentTime() ?? 0);
        } catch {
          /* ignore */
        }
      }
    }, 500);
    return () => clearInterval(t);
  }, []);

  const seek = (seconds: number) => {
    const p = playerRef.current as
      | { seekTo?: (s: number, allow?: boolean) => void; playVideo?: () => void }
      | null;
    p?.seekTo?.(seconds, true);
    p?.playVideo?.();
  };

  return { containerRef, currentTime, seek };
}

// Self-hosted playback (web-only dramas): same {currentTime, seek} contract
// as the YouTube hook, driven by a plain <video> element.
function useHtml5Player() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const onTimeUpdate = () => setCurrentTime(videoRef.current?.currentTime ?? 0);
  const seek = (seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = seconds;
    void v.play().catch(() => {});
  };
  return { videoRef, currentTime, seek, onTimeUpdate };
}

function DramaDetail() {
  const { id } = Route.useParams();
  const { data: drama, isLoading } = useQuery({
    queryKey: ["drama", id],
    queryFn: () => getDrama({ data: { id } }),
  });

  // Self-hosted file wins when both sources exist.
  const isSelfHosted = !!drama?.media_url;
  const yt = useYoutubePlayer(isSelfHosted ? "" : (drama?.youtube_video_id ?? ""));
  const html5 = useHtml5Player();
  const containerRef = yt.containerRef;
  const currentTime = isSelfHosted ? html5.currentTime : yt.currentTime;
  const seek = isSelfHosted ? html5.seek : yt.seek;

  const scenes = useMemo<DramaScene[]>(
    () => (drama?.scenes ?? []).slice().sort((a, b) => a.start_seconds - b.start_seconds),
    [drama],
  );

  const activeIndex = useMemo(() => {
    if (scenes.length === 0) return 0;
    const idx = scenes.findIndex(
      (s) => currentTime >= s.start_seconds && currentTime < s.end_seconds,
    );
    return idx >= 0 ? idx : 0;
  }, [scenes, currentTime]);

  // manualIndex is a one-shot override that yields back to auto-highlight
  // as soon as playback actually reaches the seeked scene.
  const [manualIndex, setManualIndex] = useState<number | null>(null);
  useEffect(() => {
    if (manualIndex === null) return;
    if (activeIndex === manualIndex) setManualIndex(null);
  }, [activeIndex, manualIndex]);
  const shownIndex = manualIndex ?? activeIndex;
  const scene = scenes[shownIndex];

  // Auto-scroll the active chip into view
  const timelineRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = timelineRef.current?.querySelector<HTMLElement>(
      `[data-scene-idx="${shownIndex}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [shownIndex]);

  // ── 학습 진도 (로그인 사용자만): 이어보기 + 시청 위치/장면 완료 자동 저장 ──
  const { session } = useSession();
  const { data: progress } = useQuery({
    queryKey: ["drama-progress", id],
    queryFn: () => getMyDramaProgress({ data: { dramaId: id } }),
    enabled: !!session,
    staleTime: Infinity,
  });
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const { size: videoSize, setSize: setVideoSize, pinned, setPinned } =
    useVideoViewPrefs();
  const completedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (progress?.completed_scenes) {
      completedRef.current = new Set(progress.completed_scenes);
    }
  }, [progress]);

  // Autosave every 10s while playing; mark scenes completed when playback
  // passes their end time.
  const timeRef = useRef(currentTime);
  timeRef.current = currentTime;
  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;
  useEffect(() => {
    if (!session || !drama) return;
    const t = setInterval(() => {
      const now = timeRef.current;
      if (now <= 3) return;
      const done: number[] = [];
      scenesRef.current.forEach((s, i) => {
        if (now >= s.end_seconds - 1 && !completedRef.current.has(i)) {
          completedRef.current.add(i);
          done.push(i);
        }
      });
      saveMyDramaProgress({
        data: {
          dramaId: id,
          lastSeconds: Math.floor(now),
          ...(done.length ? { completedScenes: [...completedRef.current] } : {}),
        },
      }).catch(() => {});
    }, 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, drama?.id]);

  const saveQuizScore = (sceneIndex: number, score: number, total: number) => {
    if (!session) return;
    saveMyDramaProgress({
      data: { dramaId: id, quizScore: { sceneIndex, score, total } },
    }).catch(() => {});
  };

  if (isLoading) return <div className="glass rounded-3xl p-6">불러오는 중…</div>;
  if (!drama) return <div className="glass rounded-3xl p-6">드라마를 찾을 수 없어요.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Link to="/dramas" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> 목록으로
        </Link>
      </div>

      <div className="glass rounded-3xl p-4 sm:p-5 space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">{drama.title}</h1>
          <span
            className={[
              "text-[10px] font-semibold px-2 py-1 rounded-full whitespace-nowrap",
              drama.has_captions
                ? "bg-emerald-500/15 text-emerald-700"
                : "bg-amber-500/15 text-amber-800",
            ].join(" ")}
            title={
              drama.has_captions
                ? "YouTube 자막 기반 실제 타임코드"
                : "자막이 없어 타임코드가 근사치예요. 교수자가 수동으로 편집할 수 있어요."
            }
          >
            {drama.has_captions ? "🎯 자막 기반" : "≈ 근사 타임"}
          </span>
        </div>
        {drama.title_zh && (
          <div className="text-muted-foreground">{drama.title_zh}</div>
        )}
        {drama.description && (
          <p className="text-sm text-muted-foreground">{drama.description}</p>
        )}
      </div>


      {/* Player — size and pinning are reader preferences. The card used to be
          permanently sticky at full width, which meant a large video followed
          you down the page while reading the script below it. */}
      <div
        className={[
          "glass rounded-3xl p-3",
          pinned ? "sticky top-2 z-10" : "",
        ].join(" ")}
      >
        <div className="flex items-center justify-end gap-1.5 pb-2">
          <div className="glass-soft rounded-full flex text-[11px] font-semibold overflow-hidden">
            {VIDEO_SIZES.map((s) => (
              <button
                key={s.key}
                onClick={() => setVideoSize(s.key)}
                className={[
                  "px-2.5 py-1 transition-colors",
                  videoSize === s.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
                title={`영상 크기: ${s.label}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setPinned(!pinned)}
            className={[
              "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
              pinned
                ? "bg-primary/20 text-primary"
                : "glass-soft text-muted-foreground hover:text-foreground",
            ].join(" ")}
            title={
              pinned
                ? "스크롤해도 영상이 따라옵니다. 끄면 함께 스크롤돼요."
                : "영상을 화면 위에 고정합니다."
            }
          >
            📌 고정 {pinned ? "ON" : "OFF"}
          </button>
        </div>
        <div
          className={[
            "aspect-video rounded-2xl overflow-hidden bg-black mx-auto w-full",
            VIDEO_SIZE_CLASS[videoSize],
          ].join(" ")}
        >
          {isSelfHosted ? (
            <video
              ref={html5.videoRef}
              src={drama.media_url ?? undefined}
              poster={drama.thumbnail_url ?? undefined}
              controls
              playsInline
              preload="metadata"
              className="w-full h-full"
              onTimeUpdate={html5.onTimeUpdate}
            />
          ) : (
            <div ref={containerRef} className="w-full h-full" />
          )}
        </div>
        {!!progress?.last_seconds &&
          progress.last_seconds > 15 &&
          !resumeDismissed &&
          currentTime < 3 && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl bg-primary/10 px-3 py-2 text-sm">
              <span>
                ⏱️ 지난번 {fmtTime(progress.last_seconds)}까지 학습했어요.
              </span>
              <span className="flex gap-2">
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => {
                    seek(progress.last_seconds);
                    setResumeDismissed(true);
                  }}
                >
                  ▶ 이어보기
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={() => setResumeDismissed(true)}
                >
                  처음부터
                </Button>
              </span>
            </div>
          )}
      </div>

      {/* Scene timeline chips */}
      <div className="glass rounded-3xl p-3">
        <div className="text-xs text-muted-foreground mb-2 px-1">장면 타임라인</div>
        <div ref={timelineRef} className="flex gap-2 overflow-x-auto pb-1">
          {scenes.map((s, i) => {
            const active = i === shownIndex;
            return (
              <button
                key={i}
                data-scene-idx={i}
                onClick={() => {
                  setManualIndex(i);
                  seek(s.start_seconds);
                }}
                className={[
                  "shrink-0 rounded-2xl px-3 py-2 text-xs text-left transition-all",
                  active
                    ? "gradient-primary text-primary-foreground shadow-[var(--shadow-soft)]"
                    : "bg-white/60 hover:bg-white",
                ].join(" ")}
              >
                <div className="font-mono text-[10px] opacity-80">
                  {fmtTime(s.start_seconds)}
                </div>
                <div className="font-semibold truncate max-w-[140px]">
                  {s.index ?? i + 1}. {s.title}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <TranscriptPanel scenes={scenes} currentTime={currentTime} onSeek={seek} />

      {scene && (
        <ScenePanel
          scene={scene}
          onSeek={seek}
          dramaId={drama.id}
          sceneIndex={shownIndex}
          currentTime={currentTime}
          onQuizComplete={(score, total) => saveQuizScore(shownIndex, score, total)}
        />
      )}
    </div>
  );
}

/* 전체 대사: 스크롤 목록 + 재생 중 문장 하이라이트/자동 스크롤 + 클릭 점프 */
function TranscriptPanel({
  scenes,
  currentTime,
  onSeek,
}: {
  scenes: DramaScene[];
  currentTime: number;
  onSeek: (s: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);

  const lines = useMemo(() => {
    const flat = scenes.flatMap((scene, sIdx) => {
      const times = lineTimes(scene);
      return (scene.key_lines ?? []).map((l, i) => ({
        key: `${sIdx}-${i}`,
        sceneIndex: sIdx,
        zh: l.zh,
        pinyin: l.pinyin,
        ko: l.ko,
        speaker: l.speaker,
        time: times[i]?.time ?? scene.start_seconds,
        isExact: times[i]?.isExact ?? false,
      }));
    });
    return flat.sort((a, b) => a.time - b.time);
  }, [scenes]);

  // Active line = the last line whose timestamp has been reached.
  const activeKey = useMemo(() => {
    let key: string | null = null;
    for (const l of lines) {
      if (currentTime >= l.time - 0.3) key = l.key;
      else break;
    }
    return key;
  }, [lines, currentTime]);

  // Auto-scroll the active line into view (inside the panel only).
  useEffect(() => {
    if (!open || !activeKey) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-line-key="${activeKey}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeKey, open]);

  if (lines.length === 0) return null;

  return (
    <div className="glass rounded-3xl p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-1"
      >
        <span className="font-semibold">📜 전체 대사</span>
        <span className="text-xs text-muted-foreground">
          {lines.length}줄 {open ? "접기 ▲" : "펼치기 ▼"}
        </span>
      </button>

      {open && (
        <div
          ref={listRef}
          className="mt-3 max-h-72 overflow-y-auto pr-1 space-y-1 scroll-smooth"
        >
          {lines.map((l) => {
            const active = l.key === activeKey;
            return (
              <button
                key={l.key}
                data-line-key={l.key}
                type="button"
                onClick={() => onSeek(l.time)}
                className={[
                  "w-full text-left rounded-2xl px-3 py-2 transition-all flex items-start gap-3",
                  active
                    ? "gradient-primary text-primary-foreground shadow-[var(--shadow-soft)] scale-[1.01]"
                    : "hover:bg-white/70",
                ].join(" ")}
              >
                <span
                  className={[
                    "shrink-0 font-mono text-[10px] mt-1 px-1.5 py-0.5 rounded-full",
                    active
                      ? "bg-white/25"
                      : l.isExact
                        ? "bg-emerald-500/15 text-emerald-700"
                        : "bg-amber-500/15 text-amber-800",
                  ].join(" ")}
                >
                  {fmtTime(l.time)}
                </span>
                <span className="min-w-0">
                  {/* 나레이션 전용 줄(zh 없음)은 한국어 문장을 본문으로 표시 */}
                  <span className="block font-semibold leading-snug">
                    {l.speaker ? `${l.speaker} · ` : ""}
                    {l.zh || l.ko}
                  </span>
                  {l.pinyin && (
                    <span
                      className={[
                        "block text-[11px] font-mono",
                        active ? "text-primary-foreground/85" : "text-muted-foreground",
                      ].join(" ")}
                    >
                      {l.pinyin}
                    </span>
                  )}
                  {l.zh && l.ko && l.ko !== l.zh && (
                    <span
                      className={[
                        "block text-xs",
                        active ? "text-primary-foreground/90" : "text-foreground/80",
                      ].join(" ")}
                    >
                      {l.ko}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScenePanel({
  scene,
  onSeek,
  dramaId,
  sceneIndex,
  currentTime,
  onQuizComplete,
}: {
  scene: DramaScene;
  onSeek: (s: number) => void;
  dramaId: string;
  sceneIndex: number;
  currentTime: number;
  onQuizComplete?: (score: number, total: number) => void;
}) {
  const { data: profile } = useMyProfile();
  const isEditor = profile?.role === "teacher" || profile?.role === "admin";
  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-5 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-xl font-bold">
            🎬 장면 {scene.index} · {scene.title}
          </h2>
          <button
            onClick={() => onSeek(scene.start_seconds)}
            className="text-xs font-mono px-2 py-1 rounded-full bg-white/70 hover:bg-white"
          >
            ▶ {fmtTime(scene.start_seconds)} – {fmtTime(scene.end_seconds)}
          </button>
        </div>
        {scene.summary_ko && (
          <p className="text-sm leading-relaxed text-foreground/90">
            {scene.summary_ko}
          </p>
        )}
      </div>

      {scene.key_lines?.length > 0 && (
        <div className="glass rounded-3xl p-5 space-y-3">
          <div className="font-semibold flex items-center gap-2">💬 핵심 대사</div>
          <div className="space-y-2">
            {(() => {
              const n = scene.key_lines.length;
              const start = scene.start_seconds;
              const end = scene.end_seconds;
              const span = Math.max(0, end - start);
              const slot = span / Math.max(1, n);
              const buffer = Math.min(1.5, slot * 0.15);
              const usable = Math.max(0, span - buffer * 2);
              const step = usable / Math.max(1, n);
              return scene.key_lines.map((l, i) => {
                const raw = start + buffer + step * (i + 0.5);
                const clamped = Math.min(
                  Math.max(raw, start),
                  Math.max(start, end - 1),
                );
                const approx = Math.round(clamped);
                const explicit =
                  typeof l.time_seconds === "number" ? Math.round(l.time_seconds) : null;
                return (
                  <LineRow
                    key={i}
                    line={l}
                    timeSec={explicit ?? approx}
                    isExact={explicit !== null}
                    onSeek={onSeek}
                    isEditor={isEditor}
                    dramaId={dramaId}
                    sceneIndex={sceneIndex}
                    lineIndex={i}
                    currentTime={currentTime}
                  />
                );
              });
            })()}
          </div>
        </div>
      )}





      {scene.vocab?.length > 0 && (
        <div className="glass rounded-3xl p-5 space-y-3">
          <div className="font-semibold flex items-center gap-2">📚 핵심 단어</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {scene.vocab.map((v, i) => (
              <VocabRow key={i} item={v} />
            ))}
          </div>
        </div>
      )}

      {scene.culture_tip?.body && (
        <div className="rounded-3xl p-5 bg-gradient-to-br from-amber-100/70 to-pink-100/60 border border-white shadow-[var(--shadow-soft)] space-y-1">
          <div className="font-semibold">🌏 {scene.culture_tip.title || "문화 팁"}</div>
          <p className="text-sm leading-relaxed">{scene.culture_tip.body}</p>
        </div>
      )}

      {scene.quiz?.length > 0 && (
        <MiniQuiz quiz={scene.quiz} sceneKey={scene.index} onComplete={onQuizComplete} />
      )}
    </div>
  );
}

function LineRow({
  line,
  timeSec,
  isExact,
  onSeek,
  isEditor,
  dramaId,
  sceneIndex,
  lineIndex,
  currentTime,
}: {
  line: DramaScene["key_lines"][number];
  timeSec?: number;
  isExact?: boolean;
  onSeek?: (s: number) => void;
  isEditor?: boolean;
  dramaId?: string;
  sceneIndex?: number;
  lineIndex?: number;
  currentTime?: number;
}) {
  const { speak, speakingId } = useZhTts();
  const qc = useQueryClient();
  const id = `line-${line.zh}`;
  const speaking = speakingId === id;

  const saveTime = useMutation({
    mutationFn: (t: number) =>
      updateDramaLineTime({
        data: { id: dramaId!, sceneIndex: sceneIndex!, lineIndex: lineIndex!, timeSeconds: t },
      }),
    onSuccess: () => {
      toast.success("타임코드를 저장했어요");
      qc.invalidateQueries({ queryKey: ["drama", dramaId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "저장 실패"),
  });

  const canEdit =
    isEditor && dramaId && typeof sceneIndex === "number" && typeof lineIndex === "number";

  return (
    <div className="rounded-2xl bg-white/85 hover:bg-white border border-white p-3 flex items-start gap-3">
      <button
        onClick={() => line.zh && speak(line.zh, id)}
        disabled={!line.zh}
        className={[
          "shrink-0 size-9 rounded-full grid place-items-center transition-all",
          !line.zh
            ? "bg-muted text-muted-foreground/40"
            : speaking
              ? "gradient-primary text-primary-foreground animate-pulse"
              : "bg-primary/10 hover:bg-primary/20 text-primary",
        ].join(" ")}
        title={line.zh ? "중국어 듣기" : "나레이션 문장"}
      >
        <Volume2 className="size-4" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {line.speaker && (
            <div className="text-[10px] font-semibold text-muted-foreground uppercase">
              {line.speaker}
            </div>
          )}
          {typeof timeSec === "number" && onSeek && (
            <button
              onClick={() => onSeek(timeSec)}
              className={[
                "text-[10px] font-mono px-1.5 py-0.5 rounded-full",
                isExact
                  ? "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700"
                  : "bg-amber-500/15 hover:bg-amber-500/25 text-amber-800",
              ].join(" ")}
              title={isExact ? "실제 자막 시각" : "근사치 (편집 필요)"}
            >
              ▶ {fmtTime(timeSec)} {isExact ? "" : "≈"}
            </button>
          )}
          {canEdit && typeof currentTime === "number" && (
            <button
              onClick={() => saveTime.mutate(Math.round(currentTime))}
              disabled={saveTime.isPending}
              className="text-[10px] px-1.5 py-0.5 rounded-full bg-white border border-primary/30 hover:bg-primary/10 text-primary inline-flex items-center gap-1"
              title="현재 재생 시각을 이 대사에 저장"
            >
              <Clock className="size-3" />
              현재({fmtTime(Math.round(currentTime))})로 저장
            </button>
          )}
        </div>
        <div className="text-lg font-semibold tracking-wide leading-snug">
          {line.zh || line.ko}
        </div>
        {line.pinyin && (
          <div className="text-xs text-muted-foreground font-mono">{line.pinyin}</div>
        )}
        {line.zh && line.ko && line.ko !== line.zh && (
          <div className="text-sm mt-0.5">{line.ko}</div>
        )}
      </div>
    </div>
  );
}



function VocabRow({ item }: { item: DramaScene["vocab"][number] }) {
  const { speak, speakingId } = useZhTts();
  const { data: profile } = useMyProfile();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const id = `vocab-${item.zh}`;
  const emoji = item.emoji || guessEmoji(item.zh, item.ko);

  const save = useMutation({
    mutationFn: async () => {
      if (profile?.id) {
        await saveVocabulary({
          data: {
            zh: item.zh,
            pinyin: item.pinyin ?? null,
            ko: item.ko ?? null,
            emoji,
            hsk: item.hsk ?? null,
          },
        });
      } else {
        addGuestVocab({
          zh: item.zh,
          pinyin: item.pinyin,
          ko: item.ko,
          emoji,
          hsk: item.hsk,
        });
      }
    },
    onSuccess: () => {
      setSaved(true);
      toast.success("단어장에 저장했어요");
      qc.invalidateQueries({ queryKey: ["vocab"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "저장 실패"),
  });

  return (
    <div className="rounded-2xl bg-white/85 hover:bg-white border border-white p-3 flex items-center gap-3">
      <div className="size-12 rounded-2xl bg-gradient-to-br from-pink-100 to-sky-100 grid place-items-center text-2xl shrink-0">
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold">{item.zh}</span>
          {item.hsk && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
              HSK{item.hsk}
            </span>
          )}
        </div>
        {item.pinyin && (
          <div className="text-xs text-muted-foreground font-mono">{item.pinyin}</div>
        )}
        {item.ko && <div className="text-sm">{item.ko}</div>}
      </div>
      <div className="flex flex-col gap-1">
        <button
          onClick={() => speak(item.zh, id)}
          className={[
            "size-8 rounded-full grid place-items-center transition-all",
            speakingId === id
              ? "gradient-primary text-primary-foreground"
              : "bg-primary/10 hover:bg-primary/20 text-primary",
          ].join(" ")}
          title="듣기"
        >
          <Volume2 className="size-3.5" />
        </button>
        <button
          onClick={() => !saved && save.mutate()}
          disabled={saved || save.isPending}
          className={[
            "size-8 rounded-full grid place-items-center transition-all",
            saved
              ? "bg-emerald-500 text-white"
              : "bg-white border border-primary/30 hover:bg-primary/10 text-primary",
          ].join(" ")}
          title={saved ? "저장됨" : "단어장에 저장"}
        >
          {saved ? <Check className="size-3.5" /> : <BookmarkPlus className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}

function MiniQuiz({
  quiz,
  sceneKey,
  onComplete,
}: {
  quiz: DramaScene["quiz"];
  sceneKey: number;
  onComplete?: (score: number, total: number) => void;
}) {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string>("");
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);

  // Reset on scene change
  useEffect(() => {
    setStep(0);
    setPicked("");
    setRevealed(false);
    setScore(0);
  }, [sceneKey]);

  const q = quiz[step];
  if (!q) return null;
  const done = step >= quiz.length - 1 && revealed;

  // Resolve the correct option text. AI sometimes stores answer as "B", "b",
  // "2", or as the option text itself. Normalize to a canonical option text.
  const resolveAnswerText = (): string => {
    const raw = (q.answer ?? "").trim();
    if (q.type === "choice" && q.options?.length) {
      const letter = raw.toUpperCase();
      if (/^[A-Z]$/.test(letter)) {
        const idx = letter.charCodeAt(0) - "A".charCodeAt(0);
        if (idx >= 0 && idx < q.options.length) return q.options[idx];
      }
      if (/^\d+$/.test(raw)) {
        const idx = parseInt(raw, 10) - 1;
        if (idx >= 0 && idx < q.options.length) return q.options[idx];
      }
      const match = q.options.find((o) => o.trim() === raw);
      if (match) return match;
    }
    return raw;
  };
  const answerText = resolveAnswerText();
  const isCorrect = (val: string) => val.trim() === answerText.trim();

  const check = () => {
    if (!picked) return;
    const nextScore = score + (isCorrect(picked) ? 1 : 0);
    setScore(nextScore);
    setRevealed(true);
    // Last question answered → report the final score once.
    if (step >= quiz.length - 1) onComplete?.(nextScore, quiz.length);
  };
  const next = () => {
    setStep((s) => s + 1);
    setPicked("");
    setRevealed(false);
  };


  return (
    <div className="glass rounded-3xl p-5 space-y-4 border border-primary/30">
      <div className="flex items-center justify-between">
        <div className="font-semibold">✨ 미니 퀴즈</div>
        <div className="text-xs text-muted-foreground">
          {step + 1} / {quiz.length} · 점수 {score}
        </div>
      </div>
      <div className="text-base font-medium whitespace-pre-wrap">{q.question}</div>
      {q.type === "choice" && q.options ? (
        <div className="grid sm:grid-cols-2 gap-2">
          {q.options.map((opt) => {
            const isPicked = picked === opt;
            const isAnswer = revealed && isCorrect(opt);
            const isWrong = revealed && isPicked && !isAnswer;
            return (
              <button
                key={opt}
                onClick={() => !revealed && setPicked(opt)}
                disabled={revealed}
                className={[
                  "text-left rounded-2xl px-4 py-3 border transition-all text-sm",
                  isAnswer
                    ? "bg-emerald-500/90 text-white border-emerald-500"
                    : isWrong
                      ? "bg-destructive/80 text-destructive-foreground border-destructive"
                      : isPicked
                        ? "bg-primary/20 border-primary"
                        : "bg-white/80 hover:bg-white border-white",
                ].join(" ")}
              >
                {opt}
              </button>
            );
          })}
        </div>
      ) : (
        <input
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          disabled={revealed}
          className="w-full rounded-2xl px-4 py-3 bg-white/80 border border-white outline-none focus:border-primary"
          placeholder="정답을 입력하세요 (예: 学)"
        />
      )}
      {revealed && (
        <div
          className={[
            "rounded-2xl p-3 text-sm",
            isCorrect(picked)
              ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
              : "bg-rose-50 text-rose-900 border border-rose-200",
          ].join(" ")}
        >
          <div className="font-semibold">
            {isCorrect(picked) ? "✅ 정답!" : `❌ 정답은 "${answerText}"`}
          </div>

          {q.explanation && <div className="mt-1">{q.explanation}</div>}
        </div>
      )}
      <div className="flex justify-end gap-2">
        {!revealed ? (
          <Button onClick={check} disabled={!picked}>
            확인
          </Button>
        ) : done ? (
          <Button
            onClick={() => {
              setStep(0);
              setScore(0);
              setPicked("");
              setRevealed(false);
            }}
          >
            🎉 완료! 다시 풀기 ({score}/{quiz.length})
          </Button>
        ) : (
          <Button onClick={next}>다음 문제 →</Button>
        )}
      </div>
    </div>
  );
}
