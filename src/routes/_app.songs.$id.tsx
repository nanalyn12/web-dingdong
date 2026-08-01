import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  AlertCircle,
  ArrowLeft,
  BookmarkPlus,
  BookOpen,
  Check,
  Download,
  Loader2,
  Music,
  Pause,
  PencilLine,
  Play,
  Repeat,
  Rewind,
  FastForward,
  Sparkles,
  Video,
  Volume2,
  VolumeX,
} from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMyProfile } from "@/lib/auth-client";
import { useSongProgress } from "@/lib/song-progress";
import { listVocabulary, saveVocabulary } from "@/lib/vocab.functions";
import { addGuestVocab, guessEmoji, loadGuestVocab } from "@/lib/vocab";
import type { PlayerAPI } from "@/lib/player-api";
import { YouTubeMediaSurface } from "@/components/youtube-media-surface";
import { TapSyncPanel } from "@/components/tap-sync-panel";
import {
  getSongRelatedContent,
  regenerateSongRelatedContent,
  type SongRelatedContent,
} from "@/lib/content-links.functions";

const POLL_INTERVAL_MS = 8000;
const EST_AUDIO_SEC = 150;
const EST_VIDEO_SEC = 120;
function isRateLimitedMessage(msg: string | null | undefined): boolean {
  return !!msg && /429|한도\s*초과|rate.?limit|too many/i.test(msg);
}
function fmtSec(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function fmtSecKor(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}
function isSectionHeader(text: string | null | undefined): boolean {
  if (!text) return false;
  return /^\s*\[[^\]]+\]\s*$/.test(text);
}

import {
  GENRE_LABEL,
  SONG_GENRES,
  SONG_THEMES,
  THEME_LABEL,
  type SongGenre,
  type SongTheme,
} from "@/lib/song-taxonomy";
import {
  generateSongLessonContent,
  generateSongMp4,
  getSong,
  pollSongGeneration,
  pollSongMp4,
  reannotateSong,
  resyncSongLyrics,
  setSongLyricTimes,
  setSongTaxonomy,
  type GrammarNote,
  type LyricLine,
  type SongRow,
  type VocabItem,
} from "@/lib/songs.functions";
import { levelLabel } from "@/lib/levels";

export const Route = createFileRoute("/_app/songs/$id")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["song", params.id],
      queryFn: () => getSong({ data: { id: params.id } }),
    }),
  component: SongPlayerPage,
  errorComponent: ({ error }) => (
    <div className="glass rounded-3xl p-6 text-sm text-destructive">
      {error.message}
    </div>
  ),
  notFoundComponent: () => <div>없습니다.</div>,
});

function SongPlayerPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: profile } = useMyProfile();
  const isEditor = profile?.role === "teacher" || profile?.role === "admin";
  const { data: song } = useQuery({
    queryKey: ["song", id],
    queryFn: () => getSong({ data: { id } }),
    refetchInterval: (q) => {
      const s = q.state.data as SongRow | undefined;
      return s &&
        (s.status === "generating_audio" || s.status === "generating_video")
        ? 6000
        : false;
    },
  });

  const [pollError, setPollError] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const status = song?.status;
  const songId = song?.id;
  useEffect(() => {
    if (!songId || !isEditor) return;
    if (status !== "generating_audio" && status !== "generating_video") {
      setPollError(null);
      setRetryAt(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        if (status === "generating_audio") {
          await pollSongGeneration({ data: { songId } });
        } else if (status === "generating_video") {
          await pollSongMp4({ data: { songId } });
        }
        if (!cancelled) {
          setPollError(null);
          setRetryAt(null);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "폴링 중 오류";
        console.warn("[suno] poll error", e);
        if (!cancelled) {
          setPollError(msg);
          if (isRateLimitedMessage(msg))
            setRetryAt(Date.now() + POLL_INTERVAL_MS);
        }
      } finally {
        if (!cancelled) qc.invalidateQueries({ queryKey: ["song", id] });
      }
    };
    const t = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [songId, status, id, qc, isEditor]);

  if (!song) return null;
  return (
    <div className="space-y-4">
      <SongPlayer
        song={song}
        pollError={pollError}
        retryAt={retryAt}
      />
      <RelatedLessonsCard songId={song.id} isEditor={isEditor} />
    </div>
  );
}

/** 🔗 연계 학습 — AI가 노래와 이어지는 레슨을 골라 연계성·차이점을 설명. */
function RelatedLessonsCard({
  songId,
  isEditor,
}: {
  songId: string;
  isEditor: boolean;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["song-related", songId],
    queryFn: () => getSongRelatedContent({ data: { songId } }),
    staleTime: Infinity,
  });
  const regen = useMutation({
    mutationFn: () => regenerateSongRelatedContent({ data: { songId } }),
    onSuccess: (d: SongRelatedContent | null) => {
      qc.setQueryData(["song-related", songId], d);
      toast.success("연계 학습을 다시 분석했어요.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "분석 실패"),
  });

  if (isLoading) {
    return (
      <section className="glass rounded-3xl p-5 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        叮叮이 이 노래와 이어지는 강의를 분석하는 중…
      </section>
    );
  }
  if (!data?.links?.length) {
    if (!isEditor) return null;
    return (
      <section className="glass rounded-3xl p-5 flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>연계 학습 데이터가 아직 없어요.</span>
        <Button size="sm" variant="outline" disabled={regen.isPending} onClick={() => regen.mutate()}>
          {regen.isPending && <Loader2 className="size-3.5 mr-1 animate-spin" />}
          분석하기
        </Button>
      </section>
    );
  }

  return (
    <section className="glass rounded-3xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-bold text-lg">🔗 연계 학습 — 이 노래와 이어지는 강의</h2>
        {isEditor && (
          <Button size="sm" variant="ghost" className="text-xs" disabled={regen.isPending} onClick={() => regen.mutate()}>
            {regen.isPending ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : null}
            다시 분석
          </Button>
        )}
      </div>
      {data.summary && (
        <p className="text-sm text-muted-foreground">{data.summary}</p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {data.links.map((l) => (
          <div
            key={l.lesson_id}
            className="rounded-2xl bg-white/50 border border-white/60 p-4 space-y-2"
          >
            <Link
              to="/lessons/$id"
              params={{ id: l.lesson_id }}
              className="font-semibold text-primary hover:underline leading-snug block"
            >
              📚 {l.lesson_title} →
            </Link>
            <p className="text-sm">{l.reason}</p>
            {l.shared.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {l.shared.map((s, i) => (
                  <span
                    key={i}
                    title={s.note}
                    className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium"
                  >
                    {s.zh}
                    {s.note ? ` · ${s.note}` : ""}
                  </span>
                ))}
              </div>
            )}
            {l.difference && (
              <p className="text-xs text-muted-foreground">↔ {l.difference}</p>
            )}
            {l.order_tip && (
              <p className="text-xs text-emerald-700 bg-emerald-500/10 rounded-xl px-2.5 py-1.5">
                💡 {l.order_tip}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function SongPlayer({
  song,
  pollError,
  retryAt,
}: {
  song: SongRow;
  pollError?: string | null;
  retryAt?: number | null;
}) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [muted, setMuted] = useState(false);
  const [loopActiveLine, setLoopActiveLine] = useState(false);
  const [showPinyinPref, setShowPinyinPref] = useState<boolean | null>(null);
  const [showKoPref, setShowKoPref] = useState(true);
  const [tapSyncOpen, setTapSyncOpen] = useState(false);
  const apiRef = useRef<PlayerAPI | null>(null);
  const qc = useQueryClient();
  const { data: profile } = useMyProfile();
  const isEditor = profile?.role === "teacher" || profile?.role === "admin";

  const saveTimes = useMutation({
    mutationFn: (times: (number | null)[]) =>
      setSongLyricTimes({ data: { songId: song.id, times } }),
    onSuccess: () => {
      toast.success("가사 싱크를 저장했어요 🎤");
      qc.invalidateQueries({ queryKey: ["song", song.id] });
      setTapSyncOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "싱크 저장 실패"),
  });

  const rawLyrics = useMemo(
    () => (Array.isArray(song.lyrics) ? song.lyrics : []),
    [song.lyrics],
  );
  const hasRealTimes = rawLyrics.some((l) => typeof l.time === "number");

  // Character-weighted timestamps when the song has none (Suno case).
  // Section headers inherit the next real line's time so activeIdx skips them
  // naturally. Assumes lyrics roughly cover [intro, duration - outro].
  const estimatedTimes = useMemo<(number | undefined)[]>(() => {
    if (hasRealTimes || !duration || duration <= 1 || rawLyrics.length === 0) {
      return rawLyrics.map(() => undefined);
    }
    const INTRO = Math.min(3, duration * 0.05);
    const OUTRO = Math.min(4, duration * 0.08);
    const span = Math.max(1, duration - INTRO - OUTRO);
    const realIdx: number[] = [];
    const weights: number[] = [];
    rawLyrics.forEach((l, i) => {
      if (!isSectionHeader(l.zh) && l.zh?.trim()) {
        realIdx.push(i);
        // char weight, min 1 so short lines still get airtime
        weights.push(Math.max(1, [...l.zh.trim()].length));
      }
    });
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const out: (number | undefined)[] = rawLyrics.map(() => undefined);
    let cum = 0;
    realIdx.forEach((idx, k) => {
      out[idx] = INTRO + (cum / total) * span;
      cum += weights[k];
    });
    // Section headers/empty inherit next real line's time (minus a hair).
    for (let i = rawLyrics.length - 1; i >= 0; i--) {
      if (out[i] === undefined) {
        for (let j = i + 1; j < rawLyrics.length; j++) {
          if (out[j] !== undefined) {
            out[i] = Math.max(0, (out[j] as number) - 0.05);
            break;
          }
        }
      }
    }
    // Any still-undefined (trailing) → last real time
    let lastKnown = 0;
    for (let i = 0; i < rawLyrics.length; i++) {
      if (out[i] !== undefined) lastKnown = out[i] as number;
      else out[i] = lastKnown;
    }
    return out;
  }, [rawLyrics, duration, hasRealTimes]);

  const lyrics = useMemo<LyricLine[]>(
    () =>
      rawLyrics.map((l, i) => ({
        ...l,
        time: typeof l.time === "number" ? l.time : estimatedTimes[i],
      })),
    [rawLyrics, estimatedTimes],
  );
  const hasTimes = lyrics.some((l) => typeof l.time === "number");
  const showPinyin =
    showPinyinPref ?? (song.level !== "advanced");

  // Per-line seek target time: use own time, else nearest following timed line,
  // else nearest preceding timed line. Enables clicking on section headers or
  // untimed lines to jump to a sensible position.
  const lineTimes = useMemo<(number | null)[]>(() => {
    const out: (number | null)[] = lyrics.map((l) =>
      typeof l.time === "number" ? l.time : null,
    );
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i] === null) {
        for (let j = i + 1; j < out.length; j++) {
          if (out[j] !== null) { out[i] = out[j]; break; }
        }
      }
    }
    for (let i = 0; i < out.length; i++) {
      if (out[i] === null) {
        for (let j = i - 1; j >= 0; j--) {
          if (out[j] !== null) { out[i] = out[j]; break; }
        }
      }
    }
    return out;
  }, [lyrics]);

  const hasAudio = Boolean(song.media_url);
  const hasVideo = Boolean(song.video_url);
  const isCurated = song.source === "curated" && Boolean(song.youtube_id);
  const [mediaMode, setMediaMode] = useState<"audio" | "video">(
    hasVideo ? "video" : "audio",
  );
  useEffect(() => {
    if (mediaMode === "video" && !hasVideo) setMediaMode("audio");
    if (mediaMode === "audio" && !hasAudio && hasVideo) setMediaMode("video");
  }, [hasAudio, hasVideo, mediaMode]);
  const activeUrl =
    mediaMode === "video" ? song.video_url : song.media_url;

  // Active line: last line whose time <= currentTime, skipping section headers.
  const activeIdx = useMemo(() => {
    if (!hasTimes) return -1;
    let idx = -1;
    for (let i = 0; i < lyrics.length; i++) {
      const t = lyrics[i].time;
      if (typeof t === "number" && t <= currentTime + 0.05) {
        if (!isSectionHeader(lyrics[i].zh)) idx = i;
      } else if (typeof t === "number") {
        break;
      }
    }
    return idx;
  }, [lyrics, currentTime, hasTimes]);

  // Loop the active line: when currentTime passes the next line's time, seek back.
  useEffect(() => {
    if (!loopActiveLine || activeIdx < 0) return;
    const next = lyrics[activeIdx + 1];
    const start = lyrics[activeIdx]?.time;
    if (typeof start !== "number") return;
    if (next && typeof next.time === "number" && currentTime >= next.time - 0.1) {
      apiRef.current?.seek(start);
    }
  }, [currentTime, loopActiveLine, activeIdx, lyrics]);

  const seekTo = useCallback((t: number) => apiRef.current?.seek(t), []);
  const jumpLine = (dir: -1 | 1) => {
    if (!hasTimes) return;
    if (activeIdx < 0) {
      const first = lyrics.find((l) => typeof l.time === "number");
      if (first && typeof first.time === "number") apiRef.current?.seek(first.time);
      return;
    }
    const target = lyrics[activeIdx + dir];
    if (target && typeof target.time === "number") apiRef.current?.seek(target.time);
  };

  // Auto-scroll active line into view
  const listRef = useRef<HTMLDivElement>(null);
  // scrollIntoView walks every scrollable ancestor, so it dragged the whole
  // page around on each line change while the song played. Scroll the lyric
  // list's own box instead and leave the window where the reader put it.
  const scrollLineIntoView = useCallback((idx: number) => {
    const list = listRef.current;
    if (idx < 0 || !list) return;
    const el = list.querySelector<HTMLElement>(`[data-line="${idx}"]`);
    if (!el) return;
    const target = el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2;
    list.scrollTo({
      top: Math.max(0, target),
      behavior: "smooth",
    });
  }, []);
  useEffect(() => {
    scrollLineIntoView(activeIdx);
  }, [activeIdx, scrollLineIntoView]);

  // Click-triggered pulse highlight (independent of playback active state)
  const [clickedIdx, setClickedIdx] = useState<number>(-1);
  const clickedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLyricClick = useCallback(
    (idx: number, t: number) => {
      setClickedIdx(idx);
      scrollLineIntoView(idx);
      seekTo(t);
      if (clickedTimerRef.current) clearTimeout(clickedTimerRef.current);
      clickedTimerRef.current = setTimeout(() => setClickedIdx(-1), 900);
    },
    [scrollLineIntoView, seekTo],
  );
  useEffect(
    () => () => {
      if (clickedTimerRef.current) clearTimeout(clickedTimerRef.current);
    },
    [],
  );

  const coverBg = song.cover_url
    ? { backgroundImage: `url(${song.cover_url})` }
    : undefined;

  return (
    <div className="space-y-4">
      <Link
        to="/songs"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> 학습송 목록
      </Link>

      {/* ─── HERO PLAYER ────────────────────────────────────────── */}
      <div className="relative rounded-3xl overflow-hidden glass animate-fade-in">
        {/* Blurred cover backdrop */}
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center opacity-40"
          style={{
            ...coverBg,
            filter: "blur(48px) saturate(1.4)",
            transform: "scale(1.2)",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-white/60 via-white/40 to-white/70 dark:from-black/60 dark:via-black/40 dark:to-black/70" />

        <div className="relative p-5 sm:p-6 space-y-5">
          <div className="flex items-start gap-4 flex-wrap">
            {/* Cover / LP */}
            <div
              className={[
                "size-28 sm:size-32 rounded-full overflow-hidden gradient-primary grid place-items-center text-3xl text-primary-foreground shrink-0 shadow-[var(--shadow-soft)] ring-4 ring-white/60",
                isPlaying ? "animate-spin" : "",
              ].join(" ")}
              style={{ animationDuration: "12s" }}
            >
              {song.cover_url ? (
                <img
                  src={song.cover_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <Music className="size-10" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold truncate">
                {song.title}
              </h1>
              {song.title_zh && (
                <div className="text-lg text-muted-foreground truncate">
                  {song.title_zh}
                </div>
              )}
              {song.artist && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  by {song.artist}
                </div>
              )}
              <div className="flex gap-1.5 mt-2 flex-wrap">
                <span className="rounded-full glass-soft px-2 py-0.5 text-[11px] font-semibold">
                  {levelLabel(song.level)}
                </span>
                {song.genre && GENRE_LABEL[song.genre] && (
                  <span className="rounded-full glass-soft px-2 py-0.5 text-[11px] font-semibold">
                    {GENRE_LABEL[song.genre]}
                  </span>
                )}
                {song.theme && THEME_LABEL[song.theme] && (
                  <span className="rounded-full glass-soft px-2 py-0.5 text-[11px] font-semibold">
                    {THEME_LABEL[song.theme]}
                  </span>
                )}
                {song.source === "curated" ? (
                  <span className="rounded-full bg-rose-500/15 text-rose-700 px-2 py-0.5 text-[11px] font-semibold">
                    🎧 실제 노래
                  </span>
                ) : (
                  <span className="rounded-full bg-violet-500/15 text-violet-700 px-2 py-0.5 text-[11px] font-semibold">
                    🤖 AI 생성
                  </span>
                )}
                <span
                  className="rounded-full glass-soft px-2 py-0.5 text-[11px]"
                  title={
                    hasRealTimes
                      ? "Suno 정렬 기반의 실제 타이밍이에요."
                      : "실제 타이밍이 없어 글자 수로 추정한 값이라 조금씩 어긋날 수 있어요."
                  }
                >
                  {lyrics.length}줄{" "}
                  {hasRealTimes ? "· 싱크" : hasTimes ? "· 추정 싱크" : "· 정적"}
                </span>
                {hasVideo && (
                  <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[11px] font-semibold">
                    🎬 MP4
                  </span>
                )}
                {song.status === "generating_audio" && (
                  <span className="rounded-full bg-amber-200/60 text-amber-900 px-2 py-0.5 text-[11px] font-semibold animate-pulse">
                    🎙️ 음원 생성 중
                  </span>
                )}
                {song.status === "generating_video" && (
                  <span className="rounded-full bg-amber-200/60 text-amber-900 px-2 py-0.5 text-[11px] font-semibold animate-pulse">
                    🎬 영상 생성 중
                  </span>
                )}
                {song.status === "failed_video" && (
                  <span className="rounded-full bg-destructive/15 text-destructive px-2 py-0.5 text-[11px] font-semibold">
                    🎬 영상 실패
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 shrink-0">
              {hasAudio && hasVideo && (
                <div className="glass-soft rounded-full p-1 inline-flex">
                  <button
                    onClick={() => setMediaMode("audio")}
                    className={[
                      "px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 transition-colors",
                      mediaMode === "audio"
                        ? "gradient-primary text-primary-foreground"
                        : "text-foreground/70 hover:text-foreground",
                    ].join(" ")}
                  >
                    <Music className="size-3" /> 오디오
                  </button>
                  <button
                    onClick={() => setMediaMode("video")}
                    className={[
                      "px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 transition-colors",
                      mediaMode === "video"
                        ? "gradient-primary text-primary-foreground"
                        : "text-foreground/70 hover:text-foreground",
                    ].join(" ")}
                  >
                    <Video className="size-3" /> 영상
                  </button>
                </div>
              )}
              <div className="flex gap-1.5 flex-wrap justify-end">
                {hasAudio && (
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={song.media_url!}
                      download={`${song.title}.mp3`}
                    >
                      <Download className="size-4 mr-1" /> MP3
                    </a>
                  </Button>
                )}
                {hasVideo && (
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={song.video_url!}
                      download={`${song.title}.mp4`}
                    >
                      <Download className="size-4 mr-1" /> MP4
                    </a>
                  </Button>
                )}
                {isEditor && lyrics.length > 0 && !tapSyncOpen && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTapSyncOpen(true)}
                    title="노래를 들으며 줄마다 키를 눌러 싱크를 직접 기록해요."
                  >
                    🎤 탭 싱크
                  </Button>
                )}
                <TaxonomyEditor song={song} />
                <ResyncLyricsButton song={song} />
                <RetryMp4Button song={song} />
                <MakeLessonContentButton song={song} />
                <ReannotateButton song={song} />
              </div>
            </div>
          </div>

          {/* Media surface (video / iframe / audio placeholder) */}
          {isCurated && song.youtube_id ? (
            <YouTubeMediaSurface
              key={song.youtube_id}
              videoId={song.youtube_id}
              title={song.title}
              onTime={setCurrentTime}
              onDuration={setDuration}
              onPlayingChange={setIsPlaying}
              apiRef={apiRef}
              playbackRate={playbackRate}
              muted={muted}
            />
          ) : activeUrl ? (
            <NativeMediaSurface
              key={`${mediaMode}-${activeUrl}`}
              url={activeUrl}
              isVideo={mediaMode === "video"}
              onTime={setCurrentTime}
              onDuration={setDuration}
              onPlayingChange={setIsPlaying}
              apiRef={apiRef}
              playbackRate={playbackRate}
              muted={muted}
            />
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-muted-foreground/20 p-10 text-center text-muted-foreground text-sm bg-white/40">
              {song.status === "generating_audio"
                ? "🎙️ 음원 준비 중… 완료되면 자동으로 표시돼요."
                : "재생할 미디어가 아직 없어요."}
            </div>
          )}

          {/* Custom player controls — curated songs now run through the
              YouTube IFrame API, so they get a real clock and seek too. */}
          {(isCurated ? Boolean(song.youtube_id) : Boolean(activeUrl)) && (
            <PlayerControls
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
              muted={muted}
              playbackRate={playbackRate}
              loopLine={loopActiveLine}
              lyrics={lyrics}
              hasTimes={hasTimes}
              activeIdx={activeIdx}
              onPlayPause={() => apiRef.current?.toggle()}
              onSeek={seekTo}
              onPrevLine={() => jumpLine(-1)}
              onNextLine={() => jumpLine(1)}
              onRateChange={(r) => {
                setPlaybackRate(r);
                apiRef.current?.setRate(r);
              }}
              onMuteToggle={() => {
                const next = !muted;
                setMuted(next);
                apiRef.current?.setMuted(next);
              }}
              onLoopToggle={() => setLoopActiveLine((v) => !v)}
            />
          )}
        </div>
      </div>

      {tapSyncOpen && (
        <TapSyncPanel
          lyrics={rawLyrics}
          currentTime={currentTime}
          isPlaying={isPlaying}
          onSeek={seekTo}
          onPlayPause={() => apiRef.current?.toggle()}
          onSave={(times) => saveTimes.mutate(times)}
          onClose={() => setTapSyncOpen(false)}
          saving={saveTimes.isPending}
        />
      )}

      {(song.status === "generating_audio" ||
        song.status === "generating_video") && (
        <SunoStatusPanel
          song={song}
          pollError={pollError ?? null}
          retryAt={retryAt ?? null}
        />
      )}

      {/* ─── KARAOKE / LYRICS ─────────────────────────────────────── */}
      <div className="grid lg:grid-cols-5 gap-4">
        {/* Karaoke big line */}
        <div className="lg:col-span-3 glass rounded-3xl p-6 min-h-[280px] flex flex-col justify-center items-center text-center relative overflow-hidden">
          <div className="absolute inset-0 gradient-primary opacity-5" />
          <div className="relative w-full space-y-3">
            <div className="flex items-center justify-center gap-2 text-[11px]">
              <button
                onClick={() => setShowPinyinPref(!showPinyin)}
                className={[
                  "rounded-full px-2.5 py-1 font-semibold transition-colors",
                  showPinyin
                    ? "bg-primary/20 text-primary"
                    : "glass-soft text-muted-foreground",
                ].join(" ")}
              >
                병음 {showPinyin ? "ON" : "OFF"}
              </button>
              <button
                onClick={() => setShowKoPref((v) => !v)}
                className={[
                  "rounded-full px-2.5 py-1 font-semibold transition-colors",
                  showKoPref
                    ? "bg-primary/20 text-primary"
                    : "glass-soft text-muted-foreground",
                ].join(" ")}
              >
                한국어 {showKoPref ? "ON" : "OFF"}
              </button>
            </div>

            {lyrics.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8">
                가사가 아직 없어요.
              </div>
            ) : (
              <KaraokeStage
                lyrics={lyrics}
                activeIdx={activeIdx}
                showPinyin={showPinyin}
                showKo={showKoPref}
              />
            )}
          </div>
        </div>

        {/* Scrollable lyric list */}
        <div className="lg:col-span-2 glass-read rounded-3xl p-4">
          <div className="text-xs font-semibold text-muted-foreground mb-2 px-1 flex items-center justify-between">
            <span>전체 가사</span>
            {hasTimes && (
              <span
                className={[
                  "text-[10px]",
                  hasRealTimes ? "text-primary" : "text-muted-foreground",
                ].join(" ")}
              >
                {hasRealTimes ? "싱크 가능" : "추정 싱크 (오차 있음)"}
              </span>
            )}
          </div>
          <div
            ref={listRef}
            className="max-h-[52vh] overflow-y-auto pr-1 space-y-1.5"
          >
            {lyrics.map((line, i) => (
              <LyricRow
                key={i}
                index={i}
                line={line}
                active={i === activeIdx}
                justClicked={i === clickedIdx}
                showPinyin={showPinyin}
                showKo={showKoPref}
                seekTime={hasTimes ? lineTimes[i] : null}
                onSeek={(t) => handleLyricClick(i, t)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ─── LEARNING TABS ────────────────────────────────────────── */}
      <SongLessonTabs song={song} onSeek={hasTimes ? seekTo : undefined} />
    </div>
  );
}

// ─── Karaoke stage (large current line with prev/next preview) ────────────
function KaraokeStage({
  lyrics,
  activeIdx,
  showPinyin,
  showKo,
}: {
  lyrics: LyricLine[];
  activeIdx: number;
  showPinyin: boolean;
  showKo: boolean;
}) {
  // Find current real (non-header) line at or after activeIdx.
  const startIdx = activeIdx >= 0 ? activeIdx : 0;
  let curIdx = startIdx;
  while (curIdx < lyrics.length && isSectionHeader(lyrics[curIdx]?.zh)) {
    curIdx++;
  }
  const cur = lyrics[curIdx];

  // Detect section header sitting on/just-above the current line (for the badge).
  const sectionHeader =
    activeIdx >= 0 && isSectionHeader(lyrics[activeIdx]?.zh)
      ? lyrics[activeIdx].zh
      : (() => {
          for (let i = curIdx - 1; i >= 0; i--) {
            if (isSectionHeader(lyrics[i]?.zh)) return lyrics[i].zh;
            // stop scanning when we cross the previous shown-line
            if (!isSectionHeader(lyrics[i]?.zh)) break;
          }
          return null;
        })();

  // prev/next real (non-header) lines
  const prevIdx = (() => {
    for (let i = curIdx - 1; i >= 0; i--) {
      if (!isSectionHeader(lyrics[i]?.zh)) return i;
    }
    return -1;
  })();
  const nextIdx = (() => {
    for (let i = curIdx + 1; i < lyrics.length; i++) {
      if (!isSectionHeader(lyrics[i]?.zh)) return i;
    }
    return -1;
  })();
  const prev = prevIdx >= 0 ? lyrics[prevIdx] : null;
  const next = nextIdx >= 0 ? lyrics[nextIdx] : null;

  if (!cur) {
    return (
      <div className="text-sm text-muted-foreground py-8">
        가사가 아직 없어요.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sectionHeader && (
        <div className="flex justify-center">
          <span className="rounded-full bg-primary/15 text-primary px-3 py-1 text-[10px] font-bold uppercase tracking-widest">
            {sectionHeader.replace(/^\s*\[|\]\s*$/g, "")}
          </span>
        </div>
      )}
      {prev && (
        <div className="text-base text-muted-foreground/60 truncate">
          {prev.zh}
        </div>
      )}
      <div key={curIdx} className="animate-fade-in space-y-1.5">
        <div className="text-3xl sm:text-4xl font-black leading-tight break-words">
          {cur.zh}
        </div>
        {showPinyin && cur.pinyin && (
          <div className="text-base font-mono text-primary/80">
            {cur.pinyin}
          </div>
        )}
        {showKo && cur.ko && (
          <div className="text-sm text-foreground/85">{cur.ko}</div>
        )}
      </div>
      {next && (
        <div className="text-base text-muted-foreground/60 truncate">
          {next.zh}
        </div>
      )}
    </div>
  );
}


// ─── Player controls ──────────────────────────────────────────────────────
function PlayerControls({
  currentTime,
  duration,
  isPlaying,
  muted,
  playbackRate,
  loopLine,
  lyrics,
  hasTimes,
  activeIdx,
  onPlayPause,
  onSeek,
  onPrevLine,
  onNextLine,
  onRateChange,
  onMuteToggle,
  onLoopToggle,
}: {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  muted: boolean;
  playbackRate: number;
  loopLine: boolean;
  lyrics: LyricLine[];
  hasTimes: boolean;
  activeIdx: number;
  onPlayPause: () => void;
  onSeek: (t: number) => void;
  onPrevLine: () => void;
  onNextLine: () => void;
  onRateChange: (r: number) => void;
  onMuteToggle: () => void;
  onLoopToggle: () => void;
}) {
  const rates = [0.75, 1, 1.25];
  const dur = duration || 0;
  return (
    <div className="rounded-2xl bg-white/70 dark:bg-black/40 backdrop-blur px-4 py-3 space-y-2 shadow-[var(--shadow-soft)]">
      {/* Progress bar with lyric dots */}
      <div className="relative pt-1">
        <Slider
          value={[Math.min(currentTime, dur || currentTime)]}
          min={0}
          max={dur || 1}
          step={0.05}
          onValueChange={([v]) => onSeek(v)}
          disabled={dur === 0}
        />
        {hasTimes && dur > 0 && (
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 pointer-events-none px-1">
            {lyrics.map((l, i) =>
              typeof l.time === "number" && l.time <= dur ? (
                <span
                  key={i}
                  className={[
                    "absolute size-1.5 rounded-full -translate-x-1/2 -translate-y-1/2",
                    i === activeIdx ? "bg-primary" : "bg-primary/40",
                  ].join(" ")}
                  style={{ left: `${(l.time / dur) * 100}%`, top: "50%" }}
                />
              ) : null,
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-[11px] font-mono text-muted-foreground tabular-nums">
          {fmtSec(currentTime)} / {fmtSec(dur)}
        </div>

        <div className="flex items-center gap-1 mx-auto">
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={onPrevLine}
            disabled={!hasTimes}
            aria-label="이전 가사"
          >
            <Rewind className="size-4" />
          </Button>
          <Button
            variant="default"
            size="icon"
            className="size-11 rounded-full gradient-primary text-primary-foreground shadow-[var(--shadow-soft)] hover:scale-105 transition-transform"
            onClick={onPlayPause}
            aria-label={isPlaying ? "일시정지" : "재생"}
          >
            {isPlaying ? (
              <Pause className="size-5" />
            ) : (
              <Play className="size-5 ml-0.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={onNextLine}
            disabled={!hasTimes}
            aria-label="다음 가사"
          >
            <FastForward className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <div className="glass-soft rounded-full flex text-[11px] font-semibold overflow-hidden">
            {rates.map((r) => (
              <button
                key={r}
                onClick={() => onRateChange(r)}
                className={[
                  "px-2 py-1 transition-colors",
                  playbackRate === r
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {r}×
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onLoopToggle}
            aria-label="현재 가사 반복"
            title={loopLine ? "반복 끄기" : "현재 가사 반복"}
          >
            <Repeat
              className={[
                "size-4",
                loopLine ? "text-primary" : "text-muted-foreground",
              ].join(" ")}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onMuteToggle}
            aria-label={muted ? "음소거 해제" : "음소거"}
          >
            {muted ? (
              <VolumeX className="size-4" />
            ) : (
              <Volume2 className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Native media (audio/video) with imperative API ────────────────────────
function NativeMediaSurface({
  url,
  isVideo,
  onTime,
  onDuration,
  onPlayingChange,
  apiRef,
  playbackRate,
  muted,
}: {
  url: string;
  isVideo: boolean;
  onTime: (t: number) => void;
  onDuration: (d: number) => void;
  onPlayingChange: (p: boolean) => void;
  apiRef: React.MutableRefObject<PlayerAPI | null>;
  playbackRate: number;
  muted: boolean;
}) {
  const ref = useRef<HTMLMediaElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.playbackRate = playbackRate;
    el.muted = muted;
    // `timeupdate` only fires ~4×/sec, which makes the karaoke highlight land
    // up to 250ms late. Drive the clock off rAF while playing instead, and
    // keep the event as the fallback for seeks/pauses.
    const stopRaf = () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    const tick = () => {
      onTime(el.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    const onT = () => onTime(el.currentTime);
    const onD = () => onDuration(el.duration || 0);
    const onPlay = () => {
      onPlayingChange(true);
      stopRaf();
      rafRef.current = requestAnimationFrame(tick);
    };
    const onPause = () => {
      onPlayingChange(false);
      stopRaf();
      onTime(el.currentTime);
    };
    el.addEventListener("timeupdate", onT);
    el.addEventListener("seeked", onT);
    el.addEventListener("loadedmetadata", onD);
    el.addEventListener("durationchange", onD);
    el.addEventListener("play", onPlay);
    el.addEventListener("playing", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onPause);
    apiRef.current = {
      play: () => void el.play(),
      pause: () => el.pause(),
      toggle: () => (el.paused ? void el.play() : el.pause()),
      seek: (t: number) => {
        el.currentTime = t;
        void el.play();
      },
      setRate: (r: number) => {
        el.playbackRate = r;
      },
      setMuted: (m: boolean) => {
        el.muted = m;
      },
    };
    return () => {
      stopRaf();
      el.removeEventListener("timeupdate", onT);
      el.removeEventListener("seeked", onT);
      el.removeEventListener("loadedmetadata", onD);
      el.removeEventListener("durationchange", onD);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("playing", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onPause);
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Sync when props change afterward
  useEffect(() => {
    if (ref.current) ref.current.playbackRate = playbackRate;
  }, [playbackRate]);
  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);

  if (isVideo) {
    return (
      <div className="rounded-2xl overflow-hidden bg-black aspect-video shadow-[var(--shadow-soft)]">
        <video
          ref={ref as unknown as React.RefObject<HTMLVideoElement>}
          src={url}
          className="w-full h-full"
          playsInline
        />
      </div>
    );
  }
  return (
    <audio
      ref={ref as unknown as React.RefObject<HTMLAudioElement>}
      src={url}
      className="hidden"
    />
  );
}

function triggerCls(done: boolean): string {
  return [
    "rounded-full px-3.5 py-1.5 text-xs font-semibold gap-1 inline-flex items-center",
    "data-[state=inactive]:bg-white/60 data-[state=inactive]:hover:bg-white",
    "data-[state=active]:gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[var(--shadow-soft)]",
    done ? "ring-1 ring-emerald-400/60" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

// ─── Learning tabs ─────────────────────────────────────────────────────────
function SongLessonTabs({
  song,
  onSeek,
}: {
  song: SongRow;
  onSeek?: (t: number) => void;
}) {
  const vocab = Array.isArray(song.vocab) ? song.vocab : [];
  const notes = Array.isArray(song.grammar_notes) ? song.grammar_notes : [];
  const lyricLines = Array.isArray(song.lyrics) ? song.lyrics : [];
  const { data: profile } = useMyProfile();
  const isEditor = profile?.role === "teacher" || profile?.role === "admin";
  const hasTimes = lyricLines.some((l) => typeof l.time === "number");

  // Words the learner already has, so a card opens showing "담김" instead of
  // inviting a duplicate save. Signed-in users read their saved rows; guests
  // read the localStorage list. Clicks add to this set live.
  const { data: savedList } = useQuery({
    queryKey: ["vocab", profile?.id ?? "guest"],
    queryFn: () =>
      profile?.id
        ? listVocabulary()
        : Promise.resolve(loadGuestVocab()),
  });
  const [savedZh, setSavedZh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (savedList) setSavedZh(new Set(savedList.map((v) => v.zh)));
  }, [savedList]);
  const markSaved = useCallback(
    (zh: string) => setSavedZh((prev) => new Set(prev).add(zh)),
    [],
  );

  const {
    progress,
    markVocab,
    markGrammar,
    markCloze,
    markOrder,
    markRepeat,
    reset,
  } = useSongProgress(song.id);

  const empty =
    vocab.length === 0 && notes.length === 0 && lyricLines.length === 0;

  if (empty) {
    return (
      <div className="glass rounded-3xl p-6 text-center text-sm text-muted-foreground">
        <BookOpen className="size-6 mx-auto mb-2 opacity-60" />
        {isEditor
          ? "아직 강의 콘텐츠가 없어요. 상단의 '강의 콘텐츠 생성' 버튼을 눌러 만들어보세요."
          : "곧 핵심 단어와 문법 노트가 추가될 예정이에요 ✨"}
      </div>
    );
  }

  // Overall progress: count each completed activity block as one unit.
  const timedLines = lyricLines.filter((l) => typeof l.time === "number");
  const activities: { done: boolean; total: number; count: number }[] = [];
  if (vocab.length > 0)
    activities.push({
      done: progress.vocab.length >= vocab.length,
      total: vocab.length,
      count: progress.vocab.length,
    });
  if (notes.length > 0)
    activities.push({
      done: progress.grammar.length >= notes.length,
      total: notes.length,
      count: progress.grammar.length,
    });
  if (vocab.length > 0 && lyricLines.length > 0)
    activities.push({ done: progress.cloze, total: 1, count: progress.cloze ? 1 : 0 });
  if (lyricLines.length >= 3)
    activities.push({ done: progress.order, total: 1, count: progress.order ? 1 : 0 });
  if (hasTimes && onSeek)
    activities.push({
      done: progress.repeat.length >= timedLines.length,
      total: timedLines.length,
      count: progress.repeat.length,
    });
  const doneCount = activities.filter((a) => a.done).length;
  const totalCount = activities.length;
  const overallPct = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);
  const hasAny =
    progress.vocab.length > 0 ||
    progress.grammar.length > 0 ||
    progress.cloze ||
    progress.order ||
    progress.repeat.length > 0;

  const vocabDone = vocab.length > 0 && progress.vocab.length >= vocab.length;
  const grammarDone = notes.length > 0 && progress.grammar.length >= notes.length;
  const repeatDone = timedLines.length > 0 && progress.repeat.length >= timedLines.length;

  return (
    <div className="glass rounded-3xl p-4 sm:p-5 animate-fade-in space-y-3">
      {totalCount > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span>학습 진행률</span>
              <span className="font-semibold text-primary">
                {doneCount}/{totalCount} · {overallPct}%
              </span>
            </div>
            <Progress value={overallPct} className="h-1.5" />
          </div>
          {hasAny && (
            <Button size="sm" variant="ghost" onClick={reset} className="text-[11px]">
              초기화
            </Button>
          )}
        </div>
      )}
      <Tabs defaultValue="vocab" className="w-full">
        <TabsList className="w-full flex flex-wrap gap-1.5 h-auto bg-transparent p-0 justify-start">
          <TabsTrigger value="vocab" className={triggerCls(vocabDone)}>
            <span className="text-base leading-none">📖</span> 단어
            <span className="ml-1 text-[10px] font-mono opacity-75">{progress.vocab.length}/{vocab.length}</span>
            {vocabDone && <span className="ml-0.5">✅</span>}
          </TabsTrigger>
          <TabsTrigger value="grammar" className={triggerCls(grammarDone)}>
            <span className="text-base leading-none">✍️</span> 문법
            <span className="ml-1 text-[10px] font-mono opacity-75">{progress.grammar.length}/{notes.length}</span>
            {grammarDone && <span className="ml-0.5">✅</span>}
          </TabsTrigger>
          {vocab.length > 0 && lyricLines.length > 0 && (
            <TabsTrigger value="cloze" className={triggerCls(progress.cloze)}>
              <span className="text-base leading-none">🎯</span> 빈칸
              {progress.cloze && <span className="ml-0.5">✅</span>}
            </TabsTrigger>
          )}
          {lyricLines.length >= 3 && (
            <TabsTrigger value="order" className={triggerCls(progress.order)}>
              <span className="text-base leading-none">🎼</span> 순서
              {progress.order && <span className="ml-0.5">✅</span>}
            </TabsTrigger>
          )}
          {hasTimes && onSeek && (
            <TabsTrigger value="repeat" className={triggerCls(repeatDone)}>
              <span className="text-base leading-none">🎤</span> 따라 부르기
              <span className="ml-1 text-[10px] font-mono opacity-75">{progress.repeat.length}/{timedLines.length}</span>
              {repeatDone && <span className="ml-0.5">✅</span>}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="vocab" className="pt-4">
          {vocab.length === 0 ? (
            <EmptyMsg text="핵심 단어가 아직 없어요." />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {vocab.map((v, i) => (
                <VocabCard
                  key={`${v.zh}-${i}`}
                  item={v}
                  learned={progress.vocab.includes(v.zh)}
                  onLearned={() => markVocab(v.zh)}
                  paletteIdx={i % 3}
                  alreadySaved={savedZh.has(v.zh)}
                  onSaved={markSaved}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="grammar" className="pt-4">
          {notes.length === 0 ? (
            <EmptyMsg text="문법 노트가 아직 없어요." />
          ) : (
            <ul className="space-y-3">
              {notes.map((n, i) => (
                <GrammarNoteRow
                  key={`${n.title}-${i}`}
                  note={n}
                  studied={progress.grammar.includes(n.title)}
                  onStudied={() => markGrammar(n.title)}
                  paletteIdx={i % 3}
                />
              ))}
            </ul>
          )}
        </TabsContent>

        {vocab.length > 0 && lyricLines.length > 0 && (
          <TabsContent value="cloze" className="pt-4">
            <ClozeActivity
              lyrics={lyricLines}
              vocab={vocab}
              completed={progress.cloze}
              onComplete={markCloze}
            />
          </TabsContent>
        )}

        {lyricLines.length >= 3 && (
          <TabsContent value="order" className="pt-4">
            <LineOrderActivity
              lyrics={lyricLines}
              completed={progress.order}
              onComplete={markOrder}
            />
          </TabsContent>
        )}

        {hasTimes && onSeek && (
          <TabsContent value="repeat" className="pt-4">
            <RepeatAfterMe
              lyrics={lyricLines}
              onSeek={onSeek}
              playedKeys={progress.repeat}
              onPlayed={markRepeat}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}


function EmptyMsg({ text }: { text: string }) {
  return (
    <div className="text-center text-sm text-muted-foreground py-8">
      {text}
    </div>
  );
}

// ─── Cloze (빈칸 채우기) ────────────────────────────────────────────────
function ClozeActivity({
  lyrics,
  vocab,
  completed,
  onComplete,
}: {
  lyrics: LyricLine[];
  vocab: VocabItem[];
  completed: boolean;
  onComplete: () => void;
}) {
  const items = useMemo(() => {
    const words = vocab.map((v) => v.zh).filter(Boolean);
    return lyrics
      .map((l, idx) => {
        const found = words.find((w) => l.zh.includes(w));
        if (!found) return null;
        return { idx, line: l.zh, answer: found };
      })
      .filter((x): x is { idx: number; line: string; answer: string } => !!x)
      .slice(0, 6);
  }, [lyrics, vocab]);

  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState(false);

  if (items.length === 0)
    return <EmptyMsg text="가사에서 빈칸을 만들 단어를 찾지 못했어요." />;

  const correct = items.filter(
    (it) => (answers[it.idx] ?? "").trim() === it.answer,
  ).length;
  const pct = Math.round((correct / items.length) * 100);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Sparkles className="size-4 text-primary" />
        <h3 className="font-bold">가사 속 핵심 단어 맞추기</h3>
        <span className="text-[11px] text-muted-foreground">
          {items.length}문항
        </span>
        {revealed && (
          <span className="ml-auto text-xs font-semibold text-primary">
            {correct}/{items.length} · {pct}%
          </span>
        )}
      </div>
      {revealed && <Progress value={pct} className="h-1.5" />}
      <ol className="space-y-2 text-sm">
        {items.map((it) => {
          const parts = it.line.split(it.answer);
          const user = (answers[it.idx] ?? "").trim();
          const ok = user === it.answer;
          return (
            <li key={it.idx} className="glass-soft rounded-2xl p-3">
              <div className="flex flex-wrap items-center gap-1">
                <span>{parts[0]}</span>
                <input
                  value={answers[it.idx] ?? ""}
                  onChange={(e) =>
                    setAnswers((prev) => ({
                      ...prev,
                      [it.idx]: e.target.value,
                    }))
                  }
                  className={[
                    "inline-block min-w-16 border-b-2 bg-transparent px-1 text-center font-semibold outline-none transition-colors",
                    revealed
                      ? ok
                        ? "border-emerald-500 text-emerald-700"
                        : "border-destructive text-destructive"
                      : "border-primary/40 focus:border-primary",
                  ].join(" ")}
                  placeholder="?"
                />
                <span>{parts.slice(1).join(it.answer)}</span>
                {revealed && (
                  <span
                    className={[
                      "ml-1 text-lg",
                      ok ? "animate-fade-in" : "opacity-70",
                    ].join(" ")}
                  >
                    {ok ? "✅" : "❌"}
                  </span>
                )}
              </div>
              {revealed && !ok && (
                <div className="text-[11px] text-muted-foreground mt-1">
                  정답:{" "}
                  <span className="font-semibold text-emerald-600">
                    {it.answer}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex items-center justify-end gap-2">
        {revealed && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setRevealed(false);
              setAnswers({});
            }}
          >
            다시 하기
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => {
            setRevealed(true);
            onComplete();
          }}
        >
          정답 확인 {completed && "✅"}
        </Button>
      </div>
    </div>
  );
}

// ─── 가사 순서 맞추기 (client-only randomization to avoid hydration mismatch) ─
function LineOrderActivity({
  lyrics,
  completed,
  onComplete,
}: {
  lyrics: LyricLine[];
  completed: boolean;
  onComplete: () => void;
}) {
  const base = useMemo(
    () => lyrics.slice(0, Math.min(6, lyrics.length)),
    [lyrics],
  );
  const [order, setOrder] = useState<number[]>(() => [...base.keys()]);
  const [revealed, setRevealed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setOrder([...base.keys()].sort(() => Math.random() - 0.5));
  }, [base]);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setOrder(next);
  };

  const correct = order.every((val, idx) => val === idx);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Music className="size-4 text-primary" />
        <h3 className="font-bold">가사 순서 맞추기</h3>
        <span className="text-[11px] text-muted-foreground">
          위/아래 버튼으로 원래 순서로 정렬
        </span>
      </div>
      {!mounted ? (
        <div className="text-xs text-muted-foreground py-4 text-center">
          문제 준비 중…
        </div>
      ) : (
        <ol className="space-y-2 text-sm">
          {order.map((originalIdx, pos) => {
            const line = base[originalIdx];
            const isRight = revealed && originalIdx === pos;
            const isWrong = revealed && originalIdx !== pos;
            return (
              <li
                key={originalIdx}
                className={[
                  "glass-soft rounded-2xl p-3 flex items-center gap-2",
                  isRight && "ring-2 ring-emerald-400",
                  isWrong && "ring-2 ring-destructive/50",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    className="text-[10px] px-1.5 rounded bg-white/60 hover:bg-white"
                    onClick={() => move(pos, pos - 1)}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="text-[10px] px-1.5 rounded bg-white/60 hover:bg-white"
                    onClick={() => move(pos, pos + 1)}
                  >
                    ▼
                  </button>
                </div>
                <div className="flex-1">
                  <div className="font-medium">{line.zh}</div>
                  {line.pinyin && (
                    <div className="text-[11px] font-mono text-primary/70">
                      {line.pinyin}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {revealed ? (correct ? "🎉 완벽!" : "다시 시도해보세요") : ""}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setOrder([...base.keys()].sort(() => Math.random() - 0.5));
              setRevealed(false);
            }}
          >
            섞기
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setRevealed(true);
              if (correct) onComplete();
            }}
          >
            확인 {completed && "✅"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Repeat After Me: play one line at a time ─────────────────────────────
function RepeatAfterMe({
  lyrics,
  onSeek,
  playedKeys,
  onPlayed,
}: {
  lyrics: LyricLine[];
  onSeek: (t: number) => void;
  playedKeys: string[];
  onPlayed: (zh: string) => void;
}) {
  const timed = useMemo(
    () => lyrics.filter((l) => typeof l.time === "number"),
    [lyrics],
  );
  const [i, setI] = useState(0);
  if (timed.length === 0)
    return <EmptyMsg text="타임코드가 있는 가사가 필요해요." />;
  const cur = timed[i];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h3 className="font-bold">따라 부르기</h3>
        <span className="text-[11px] text-muted-foreground">
          한 줄씩 재생하며 따라 해보세요
        </span>
      </div>
      <div className="glass-soft rounded-2xl p-5 text-center space-y-1">
        <div className="text-[11px] text-muted-foreground flex items-center justify-center gap-1">
          <span>{i + 1} / {timed.length}</span>
          {playedKeys.includes(cur.zh) && (
            <span className="text-emerald-600">· 재생함 ✅</span>
          )}
        </div>
        <div className="text-2xl font-bold">{cur.zh}</div>
        {cur.pinyin && (
          <div className="text-sm font-mono text-primary/80">{cur.pinyin}</div>
        )}
        {cur.ko && (
          <div className="text-xs text-muted-foreground">{cur.ko}</div>
        )}
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setI((n) => Math.max(0, n - 1))}
          disabled={i === 0}
        >
          이전
        </Button>
        <Button
          size="sm"
          onClick={() => {
            if (typeof cur.time === "number") onSeek(cur.time);
            onPlayed(cur.zh);
          }}
        >
          <Play className="size-4 mr-1" /> 이 줄 재생
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setI((n) => Math.min(timed.length - 1, n + 1))}
          disabled={i === timed.length - 1}
        >
          다음
        </Button>
      </div>
    </div>
  );
}

function speakZh(text: string) {
  if (typeof window === "undefined" || !text) return;
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "zh-CN";
    utter.rate = 0.9;
    synth.speak(utter);
  } catch {
    // ignore
  }
}

function VocabCard({
  item,
  learned,
  onLearned,
  paletteIdx,
  alreadySaved,
  onSaved,
}: {
  item: VocabItem;
  learned: boolean;
  onLearned: () => void;
  paletteIdx: number;
  alreadySaved: boolean;
  onSaved: (zh: string) => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const pastel = `song-pastel-${paletteIdx}`;
  const { data: profile } = useMyProfile();
  const qc = useQueryClient();
  const emoji = guessEmoji(item.zh, item.ko);

  // Same save path the drama/video vocab cards use: a signed-in learner gets a
  // real row (source "song"), a guest gets a localStorage entry.
  const save = useMutation({
    mutationFn: async () => {
      if (profile?.id) {
        await saveVocabulary({
          data: {
            zh: item.zh,
            pinyin: item.pinyin ?? null,
            ko: item.ko ?? null,
            emoji,
            source: "song",
          },
        });
      } else {
        addGuestVocab({
          zh: item.zh,
          pinyin: item.pinyin,
          ko: item.ko,
          emoji,
          source: "song",
        });
      }
    },
    onSuccess: () => {
      onSaved(item.zh);
      toast.success("단어장에 담았어요 📒");
      qc.invalidateQueries({ queryKey: ["vocab"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "저장 실패"),
  });

  const saved = alreadySaved || save.isSuccess;

  return (
    <div
      className={[
        "song-flip min-h-[140px] relative",
        flipped ? "is-flipped" : "",
      ].join(" ")}
      style={{ perspective: 900 }}
    >
      {/* Save-to-vocab overlay. Kept outside the flip <button> — a button
          nested in a button is invalid and swallows the click. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!saved && !save.isPending) save.mutate();
        }}
        disabled={saved || save.isPending}
        aria-label={saved ? "단어장에 담김" : "단어장에 담기"}
        title={saved ? "이미 단어장에 있어요" : "단어장에 담기"}
        className={[
          "absolute bottom-2 right-2 z-20 size-7 rounded-full grid place-items-center shadow transition-colors",
          saved
            ? "bg-emerald-500 text-white cursor-default"
            : "bg-white/85 text-primary hover:bg-white",
        ].join(" ")}
      >
        {save.isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : saved ? (
          <Check className="size-3.5" />
        ) : (
          <BookmarkPlus className="size-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={() => {
          setFlipped((v) => {
            const next = !v;
            if (next) onLearned();
            return next;
          });
          speakZh(item.zh);
        }}
        className={[
          "song-flip-inner w-full h-full rounded-2xl text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary block",
          learned ? "ring-2 ring-emerald-400/70" : "",
        ].join(" ")}
        aria-label={`${item.zh} 카드`}
      >
        {/* FRONT */}
        <div
          className={[
            "song-flip-face rounded-2xl p-3 overflow-hidden shadow-[var(--shadow-soft)]",
            pastel,
          ].join(" ")}
        >
          {/* Watermark */}
          <div
            aria-hidden
            className="absolute -bottom-4 -right-2 text-[80px] font-black leading-none opacity-[0.08] select-none pointer-events-none"
          >
            {item.zh?.[0] ?? ""}
          </div>
          {learned && (
            <span className="absolute top-2 right-2 text-[10px] bg-emerald-500 text-white rounded-full size-5 flex items-center justify-center leading-none shadow z-10">
              ✓
            </span>
          )}
          <div className="relative space-y-1">
            <div className="text-2xl font-bold leading-tight break-words">
              {item.zh}
            </div>
            {item.pinyin && (
              <div className="text-xs font-mono text-primary/80">
                {item.pinyin}
              </div>
            )}
            <div className="text-[10px] text-foreground/60 mt-1 flex items-center gap-1">
              <Volume2 className="size-3" /> 눌러서 뜻 보기
            </div>
          </div>
        </div>
        {/* BACK */}
        <div
          className={[
            "song-flip-face song-flip-face-back rounded-2xl p-3 overflow-hidden shadow-[var(--shadow-soft)]",
            pastel,
          ].join(" ")}
        >
          <div className="space-y-1">
            {item.ko && (
              <div className="text-base font-semibold text-foreground">
                {item.ko}
              </div>
            )}
            {item.example && (
              <div className="text-[11px] text-foreground/75 line-clamp-4 leading-relaxed">
                {item.example}
              </div>
            )}
            <div className="text-[10px] text-foreground/60 mt-1">
              다시 눌러 뒤집기
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}

function GrammarNoteRow({
  note,
  studied,
  onStudied,
  paletteIdx,
}: {
  note: GrammarNote;
  studied: boolean;
  onStudied: () => void;
  paletteIdx: number;
}) {
  return (
    <li
      className={[
        "rounded-2xl overflow-hidden bg-white/70 backdrop-blur shadow-[var(--shadow-soft)] transition-all hover:-translate-y-0.5",
        studied ? "ring-2 ring-emerald-400/70" : "ring-1 ring-white/40",
      ].join(" ")}
    >
      <div className="flex">
        {/* Left color stripe */}
        <div className={`w-1.5 shrink-0 song-stripe-${paletteIdx}`} />
        <div className="flex-1 p-3.5 relative">
          <div className="flex items-start justify-between gap-2">
            <div className="font-bold text-sm text-foreground">{note.title}</div>
            <button
              type="button"
              onClick={onStudied}
              aria-label={studied ? "학습 완료" : "학습 완료로 표시"}
              className={[
                "shrink-0 size-6 rounded-full grid place-items-center text-xs transition-all",
                studied
                  ? "bg-emerald-500 text-white shadow"
                  : "bg-white/70 text-muted-foreground hover:bg-emerald-100 hover:text-emerald-700",
              ].join(" ")}
            >
              {studied ? "✓" : "○"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              speakZh(note.zh_example);
              onStudied();
            }}
            className="mt-2 inline-flex items-center gap-1.5 text-lg font-semibold cursor-pointer hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
            aria-label="예문 발음 듣기"
          >
            {note.zh_example}
            <Volume2 className="size-3.5 opacity-60" />
          </button>
          {note.pinyin && (
            <div className="text-xs font-mono text-primary/80 mt-0.5">
              {note.pinyin}
            </div>
          )}
          {note.ko && (
            <div className="text-sm text-foreground/85 mt-1">{note.ko}</div>
          )}
          {note.explanation && (
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed border-l-2 border-primary/20 pl-2">
              {note.explanation}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}



function MakeLessonContentButton({ song }: { song: SongRow }) {
  const { data: profile } = useMyProfile();
  const qc = useQueryClient();
  const isEditor = profile?.role === "teacher" || profile?.role === "admin";
  const mutation = useMutation({
    mutationFn: () => generateSongLessonContent({ data: { songId: song.id } }),
    onSuccess: () => {
      toast.success("강의 콘텐츠를 생성했어요 📚");
      qc.invalidateQueries({ queryKey: ["song", song.id] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "강의 콘텐츠 생성 실패"),
  });

  if (!isEditor) return null;
  const hasContent =
    (song.vocab?.length ?? 0) > 0 || (song.grammar_notes?.length ?? 0) > 0;
  return (
    <Button
      size="sm"
      variant={hasContent ? "outline" : "default"}
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
    >
      <BookOpen className="size-4 mr-1" />
      {mutation.isPending
        ? "생성 중…"
        : hasContent
          ? "강의 콘텐츠 재생성"
          : "강의 콘텐츠 생성"}
    </Button>
  );
}

// Editor-only: regenerate pinyin + Korean translation for every lyric line.
function ReannotateButton({ song }: { song: SongRow }) {
  const { data: profile } = useMyProfile();
  const qc = useQueryClient();
  const isEditor = profile?.role === "teacher" || profile?.role === "admin";
  const mutation = useMutation({
    mutationFn: () => reannotateSong({ data: { songId: song.id } }),
    onSuccess: () => {
      toast.success("병음/번역을 다시 만들었어요 🈶");
      qc.invalidateQueries({ queryKey: ["song", song.id] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "병음/번역 재생성 실패"),
  });

  if (!isEditor) return null;
  if (!song.lyrics || song.lyrics.length === 0) return null;
  const hasAnn = song.lyrics.some((l) => (l.pinyin ?? "").trim() || (l.ko ?? "").trim());
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
    >
      🈶 {mutation.isPending ? "생성 중…" : hasAnn ? "병음/번역 다시 만들기" : "병음/번역 만들기"}
    </Button>
  );
}


// Editor-only: set the genre / theme a song is filtered under. AI songs infer
// both from their style preset and lyric keyword, but curated songs have
// neither to go on.
function TaxonomyEditor({ song }: { song: SongRow }) {
  const { data: profile } = useMyProfile();
  const qc = useQueryClient();
  const isEditor = profile?.role === "teacher" || profile?.role === "admin";
  const mutation = useMutation({
    mutationFn: (patch: { genre?: SongGenre | null; theme?: SongTheme | null }) =>
      setSongTaxonomy({ data: { songId: song.id, ...patch } }),
    onSuccess: () => {
      toast.success("분류를 저장했어요 🎼");
      qc.invalidateQueries({ queryKey: ["song", song.id] });
      qc.invalidateQueries({ queryKey: ["songs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "분류 저장 실패"),
  });

  if (!isEditor) return null;
  return (
    <>
      <Select
        value={song.genre ?? "_"}
        onValueChange={(v) =>
          mutation.mutate({ genre: v === "_" ? null : (v as SongGenre) })
        }
        disabled={mutation.isPending}
      >
        <SelectTrigger
          className="h-8 w-40 text-xs"
          title="목록에서 이 곡이 묶일 장르예요."
        >
          <SelectValue placeholder="장르 지정" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_">장르 없음</SelectItem>
          {SONG_GENRES.map((g) => (
            <SelectItem key={g.value} value={g.value}>
              {g.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={song.theme ?? "_"}
        onValueChange={(v) =>
          mutation.mutate({ theme: v === "_" ? null : (v as SongTheme) })
        }
        disabled={mutation.isPending}
      >
        <SelectTrigger
          className="h-8 w-40 text-xs"
          title="목록에서 이 곡이 묶일 주제예요."
        >
          <SelectValue placeholder="주제 지정" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_">주제 없음</SelectItem>
          {SONG_THEMES.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

// Editor-only: re-pull Suno's word alignment when the highlight is off-beat.
function ResyncLyricsButton({ song }: { song: SongRow }) {
  const { data: profile } = useMyProfile();
  const qc = useQueryClient();
  const isEditor = profile?.role === "teacher" || profile?.role === "admin";
  const mutation = useMutation({
    mutationFn: () => resyncSongLyrics({ data: { songId: song.id } }),
    onSuccess: () => {
      toast.success("가사 싱크를 다시 맞췄어요 🎯");
      qc.invalidateQueries({ queryKey: ["song", song.id] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "싱크 재조정 실패"),
  });

  if (!isEditor) return null;
  if (!song.suno_audio_id || !song.suno_audio_task_id) return null;
  if (!song.lyrics || song.lyrics.length === 0) return null;
  const synced = song.lyrics.some((l) => typeof l.time === "number");
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      title="Suno의 단어별 정렬 정보를 다시 받아 가사 타이밍을 보정해요."
    >
      🎯 {mutation.isPending ? "맞추는 중…" : synced ? "싱크 다시 맞추기" : "싱크 맞추기"}
    </Button>
  );
}

// Editor-only: retry MP4 when auto-kickoff failed.
function RetryMp4Button({ song }: { song: SongRow }) {
  const { data: profile } = useMyProfile();
  const qc = useQueryClient();
  const isEditor = profile?.role === "teacher" || profile?.role === "admin";
  const mutation = useMutation({
    mutationFn: () => generateSongMp4({ data: { songId: song.id } }),
    onSuccess: () => {
      toast.success("MP4 영상 생성을 다시 시작했어요 🎬");
      qc.invalidateQueries({ queryKey: ["song", song.id] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "영상 재생성 실패"),
  });

  if (!isEditor) return null;
  if (!song.suno_audio_id) return null;
  if (song.video_url) return null;
  if (song.status !== "failed_video") return null;
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
    >
      <Sparkles className="size-4 mr-1" />
      {mutation.isPending ? "요청 중…" : "MP4 다시 만들기"}
    </Button>
  );
}

function LyricRow({
  index,
  line,
  active,
  justClicked = false,
  showPinyin,
  showKo,
  seekTime,
  onSeek,
}: {
  index: number;
  line: LyricLine;
  active: boolean;
  justClicked?: boolean;
  showPinyin?: boolean;
  showKo?: boolean;
  seekTime: number | null;
  onSeek: (t: number) => void;
}) {
  const clickable = typeof seekTime === "number";
  const isHeader = isSectionHeader(line.zh);
  const pulseClass = justClicked ? "animate-song-click-pulse" : "";

  if (isHeader) {
    return (
      <button
        data-line={index}
        onClick={() => clickable && onSeek(seekTime!)}
        disabled={!clickable}
        className={[
          "w-full text-left rounded-xl px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors",
          "text-primary/70 hover:text-primary hover:bg-primary/5",
          clickable ? "cursor-pointer" : "cursor-default",
          pulseClass,
        ].join(" ")}
      >
        — {line.zh.replace(/^\s*\[|\]\s*$/g, "")} —
      </button>
    );
  }

  return (
    <button
      data-line={index}
      onClick={() => clickable && onSeek(seekTime!)}
      disabled={!clickable}
      className={[
        "w-full text-left rounded-2xl px-3 py-2 transition-all duration-300 ease-out",
        active
          ? "gradient-primary text-primary-foreground shadow-[var(--shadow-soft)] scale-[1.02]"
          : "hover:bg-white/60 hover:scale-[1.01] hover:shadow-sm text-foreground/80",
        clickable ? "cursor-pointer" : "cursor-default",
        pulseClass,
      ].join(" ")}
    >

      <div
        className={[
          "font-semibold leading-snug",
          active ? "text-lg" : "text-base",
        ].join(" ")}
      >
        {line.zh}
      </div>
      {showPinyin && line.pinyin && (
        <div
          className={[
            "text-xs font-mono leading-tight mt-0.5",
            active ? "opacity-95" : "text-primary/70",
          ].join(" ")}
        >
          {line.pinyin}
        </div>
      )}
      {showKo && line.ko && (
        <div
          className={[
            "text-xs mt-0.5",
            active ? "opacity-90" : "text-muted-foreground",
          ].join(" ")}
        >
          {line.ko}
        </div>
      )}
    </button>
  );
}


// ─── Suno status panel (client-only elapsed to avoid hydration mismatch) ──
function SunoStatusPanel({
  song,
  pollError,
  retryAt,
}: {
  song: SongRow;
  pollError: string | null;
  retryAt: number | null;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const isVideo = song.status === "generating_video";
  const totalSec = isVideo ? EST_VIDEO_SEC : EST_AUDIO_SEC;
  const start = new Date(song.created_at).getTime();
  const elapsed =
    now === null ? 0 : Math.max(0, Math.round((now - start) / 1000));
  const pct =
    elapsed < totalSec
      ? (elapsed / totalSec) * 95
      : Math.min(99.9, 95 + (elapsed - totalSec) / 60);
  const remaining = Math.max(0, totalSec - elapsed);
  const rateLimited = isRateLimitedMessage(pollError);
  const retryIn =
    retryAt && now !== null
      ? Math.max(0, Math.ceil((retryAt - now) / 1000))
      : 0;

  return (
    <div className="glass rounded-3xl p-4 border border-primary/30 bg-primary/5 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Loader2 className="size-4 animate-spin" />
        {isVideo
          ? "🎬 Suno가 MP4 영상을 만들고 있어요"
          : "🎙️ Suno가 음원을 만들고 있어요"}
        {now !== null && (
          <span className="ml-auto text-[11px] font-normal text-muted-foreground">
            경과 {fmtSecKor(elapsed)}
            {!rateLimited && remaining > 0 && ` · 남음 ~${fmtSecKor(remaining)}`}
          </span>
        )}
      </div>
      <Progress value={Math.min(99.9, pct)} className="h-1.5" />
      {rateLimited ? (
        <div className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-100/70 rounded-2xl px-3 py-2">
          <Loader2 className="size-3.5 animate-spin" />
          <span>
            Suno 요청 한도 초과 —{" "}
            {retryIn > 0 ? `${retryIn}초 후 자동 재시도` : "재시도 중…"}
          </span>
        </div>
      ) : pollError ? (
        <div className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
          <span>{pollError}</span>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {isVideo
            ? "MP4가 완료되면 자동으로 재생 화면에 나타나요."
            : "음원이 완료되면 자동으로 MP4 영상 생성이 이어져요."}
        </p>
      )}
    </div>
  );
}
