import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CalendarClock,
  Loader2,
  Music,
  Pencil,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";

import { Progress } from "@/components/ui/progress";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useMyProfile } from "@/lib/auth-client";
import {
  GENRE_LABEL,
  SONG_GENRES,
  SONG_THEMES,
  STYLE_PRESETS,
  THEME_LABEL,
  type SongGenre,
  type SongTheme,
} from "@/lib/song-taxonomy";
import {
  createSongSchedule,
  deleteSongSchedule,
  listSongSchedules,
  runSongScheduleNow,
  toggleSongSchedule,
  updateSongSchedule,
} from "@/lib/song-schedules.functions";
import {
  cancelSongGeneration,
  createCuratedSong,
  createSong,
  deleteSong,
  draftSongFromKeyword,
  generateSongWithSuno,
  listSongs,
  pollSongGeneration,
  pollSongMp4,
  retrySongGeneration,
  type LyricLine,
  type SongRow,
} from "@/lib/songs.functions";
import { LEVEL_LABEL, LEVEL_LABEL_HSK, LEVEL_OPTIONS, LEVEL_ORDER, levelLabel } from "@/lib/levels";

const songsSearchSchema = z.object({
  level: fallback(z.enum(["all", "beginner", "intermediate", "advanced"]), "all").default("all"),
  // 장르·주제는 SONG_GENRES / SONG_THEMES 값 중 하나. 목록이 늘어도 스키마를
  // 따라 고칠 일이 없도록 문자열로 둔다.
  genre: fallback(z.string(), "all").default("all"),
  theme: fallback(z.string(), "all").default("all"),
  source: fallback(z.enum(["all", "suno", "curated"]), "all").default("all"),
  q: fallback(z.string(), "").default(""),
});

type SearchParams = z.infer<typeof songsSearchSchema>;

export const Route = createFileRoute("/_app/songs/")({
  head: () => ({
    meta: [
      { title: "학습송 — DingDong" },
      {
        name: "description",
        content: "노래로 배우는 중국어. 가사 싱크 플레이어로 자연스럽게 익혀보세요.",
      },
    ],
  }),
  validateSearch: zodValidator(songsSearchSchema),
  component: SongsPage,
  errorComponent: ({ error }) => (
    <div className="glass rounded-3xl p-4 sm:p-6 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div>없습니다.</div>,
});

const LEVEL_FILTER_LABEL: Record<string, string> = { all: "전체", ...LEVEL_LABEL };

const STATUS_LABEL: Record<string, string> = {
  generating_audio: "🎙️ 음원 생성 중…",
  generating_video: "🎬 영상 생성 중…",
  failed_audio: "⚠️ 음원 생성 실패",
  failed_video: "⚠️ 영상 생성 실패",
};

// Suno audio 생성은 보통 60~180초 소요. 진행률은 경과시간 기반 추정.
const PAGE_SIZE = 24;
const EST_AUDIO_SEC = 150;
const EST_VIDEO_SEC = 120;
const POLL_INTERVAL_MS = 8000;

function estimateProgress(startIso: string, totalSec: number) {
  const start = new Date(startIso).getTime();
  const elapsed = Math.max(0, (Date.now() - start) / 1000);
  // asymptotic: 0..95% over totalSec, then crawl
  const pct =
    elapsed < totalSec ? (elapsed / totalSec) * 95 : 95 + Math.min(4.9, (elapsed - totalSec) / 60);
  const remaining = Math.max(0, Math.round(totalSec - elapsed));
  return { pct: Math.min(99.9, pct), elapsed: Math.round(elapsed), remaining };
}

function formatElapsed(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

// 서버가 반환하는 429/한도 관련 메시지를 감지.
export function isRateLimitedMessage(msg: string | undefined | null): boolean {
  if (!msg) return false;
  return /429|한도\s*초과|rate.?limit|too many/i.test(msg);
}

function SongsPage() {
  const { data: profile } = useMyProfile();
  const isEditor = profile?.role === "teacher" || profile?.role === "admin";
  const { data: songs, isLoading } = useQuery({
    queryKey: ["songs"],
    queryFn: () => listSongs(),
    // While any song is generating, refetch periodically.
    refetchInterval: (q) => {
      const list = q.state.data as SongRow[] | undefined;
      const pending = list?.some(
        (s) => s.status === "generating_audio" || s.status === "generating_video",
      );
      return pending ? 6000 : false;
    },
  });
  const [creating, setCreating] = useState<null | "manual" | "ai" | "curated" | "schedule">(null);
  // Editors get a "작업 현황" tab like the video studio; students only ever see
  // the library, so the tab bar and job panels stay hidden for them.
  const [tab, setTab] = useState<"library" | "jobs">("library");

  const search = Route.useSearch();
  // 라우트 id는 "/songs/" — "/songs"로 적으면 검색 파라미터 타입이 never로
  // 무너져서 search updater가 전부 타입 오류가 난다.
  const navigate = useNavigate({ from: "/songs/" });

  // Drive Suno polling for any song still generating audio.
  // Polling calls an editor-only server fn; skip for students/guests to avoid
  // showing them permission errors for an action they never took.
  const { errors: pollErrors, nextRetryAt } = useSunoPollingForList(isEditor ? (songs ?? []) : []);
  // tick every second so the elapsed-time progress UI animates
  const [, setTick] = useState(0);
  useEffect(() => {
    const pending = (songs ?? []).some(
      (s) => s.status === "generating_audio" || s.status === "generating_video",
    );
    if (!pending) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [songs]);

  const generatingSongs = (songs ?? []).filter(
    (s) => s.status === "generating_audio" || s.status === "generating_video",
  );
  const failedSongs = (songs ?? []).filter(
    (s) => s.status === "failed_audio" || s.status === "failed_video",
  );
  const activeCount = generatingSongs.length + failedSongs.length;

  // 선택지는 고정 목록이 아니라 실제 등록된 곡에서 뽑는다 — 아직 한 곡도 없는
  // 장르/주제를 고를 수 있게 두면 늘 빈 목록만 나온다. 순서는 SONG_GENRES /
  // SONG_THEMES를 따른다 (가나다순이면 K-POP과 동요가 뒤섞인다).
  const genreOptions = useMemo(() => {
    const present = new Set((songs ?? []).map((s) => s.genre).filter(Boolean));
    return SONG_GENRES.filter((g) => present.has(g.value));
  }, [songs]);
  const themeOptions = useMemo(() => {
    const present = new Set((songs ?? []).map((s) => s.theme).filter(Boolean));
    return SONG_THEMES.filter((t) => present.has(t.value));
  }, [songs]);
  // 실제 노래가 한 곡도 없으면 종류 필터는 보여줄 이유가 없다.
  const hasBothSources = useMemo(() => {
    const kinds = new Set((songs ?? []).map((s) => s.source));
    return kinds.size > 1;
  }, [songs]);

  const filteredSongs =
    songs?.filter((s) => {
      const levelMatch = search.level === "all" || s.level === search.level;
      const genreMatch = search.genre === "all" || s.genre === search.genre;
      const themeMatch = search.theme === "all" || s.theme === search.theme;
      const sourceMatch = search.source === "all" || s.source === search.source;
      const q = search.q.trim().toLowerCase();
      const searchMatch =
        !q ||
        s.title.toLowerCase().includes(q) ||
        (s.title_zh && s.title_zh.toLowerCase().includes(q));
      return levelMatch && genreMatch && themeMatch && sourceMatch && searchMatch;
    }) ?? [];

  const filtering =
    search.level !== "all" ||
    search.genre !== "all" ||
    search.theme !== "all" ||
    search.source !== "all" ||
    !!search.q.trim();

  // Paged like the video library — filters narrow the same list, so any change
  // to them starts over rather than leaving the reader deep in a shorter list.
  const [shown, setShown] = useState(PAGE_SIZE);
  useEffect(() => {
    setShown(PAGE_SIZE);
  }, [search.level, search.genre, search.theme, search.source, search.q]);
  const pagedSongs = filteredSongs.slice(0, shown);
  const remaining = filteredSongs.length - pagedSongs.length;
  const resetFilters = () =>
    navigate({
      search: () => ({
        level: "all" as const,
        genre: "all",
        theme: "all",
        source: "all" as const,
        q: "",
      }),
    });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Music className="size-7 text-primary" /> 학습송
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            노래 가사를 따라 부르며 자연스럽게 중국어를 익혀보세요 🎵
          </p>
        </div>
        {isEditor && (
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={creating === "ai" ? "secondary" : "default"}
              onClick={() => setCreating((v) => (v === "ai" ? null : "ai"))}
              className="gap-1"
            >
              <Sparkles className="size-4" />
              {creating === "ai" ? "닫기" : "AI로 만들기"}
            </Button>
            <Button
              variant={creating === "curated" ? "secondary" : "outline"}
              onClick={() => setCreating((v) => (v === "curated" ? null : "curated"))}
              className="gap-1"
            >
              🎧
              {creating === "curated" ? "닫기" : "실제 노래 등록"}
            </Button>
            <Button
              variant={creating === "manual" ? "secondary" : "outline"}
              onClick={() => setCreating((v) => (v === "manual" ? null : "manual"))}
              className="gap-1"
            >
              <Plus className="size-4" />
              {creating === "manual" ? "닫기" : "수동 추가"}
            </Button>
            <Button
              variant={creating === "schedule" ? "secondary" : "outline"}
              onClick={() => setCreating((v) => (v === "schedule" ? null : "schedule"))}
              className="gap-1"
            >
              <CalendarClock className="size-4" />
              {creating === "schedule" ? "닫기" : "예약·반복"}
            </Button>
          </div>
        )}
      </div>

      {isEditor && (
        <div className="flex gap-1 glass-soft rounded-full p-1 w-fit">
          {(
            [
              { v: "library", label: "학습송" },
              {
                v: "jobs",
                label: `작업 현황${activeCount > 0 ? ` (${activeCount})` : ""}`,
              },
            ] as const
          ).map((t) => (
            <button
              key={t.v}
              type="button"
              onClick={() => setTab(t.v)}
              className={[
                "px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
                tab === t.v
                  ? "gradient-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {(!isEditor || tab === "library") && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="glass rounded-2xl flex items-center gap-2 px-3 py-2 flex-1 min-w-0">
              <Search className="size-4 shrink-0 opacity-50" />
              <Input
                value={search.q}
                onChange={(e) =>
                  navigate({ search: (prev: SearchParams) => ({ ...prev, q: e.target.value }) })
                }
                placeholder="제목 또는 中文 제목 검색…"
                className="border-0 bg-transparent shadow-none focus-visible:ring-0 h-8 text-sm px-0"
              />
              {search.q && (
                <button
                  onClick={() => navigate({ search: (prev: SearchParams) => ({ ...prev, q: "" }) })}
                  className="size-6 grid place-items-center rounded-full hover:bg-surface/40 shrink-0"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </div>

          {/* 좁혀 보기 — 난이도·장르·주제·종류. 고를 게 하나뿐인 축은 숨긴다. */}
          <div className="glass rounded-2xl p-2 flex items-center gap-2 flex-wrap">
            <SlidersHorizontal className="size-4 shrink-0 opacity-50 ml-1" />
            <Select
              value={search.level}
              onValueChange={(v) =>
                navigate({
                  search: (prev: SearchParams) => ({ ...prev, level: v as typeof search.level }),
                })
              }
            >
              <SelectTrigger className="w-32 text-sm md:h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{LEVEL_FILTER_LABEL.all}</SelectItem>
                {LEVEL_OPTIONS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {genreOptions.length > 1 && (
              <Select
                value={search.genre}
                onValueChange={(v) =>
                  navigate({ search: (prev: SearchParams) => ({ ...prev, genre: v }) })
                }
              >
                <SelectTrigger className="w-44 text-sm md:h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 장르</SelectItem>
                  {genreOptions.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {themeOptions.length > 1 && (
              <Select
                value={search.theme}
                onValueChange={(v) =>
                  navigate({ search: (prev: SearchParams) => ({ ...prev, theme: v }) })
                }
              >
                <SelectTrigger className="w-44 text-sm md:h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 주제</SelectItem>
                  {themeOptions.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {hasBothSources && (
              <Select
                value={search.source}
                onValueChange={(v) =>
                  navigate({
                    search: (prev: SearchParams) => ({
                      ...prev,
                      source: v as typeof search.source,
                    }),
                  })
                }
              >
                <SelectTrigger className="w-36 text-sm md:h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 종류</SelectItem>
                  <SelectItem value="curated">🎧 실제 노래</SelectItem>
                  <SelectItem value="suno">🤖 AI 생성</SelectItem>
                </SelectContent>
              </Select>
            )}
            <span className="text-xs text-muted-foreground ml-auto mr-1">
              {filteredSongs.length}곡{filtering && ` / 전체 ${songs?.length ?? 0}곡`}
            </span>
            {filtering && (
              <Button
                size="sm"
                variant="ghost"
                className="h-11 text-xs md:h-8"
                onClick={resetFilters}
              >
                초기화
              </Button>
            )}
          </div>
        </div>
      )}

      {creating === "manual" && isEditor && <CreateSongForm onDone={() => setCreating(null)} />}
      {creating === "ai" && isEditor && <GenerateSongForm onDone={() => setCreating(null)} />}
      {creating === "curated" && isEditor && <CuratedSongForm onDone={() => setCreating(null)} />}
      {creating === "schedule" && isEditor && <SongSchedulePanel />}

      {isEditor && tab === "jobs" && (
        <div className="space-y-4">
          {isEditor && <FailedSongsPanel songs={songs ?? []} />}

          {generatingSongs.length > 0 && (
            <div className="glass rounded-3xl p-5 space-y-4 border border-primary/40 bg-primary/5">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Loader2 className="size-4 animate-spin" />
                Suno가 {generatingSongs.length}곡을 만들고 있어요
                <span className="ml-auto text-[11px] font-normal text-muted-foreground">
                  완료되면 자동으로 목록에 반영돼요
                </span>
              </div>
              <div className="space-y-3">
                {generatingSongs.map((s) => {
                  const isVideo = s.status === "generating_video";
                  const { pct, elapsed, remaining } = estimateProgress(
                    s.created_at,
                    isVideo ? EST_VIDEO_SEC : EST_AUDIO_SEC,
                  );
                  const err = pollErrors[s.id];
                  const rateLimited = isRateLimitedMessage(err);
                  const retryAt = nextRetryAt[s.id];
                  const retryIn = retryAt
                    ? Math.max(0, Math.ceil((retryAt - Date.now()) / 1000))
                    : 0;
                  const stuck = elapsed > 60 * 10; // >10 minutes
                  return (
                    <div key={s.id} className="glass-soft rounded-2xl p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <div className="truncate">
                          <span className="font-medium">{s.title}</span>
                          {s.title_zh && (
                            <span className="text-muted-foreground"> · {s.title_zh}</span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground shrink-0 flex items-center gap-1.5">
                          <span>{isVideo ? "🎬 영상" : "🎙️ 음원"}</span>
                          <span>· 경과 {formatElapsed(elapsed)}</span>
                          {remaining > 0 && !rateLimited && (
                            <span>· 남음 ~{formatElapsed(remaining)}</span>
                          )}
                        </div>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                      {rateLimited ? (
                        <div className="flex items-center gap-1.5 text-[11px] text-warning bg-warning/8 rounded-full px-2 py-1 w-fit">
                          <Loader2 className="size-3 animate-spin" />
                          <span>
                            Suno 요청 한도 초과 —{" "}
                            {retryIn > 0 ? `${retryIn}초 후 자동 재시도` : "재시도 중…"}
                          </span>
                        </div>
                      ) : (
                        err && (
                          <div className="flex items-start gap-1.5 text-[11px] text-destructive">
                            <AlertCircle className="size-3 mt-0.5 shrink-0" />
                            <span className="line-clamp-2">{err}</span>
                          </div>
                        )
                      )}
                      {stuck && (
                        <div className="text-[11px] text-warning bg-warning/8 rounded-md px-2 py-1">
                          ⚠️ 10분 이상 대기 중이에요. Suno 응답이 지연되고 있어요 — 아래 버튼으로
                          취소 후 다시 시도해 보세요.
                        </div>
                      )}
                      {isEditor && (
                        <div className="flex justify-end">
                          <CancelSongButton songId={s.id} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {failedSongs.length > 0 && (
            <div className="glass rounded-3xl p-4 border border-destructive/40 bg-destructive/5">
              <div className="flex items-center gap-2 text-sm font-semibold text-destructive mb-2">
                <AlertCircle className="size-4" /> 생성에 실패한 곡이 있어요
              </div>
              <ul className="text-xs space-y-2">
                {failedSongs.map((s) => {
                  const err = pollErrors[s.id];
                  return (
                    <li key={s.id} className="space-y-1">
                      <div className="flex justify-between gap-2">
                        <span className="truncate font-medium">{s.title}</span>
                        <span className="text-muted-foreground shrink-0">
                          {STATUS_LABEL[s.status]}
                        </span>
                      </div>
                      {err && (
                        <div className="flex items-start gap-1.5 text-destructive/90 pl-1">
                          <AlertCircle className="size-3 mt-0.5 shrink-0" />
                          <span className="leading-snug">{err}</span>
                        </div>
                      )}
                      {isEditor && (
                        <div className="flex justify-end pt-1">
                          <DeleteSongButton songId={s.id} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="text-[11px] text-muted-foreground mt-3">
                💡 같은 키워드로 다시 시도하거나, 가사에서 민감 단어/특수 기호를 제거해보세요.
              </p>
            </div>
          )}
          {generatingSongs.length === 0 && failedSongs.length === 0 && (
            <div className="glass rounded-3xl p-10 text-center text-muted-foreground">
              <div className="text-4xl mb-2">✅</div>
              진행 중이거나 실패한 작업이 없어요.
            </div>
          )}
        </div>
      )}

      {(!isEditor || tab === "library") && (
        <div className="space-y-6">
          {isLoading && (
            <div className="glass rounded-3xl p-5 sm:p-8 text-center text-muted-foreground">
              불러오는 중…
            </div>
          )}
          {!isLoading && filteredSongs.length === 0 && (
            <div className="glass rounded-3xl p-10 text-center">
              <div className="text-4xl mb-2">{songs && songs.length > 0 ? "🔍" : "🎶"}</div>
              <p className="font-medium">
                {songs && songs.length > 0
                  ? "조건에 맞는 곡이 없어요."
                  : "아직 등록된 노래가 없어요."}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {songs && songs.length > 0
                  ? "다른 검색어나 필터를 시도해보세요."
                  : isEditor
                    ? "위의 [AI로 만들기] 또는 [수동 추가] 버튼으로 첫 곡을 등록해보세요."
                    : "곧 멋진 노래가 추가될 거예요!"}
              </p>
              {songs && songs.length > 0 && filtering && (
                <Button size="sm" variant="outline" className="mt-3" onClick={resetFilters}>
                  필터 초기화
                </Button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pagedSongs.map((s) => (
              <Link
                key={s.id}
                to="/songs/$id"
                params={{ id: s.id }}
                className="glass rounded-3xl overflow-hidden group cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-[var(--shadow-soft)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none"
              >
                <div className="aspect-video bg-gradient-to-br from-pink-200/60 via-purple-200/40 to-sky-200/60 relative overflow-hidden">
                  {s.cover_url ? (
                    <img
                      src={s.cover_url}
                      alt={s.title}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-5xl">
                      {s.status === "generating_audio" || s.status === "generating_video"
                        ? "⏳"
                        : "🎵"}
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                    <span className="glass-soft rounded-full px-2 py-0.5 text-[10px] font-semibold">
                      {levelLabel(s.level)}
                    </span>
                    {s.genre && GENRE_LABEL[s.genre] && (
                      <span className="glass-soft rounded-full px-2 py-0.5 text-[10px] font-medium">
                        {GENRE_LABEL[s.genre]}
                      </span>
                    )}
                  </div>
                  <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
                    {s.source === "curated" ? (
                      <span className="bg-rose-500/85 text-white rounded-full px-2 py-0.5 text-[10px] font-semibold">
                        🎧 실제 노래
                      </span>
                    ) : (
                      <span className="bg-violet-500/85 text-white rounded-full px-2 py-0.5 text-[10px] font-semibold">
                        🤖 AI 생성
                      </span>
                    )}
                    {s.video_url && (
                      <span className="bg-primary/80 text-primary-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold">
                        🎬 MP4
                      </span>
                    )}
                    {s.artist && (
                      <span className="glass-soft rounded-full px-2 py-0.5 text-[10px] font-medium">
                        {s.artist}
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-4">
                  <div className="font-bold truncate">{s.title}</div>
                  {s.title_zh && (
                    <div className="text-sm text-muted-foreground truncate">{s.title_zh}</div>
                  )}
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {STATUS_LABEL[s.status] ??
                      `가사 ${Array.isArray(s.lyrics) ? s.lyrics.length : 0}줄`}
                    {s.theme && THEME_LABEL[s.theme] && ` · ${THEME_LABEL[s.theme]}`}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {remaining > 0 && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <Button
                variant="outline"
                className="rounded-2xl px-8"
                onClick={() => setShown((n) => n + PAGE_SIZE)}
              >
                더 보기 ({remaining}곡 남음)
              </Button>
              <span className="text-xs text-muted-foreground">
                {pagedSongs.length} / {filteredSongs.length}곡
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Polls Suno for every song still in `generating_audio` until they complete.
function useSunoPollingForList(songs: SongRow[]): {
  errors: Record<string, string>;
  nextRetryAt: Record<string, number>;
} {
  const qc = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [nextRetryAt, setNextRetryAt] = useState<Record<string, number>>({});
  const pendingKey = songs
    .filter((s) => s.status === "generating_audio" || s.status === "generating_video")
    .map((s) => `${s.id}:${s.status}`)
    .sort()
    .join(",");
  useEffect(() => {
    if (!pendingKey) return;
    const ids = pendingKey.split(",").map((entry) => {
      const [id, status] = entry.split(":");
      return { id, status };
    });
    let cancelled = false;
    const tick = async () => {
      for (const s of ids) {
        if (cancelled) return;
        try {
          if (s.status === "generating_audio") {
            await pollSongGeneration({ data: { songId: s.id } });
          } else if (s.status === "generating_video") {
            await pollSongMp4({ data: { songId: s.id } });
          }
          setErrors((prev) => {
            if (!prev[s.id]) return prev;
            const { [s.id]: _omit, ...rest } = prev;
            return rest;
          });
          setNextRetryAt((prev) => {
            if (!prev[s.id]) return prev;
            const { [s.id]: _omit, ...rest } = prev;
            return rest;
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "폴링 중 오류";
          console.warn("[suno] poll error", s.id, e);
          setErrors((prev) => ({ ...prev, [s.id]: msg }));
          if (isRateLimitedMessage(msg)) {
            setNextRetryAt((prev) => ({
              ...prev,
              [s.id]: Date.now() + POLL_INTERVAL_MS,
            }));
          }
        }
      }
      if (!cancelled) qc.invalidateQueries({ queryKey: ["songs"] });
    };
    const t = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [pendingKey, qc]);
  return { errors, nextRetryAt };
}

function CancelSongButton({ songId }: { songId: string }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => cancelSongGeneration({ data: { songId } }),
    onSuccess: () => {
      toast.success("생성을 취소했어요.");
      qc.invalidateQueries({ queryKey: ["songs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "취소 실패"),
  });
  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      className="px-2 text-[11px]"
      disabled={m.isPending}
      onClick={() => m.mutate()}
    >
      {m.isPending && <Loader2 className="size-3 mr-1 animate-spin" />}
      생성 취소
    </Button>
  );
}

function DeleteSongButton({ songId }: { songId: string }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => deleteSong({ data: { songId } }),
    onSuccess: () => {
      toast.success("노래를 삭제했어요.");
      qc.invalidateQueries({ queryKey: ["songs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "삭제 실패"),
  });
  return (
    <Button
      type="button"
      size="xs"
      variant="ghost"
      className="px-2 text-[11px] text-destructive hover:text-destructive"
      disabled={m.isPending}
      onClick={() => {
        if (confirm("정말 이 노래를 삭제할까요?")) m.mutate();
      }}
    >
      {m.isPending && <Loader2 className="size-3 mr-1 animate-spin" />}
      삭제
    </Button>
  );
}

function GenerateSongForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [title, setTitle] = useState("");
  const [titleZh, setTitleZh] = useState("");
  const [level, setLevel] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [style, setStyle] = useState(STYLE_PRESETS[0].value);
  const [vocalGender, setVocalGender] = useState<"" | "m" | "f">("");
  const [model, setModel] = useState<"V4" | "V4_5" | "V4_5PLUS" | "V4_5ALL" | "V5" | "V5_5">(
    "V4_5",
  );
  const [lyricsRaw, setLyricsRaw] = useState("");
  const [drafted, setDrafted] = useState(false);
  const [draftedPinyin, setDraftedPinyin] = useState<string[]>([]);
  const [draftedKo, setDraftedKo] = useState<string[]>([]);

  const draftMutation = useMutation({
    mutationFn: () => draftSongFromKeyword({ data: { keyword, level, style } }),
    onSuccess: (res) => {
      setTitle(res.title);
      setTitleZh(res.title_zh);
      setLyricsRaw(res.lyrics);
      setDraftedPinyin(res.pinyin ?? []);
      setDraftedKo(res.translation ?? []);
      setDrafted(true);
      const gotAnn = (res.pinyin ?? []).some((p) => p.trim());
      toast.success(
        gotAnn
          ? "AI가 가사·병음·번역을 만들었어요. 확인 후 [생성 시작]을 눌러주세요 ✍️"
          : "AI가 가사 초안을 만들었어요. 병음/번역은 생성 시 자동으로 채워집니다.",
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "초안 생성 실패"),
  });

  const mutation = useMutation({
    mutationFn: () => {
      const parsed = parseLyricsWithAnnotations(lyricsRaw, draftedPinyin, draftedKo);
      const plain = parsed.length ? parsed.map((l) => l.zh).join("\n") : lyricsRaw.trim();
      return generateSongWithSuno({
        data: {
          title,
          title_zh: titleZh,
          level,
          style,
          // 작사에 쓴 키워드를 그대로 남긴다 — 주제 분류의 근거가 된다.
          topic: keyword.trim(),
          lyrics: plain,
          parsedLyrics: parsed,
          vocalGender: vocalGender || undefined,
          model,
        },
      });
    },
    onSuccess: (res) => {
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("🎙️ 음원을 만들고 있어요. 완료되면 자동으로 MP4 영상까지 만들어드릴게요!");
      qc.invalidateQueries({ queryKey: ["songs"] });
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "생성 실패"),
  });

  const previewRows = drafted
    ? parseLyricsWithAnnotations(lyricsRaw, draftedPinyin, draftedKo)
    : [];

  return (
    <div className="glass rounded-3xl p-5 space-y-4 border border-primary/30">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2">
          <Sparkles className="size-4 text-primary" /> AI로 학습송 만들기 (Suno)
        </h2>
        <button
          onClick={onDone}
          className="size-8 grid place-items-center rounded-full hover:bg-surface/40"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Step 1 — keyword + style/level → AI 가사 생성 */}
      <div className="rounded-2xl bg-primary/5 p-4 space-y-3">
        <div className="text-xs font-semibold text-primary flex items-center gap-1">
          ① 키워드로 가사 초안 만들기
        </div>
        <div>
          <label className="text-xs text-muted-foreground">키워드 / 주제</label>
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="예: 봄, 카페에서 만난 친구, 가족 식사…"
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">난이도</label>
            <Select value={level} onValueChange={(v) => setLevel(v as typeof level)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVEL_OPTIONS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">스타일</label>
            <Select value={style} onValueChange={(v) => setStyle(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STYLE_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          onClick={() => draftMutation.mutate()}
          disabled={draftMutation.isPending || !keyword.trim()}
          className="gap-1"
        >
          <Sparkles className="size-4" />
          {draftMutation.isPending ? "AI가 작사 중…" : drafted ? "다시 작사" : "AI 가사 생성"}
        </Button>
      </div>

      {/* Step 2 — review + edit */}
      <div
        className={`rounded-2xl border border-surface/40 p-4 space-y-3 transition-opacity ${drafted ? "opacity-100" : "opacity-60"}`}
      >
        <div className="text-xs font-semibold text-primary flex items-center gap-1">
          ② 제목·가사 확인 후 생성
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">제목 (한글)</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 봄날의 인사"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">제목 (中文)</label>
            <Input
              value={titleZh}
              onChange={(e) => setTitleZh(e.target.value)}
              placeholder="例: 春天的问候"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">보컬 성별 (선택)</label>
            <Select
              value={vocalGender || "_"}
              onValueChange={(v) => setVocalGender(v === "_" ? "" : (v as "m" | "f"))}
            >
              <SelectTrigger>
                <SelectValue placeholder="자동" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_">자동</SelectItem>
                <SelectItem value="f">여성</SelectItem>
                <SelectItem value="m">남성</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Suno 모델</label>
            <Select value={model} onValueChange={(v) => setModel(v as typeof model)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="V4">V4</SelectItem>
                <SelectItem value="V4_5">V4.5 (추천)</SelectItem>
                <SelectItem value="V4_5PLUS">V4.5+</SelectItem>
                <SelectItem value="V4_5ALL">V4.5-all</SelectItem>
                <SelectItem value="V5">V5</SelectItem>
                <SelectItem value="V5_5">V5.5</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">
            가사 (수정 가능 · <code>[Verse] / [Chorus]</code> 마커 지원)
          </label>
          <Textarea
            value={lyricsRaw}
            onChange={(e) => setLyricsRaw(e.target.value)}
            rows={12}
            className="font-mono text-xs"
            placeholder={`[Verse]\n你好你好 新的一天\n[Chorus]\n我爱学中文 我爱叮叮`}
          />
        </div>
        {previewRows.length > 0 && (
          <details className="rounded-xl bg-surface/50 border border-surface/60 p-3 text-xs" open>
            <summary className="cursor-pointer font-semibold text-primary">
              🈶 AI가 채운 병음/번역 미리보기 ({previewRows.length}줄)
            </summary>
            <div className="mt-2 space-y-1 max-h-72 overflow-auto">
              {previewRows.map((r, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1.2fr_1.2fr_1fr] gap-2 py-1 border-b border-surface/40 last:border-0"
                >
                  <div className="font-medium">{r.zh}</div>
                  <div className="text-primary/80">
                    {r.pinyin || <span className="text-muted-foreground">—</span>}
                  </div>
                  <div className="text-muted-foreground">{r.ko || "—"}</div>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          취소
        </Button>
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !title || !style || lyricsRaw.trim().length < 10}
        >
          {mutation.isPending ? "요청 중…" : "🎙️ 생성 시작"}
        </Button>
      </div>
    </div>
  );
}

function CreateSongForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [titleZh, setTitleZh] = useState("");
  const [level, setLevel] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [genre, setGenre] = useState<SongGenre | "">("");
  const [theme, setTheme] = useState<SongTheme | "">("");
  const [coverUrl, setCoverUrl] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [lyricsRaw, setLyricsRaw] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const lyrics = parseLyrics(lyricsRaw);
      return createSong({
        data: {
          title,
          title_zh: titleZh,
          level,
          genre: genre || undefined,
          theme: theme || undefined,
          cover_url: coverUrl,
          media_url: mediaUrl,
          lyrics,
        },
      });
    },
    onSuccess: (res) => {
      toast.success("노래를 추가했어요 🎶");
      qc.invalidateQueries({ queryKey: ["songs"] });
      onDone();
      navigate({ to: "/songs/$id", params: { id: res.songId } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "추가 실패"),
  });

  return (
    <div className="glass rounded-3xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">새 노래 수동 추가</h2>
        <button
          onClick={onDone}
          className="size-8 grid place-items-center rounded-full hover:bg-surface/40"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">제목 (한글)</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 너무 좋아"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">제목 (中文)</label>
          <Input
            value={titleZh}
            onChange={(e) => setTitleZh(e.target.value)}
            placeholder="例: 太喜欢"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">난이도</label>
          <Select value={level} onValueChange={(v) => setLevel(v as typeof level)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEVEL_OPTIONS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">장르 (선택)</label>
          <Select
            value={genre || "_"}
            onValueChange={(v) => setGenre(v === "_" ? "" : (v as SongGenre))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_">지정 안 함</SelectItem>
              {SONG_GENRES.map((g) => (
                <SelectItem key={g.value} value={g.value}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">주제 (선택)</label>
          <Select
            value={theme || "_"}
            onValueChange={(v) => setTheme(v === "_" ? "" : (v as SongTheme))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_">지정 안 함</SelectItem>
              {SONG_THEMES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">커버 이미지 URL (선택)</label>
          <Input
            value={coverUrl}
            onChange={(e) => setCoverUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">미디어 URL (mp4 / mp3 / YouTube)</label>
        <Input
          value={mediaUrl}
          onChange={(e) => setMediaUrl(e.target.value)}
          placeholder="https://youtu.be/… 또는 https://…/song.mp4"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">
          가사 (한 줄에 하나, 형식: <code>[mm:ss] 中文 | pinyin | 한글</code>)
        </label>
        <Textarea
          value={lyricsRaw}
          onChange={(e) => setLyricsRaw(e.target.value)}
          rows={10}
          className="font-mono text-xs"
          placeholder={`[00:12] 你好 | nǐ hǎo | 안녕\n[00:18] 我爱你 | wǒ ài nǐ | 사랑해\n# 타임스탬프가 없으면 정적 가사로 표시됩니다.`}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          취소
        </Button>
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !title || !mediaUrl}
        >
          {mutation.isPending ? "저장 중…" : "추가"}
        </Button>
      </div>
    </div>
  );
}

// Merge drafted pinyin/ko (from Gemini annotate step) with raw lyrics text.
// Uses index-based matching against the trimmed non-empty lines of the raw
// lyrics — the same order the annotate helper saw. Falls back to whatever
// parseLyrics extracts when no annotations are present.
function parseLyricsWithAnnotations(raw: string, pinyin: string[], ko: string[]): LyricLine[] {
  const parsed = parseLyrics(raw);
  if (pinyin.length === 0 && ko.length === 0) return parsed;
  // Build a map: zh line → first available annotation index.
  const rawZh = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return parsed.map((line) => {
    if (line.pinyin || line.ko) return line;
    const idx = rawZh.indexOf(line.zh);
    if (idx < 0) return line;
    return {
      ...line,
      pinyin: pinyin[idx] || line.pinyin || "",
      ko: ko[idx] || line.ko || "",
    };
  });
}

function parseLyrics(raw: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const ln of raw.split(/\r?\n/)) {
    const trimmed = ln.trim();
    if (!trimmed) continue;
    // Skip section markers like [Verse], [Chorus] common in Suno lyrics.
    if (
      /^\[(verse|chorus|bridge|intro|outro|hook|pre-chorus|refrain)\]?$/i.test(
        trimmed.replace(/[[\]]/g, ""),
      )
    )
      continue;
    const timeMatch = trimmed.match(/^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$/);
    let time: number | undefined;
    let body = trimmed;
    if (timeMatch) {
      const m = parseInt(timeMatch[1], 10);
      const s = parseInt(timeMatch[2], 10);
      const ms = timeMatch[3] ? parseInt(timeMatch[3].padEnd(3, "0"), 10) : 0;
      time = m * 60 + s + ms / 1000;
      body = timeMatch[4];
    }
    const parts = body.split("|").map((p) => p.trim());
    const [zh, pinyin = "", ko = ""] = parts;
    if (!zh) continue;
    lines.push({ zh, pinyin, ko, time });
  }
  return lines;
}

function CuratedSongForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [titleZh, setTitleZh] = useState("");
  const [artist, setArtist] = useState("");
  const [level, setLevel] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [genre, setGenre] = useState<SongGenre | "">("");
  const [theme, setTheme] = useState<SongTheme | "">("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [lyricsText, setLyricsText] = useState("");
  const [pinyinText, setPinyinText] = useState("");
  const [translationText, setTranslationText] = useState("");

  const m = useMutation({
    mutationFn: () => {
      const lyrics = lyricsText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const pinyin = pinyinText.split("\n").map((l) => l.trim());
      const translation = translationText.split("\n").map((l) => l.trim());
      return createCuratedSong({
        data: {
          title: title.trim(),
          title_zh: titleZh.trim(),
          artist: artist.trim(),
          level,
          genre: genre || undefined,
          theme: theme || undefined,
          youtube_url: youtubeUrl.trim(),
          lyrics,
          pinyin,
          translation,
        },
      });
    },
    onSuccess: ({ songId }) => {
      toast.success("실제 노래를 등록했어요!");
      qc.invalidateQueries({ queryKey: ["songs"] });
      onDone();
      navigate({ to: "/songs/$id", params: { id: songId } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "등록 실패"),
  });

  return (
    <div className="glass rounded-3xl p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">🎧</span>
        <h2 className="text-xl font-bold">실제 중국어 노래 등록</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        YouTube 링크와 가사(줄바꿈으로 구분)를 넣으면 병음·번역과 함께 학습 페이지로 만들어져요.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium">제목 (한국어) *</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 달빛 아래"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">제목 (中文)</label>
          <Input
            value={titleZh}
            onChange={(e) => setTitleZh(e.target.value)}
            placeholder="月光下"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">아티스트</label>
          <Input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="예: 邓紫棋"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">난이도 *</label>
          <Select value={level} onValueChange={(v) => setLevel(v as typeof level)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEVEL_OPTIONS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">장르</label>
          <Select
            value={genre || "_"}
            onValueChange={(v) => setGenre(v === "_" ? "" : (v as SongGenre))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_">지정 안 함</SelectItem>
              {SONG_GENRES.map((g) => (
                <SelectItem key={g.value} value={g.value}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            AI 생성 곡은 스타일에서 자동으로 정해지지만, 실제 노래는 직접 골라야 장르 필터에 잡혀요.
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">주제</label>
          <Select
            value={theme || "_"}
            onValueChange={(v) => setTheme(v === "_" ? "" : (v as SongTheme))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_">지정 안 함</SelectItem>
              {SONG_THEMES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium">YouTube URL *</label>
        <Input
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
        />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <label className="text-xs font-medium">가사 (중국어, 한 줄에 한 문장) *</label>
          <Textarea
            rows={10}
            value={lyricsText}
            onChange={(e) => setLyricsText(e.target.value)}
            placeholder="月亮代表我的心&#10;你问我爱你有多深"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">병음 (선택, 줄 순서 동일)</label>
          <Textarea
            rows={10}
            value={pinyinText}
            onChange={(e) => setPinyinText(e.target.value)}
            placeholder="yuè liàng dài biǎo wǒ de xīn"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">한국어 번역 (선택)</label>
          <Textarea
            rows={10}
            value={translationText}
            onChange={(e) => setTranslationText(e.target.value)}
            placeholder="달이 내 마음을 대신해요"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" type="button" onClick={onDone}>
          취소
        </Button>
        <Button
          type="button"
          disabled={m.isPending || !title.trim() || !youtubeUrl.trim() || !lyricsText.trim()}
          onClick={() => m.mutate()}
        >
          {m.isPending && <Loader2 className="size-4 mr-1 animate-spin" />}
          노래 등록
        </Button>
      </div>
    </div>
  );
}

/* ── 생성 실패한 곡: 가사 수정 후 재생성 ─────────────────────────────────── */

function FailedSongsPanel({ songs }: { songs: SongRow[] }) {
  const failed = songs.filter((s) => s.status === "failed_audio");
  if (failed.length === 0) return null;
  return (
    <div className="glass rounded-3xl p-5 space-y-3 border border-destructive/40 bg-destructive/5">
      <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
        <AlertCircle className="size-4" />
        생성에 실패한 곡 {failed.length}개
        <span className="ml-auto text-[11px] font-normal text-muted-foreground">
          가사를 고쳐서 다시 생성할 수 있어요
        </span>
      </div>
      <div className="space-y-3">
        {failed.map((s) => (
          <FailedSongCard key={s.id} song={s} />
        ))}
      </div>
    </div>
  );
}

function FailedSongCard({ song }: { song: SongRow }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [lyrics, setLyrics] = useState(() => (song.lyrics ?? []).map((l) => l.zh).join("\n"));
  const [style, setStyle] = useState(song.style ?? STYLE_PRESETS[0].value);

  const retry = useMutation({
    mutationFn: () =>
      retrySongGeneration({
        data: { songId: song.id, lyrics: lyrics.trim(), style },
      }),
    onSuccess: (row: SongRow) => {
      qc.invalidateQueries({ queryKey: ["songs"] });
      if (row.status === "failed_audio") {
        toast.error(row.error ?? "다시 실패했어요. 가사를 더 손봐주세요.");
      } else {
        toast.success("재생성을 시작했어요. 완료되면 목록에 반영돼요.");
        setOpen(false);
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "재생성 실패"),
  });

  const isSensitive = /민감|sensitive/i.test(song.error ?? "");

  return (
    <div className="glass-soft rounded-2xl p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">
            {song.title}
            {song.title_zh && <span className="text-muted-foreground"> · {song.title_zh}</span>}
          </div>
          {song.error && <p className="text-[11px] text-destructive mt-0.5">{song.error}</p>}
          {isSensitive && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              💡 Suno가 거부한 표현을 비슷한 뜻의 다른 단어로 바꾼 뒤 재생성해보세요.
            </p>
          )}
        </div>
        <Button
          size="xs"
          variant="outline"
          className="px-2 text-xs shrink-0"
          onClick={() => setOpen((v) => !v)}
        >
          <Pencil className="size-3.5 mr-1" />
          {open ? "닫기" : "가사 수정"}
        </Button>
      </div>

      {open && (
        <div className="space-y-2 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs">가사 (한 줄에 한 소절, [Verse] 같은 구분자 유지)</Label>
            <Textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              rows={10}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">음악 스타일</Label>
            <Select value={style} onValueChange={setStyle}>
              <SelectTrigger className="h-11 text-xs md:h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STYLE_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={retry.isPending || lyrics.trim().length < 10}
              onClick={() => retry.mutate()}
            >
              {retry.isPending && <Loader2 className="size-3.5 mr-1 animate-spin" />}
              수정 후 재생성
            </Button>
            <span className="text-[11px] text-muted-foreground">
              병음·번역은 자동으로 다시 붙어요
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 예약·반복 (학습송 자동 생성) ─────────────────────────────────────────── */

const SONG_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
type SongSchedule = Awaited<ReturnType<typeof listSongSchedules>>[number];

function SongSchedulePanel() {
  const qc = useQueryClient();
  const schedules = useQuery({
    queryKey: ["song-schedules"],
    queryFn: () => listSongSchedules({}),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [keywordsRaw, setKeywordsRaw] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("weekly");
  const [weekdays, setWeekdays] = useState<number[]>([2, 5]);
  const [timeKst, setTimeKst] = useState("09:00");
  const [level, setLevel] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [style, setStyle] = useState(STYLE_PRESETS[0].value);
  const [vocalGender, setVocalGender] = useState<"" | "m" | "f">("");

  function resetForm() {
    setEditingId(null);
    setName("");
    setKeywordsRaw("");
    setFrequency("weekly");
    setWeekdays([2, 5]);
    setTimeKst("09:00");
    setLevel("beginner");
    setStyle(STYLE_PRESETS[0].value);
    setVocalGender("");
  }

  function startEdit(s: SongSchedule) {
    setEditingId(s.id);
    setName(s.name);
    setKeywordsRaw((s.keywords ?? []).join("\n"));
    setFrequency(s.frequency === "daily" ? "daily" : "weekly");
    setWeekdays(s.weekdays?.length ? s.weekdays : [2, 5]);
    setTimeKst(s.time_kst);
    setLevel(
      (["beginner", "intermediate", "advanced"].includes(s.level)
        ? s.level
        : "beginner") as typeof level,
    );
    setStyle(s.style);
    setVocalGender(s.vocal_gender === "m" || s.vocal_gender === "f" ? s.vocal_gender : "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function buildPayload() {
    return {
      name: name.trim(),
      keywords: keywordsRaw
        .split(/\r?\n|,/)
        .map((s) => s.trim())
        .filter(Boolean),
      frequency,
      weekdays: frequency === "weekly" ? weekdays : [],
      time_kst: timeKst,
      level,
      style,
      vocal_gender: vocalGender === "" ? null : vocalGender,
    };
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (editingId) await updateSongSchedule({ data: { id: editingId, ...buildPayload() } });
      else await createSongSchedule({ data: buildPayload() });
    },
    onSuccess: () => {
      toast.success(editingId ? "예약을 수정했어요." : "예약을 등록했어요.");
      resetForm();
      qc.invalidateQueries({ queryKey: ["song-schedules"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "저장 실패"),
  });

  const toggleWeekday = (d: number) =>
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  return (
    <div className="space-y-5">
      <div className="glass rounded-3xl p-4 sm:p-6 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <CalendarClock className="size-4" />
          {editingId ? "예약 수정" : "새 예약 만들기"}
          <span className="text-xs font-normal text-muted-foreground">
            — 예약 시간에 키워드로 AI가 작사하고 Suno로 노래를 자동 생성해요
          </span>
        </h3>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>예약 이름 *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 주 2회 동요풍"
              maxLength={60}
            />
          </div>
          <div className="space-y-2">
            <Label>실행 시간 (한국 시간) *</Label>
            <Input type="time" value={timeKst} onChange={(e) => setTimeKst(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>키워드 목록 * (줄바꿈/쉼표 구분 — 실행마다 하나씩 순환)</Label>
          <Textarea
            value={keywordsRaw}
            onChange={(e) => setKeywordsRaw(e.target.value)}
            placeholder={"봄날 산책\n카페에서\n친구와 여행"}
            rows={3}
          />
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>반복 주기</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as "daily" | "weekly")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">매일</SelectItem>
                <SelectItem value="weekly">매주 (요일 선택)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-3">
            <Label>요일 {frequency === "daily" && "(매일 실행 — 선택 불필요)"}</Label>
            <div className="flex gap-1.5">
              {SONG_WEEKDAYS.map((w, d) => (
                <button
                  key={d}
                  type="button"
                  disabled={frequency === "daily"}
                  onClick={() => toggleWeekday(d)}
                  className={[
                    "size-9 rounded-xl text-sm font-medium border transition disabled:opacity-40",
                    frequency === "weekly" && weekdays.includes(d)
                      ? "gradient-primary text-primary-foreground border-transparent"
                      : "bg-surface/60 border-border hover:bg-surface",
                  ].join(" ")}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>난이도</Label>
            <Select value={level} onValueChange={(v) => setLevel(v as typeof level)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVEL_ORDER.map((l) => (
                  <SelectItem key={l} value={l}>
                    {LEVEL_LABEL_HSK[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>음악 스타일</Label>
            <Select value={style} onValueChange={setStyle}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STYLE_PRESETS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>보컬 성별</Label>
            <Select
              value={vocalGender || "auto"}
              onValueChange={(v) => setVocalGender(v === "auto" ? "" : (v as "m" | "f"))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">자동</SelectItem>
                <SelectItem value="f">여성</SelectItem>
                <SelectItem value="m">남성</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            disabled={saveMut.isPending}
            onClick={() => {
              if (!name.trim()) return toast.error("예약 이름을 입력하세요.");
              if (!keywordsRaw.trim()) return toast.error("키워드를 입력하세요.");
              if (frequency === "weekly" && weekdays.length === 0)
                return toast.error("요일을 선택하세요.");
              saveMut.mutate();
            }}
          >
            {saveMut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {editingId ? "수정 저장" : "예약 등록"}
          </Button>
          {editingId && (
            <Button variant="outline" onClick={resetForm}>
              <X className="size-4 mr-1" /> 취소
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {(schedules.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">등록된 예약이 없어요.</p>
        )}
        <ul className="space-y-2">
          {(schedules.data ?? []).map((s: SongSchedule) => (
            <li
              key={s.id}
              className="glass rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap"
            >
              <Switch
                checked={s.enabled}
                onCheckedChange={(v) =>
                  toggleSongSchedule({ data: { id: s.id, enabled: v } })
                    .then(() => qc.invalidateQueries({ queryKey: ["song-schedules"] }))
                    .catch((e) => toast.error(e instanceof Error ? e.message : "오류"))
                }
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{s.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {s.frequency === "daily"
                    ? "매일"
                    : `매주 ${(s.weekdays ?? []).map((d) => SONG_WEEKDAYS[d]).join("·")}`}{" "}
                  {s.time_kst} · 키워드 {s.keywords.length}개 순환
                  {s.last_run_at &&
                    ` · 마지막 실행 ${new Date(s.last_run_at).toLocaleDateString("ko-KR")}`}
                </div>
              </div>
              <Button
                size="xs"
                variant="outline"
                className="px-2 text-xs"
                onClick={() => startEdit(s)}
              >
                <Pencil className="size-3.5 mr-1" /> 수정
              </Button>
              <Button
                size="xs"
                variant="outline"
                className="px-2 text-xs"
                onClick={() =>
                  runSongScheduleNow({ data: { id: s.id } })
                    .then(() => {
                      toast.success("지금 실행했어요 — 목록에서 생성 상태를 확인하세요.");
                      qc.invalidateQueries({ queryKey: ["songs"] });
                      qc.invalidateQueries({ queryKey: ["song-schedules"] });
                    })
                    .catch((e) => toast.error(e instanceof Error ? e.message : "실행 실패"))
                }
              >
                <Play className="size-3.5 mr-1" /> 지금 실행
              </Button>
              <Button
                size="xs"
                variant="ghost"
                className="px-2 text-xs text-muted-foreground"
                onClick={() =>
                  deleteSongSchedule({ data: { id: s.id } })
                    .then(() => qc.invalidateQueries({ queryKey: ["song-schedules"] }))
                    .catch((e) => toast.error(e instanceof Error ? e.message : "삭제 실패"))
                }
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
