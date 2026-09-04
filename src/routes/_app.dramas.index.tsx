import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Film,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

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
import { useIsEditor, useMyProfile } from "@/lib/auth-client";
import {
  deleteDrama,
  listDramas,
  updateDramaLevel,
  type DramaListRow,
} from "@/lib/dramas.functions";
import { listMyDramaProgress } from "@/lib/drama-progress.functions";
import { generateDrama } from "@/lib/generate-drama.functions";
import { resyncAllDramasWithoutCaptions } from "@/lib/resync-dramas.functions";
import { probeCaptions, type ProbeResult } from "@/lib/youtube-captions.functions";
import { LEVEL_OPTIONS, levelLabel } from "@/lib/levels";

export const Route = createFileRoute("/_app/dramas/")({
  head: () => ({
    meta: [
      { title: "영상 학습 — DingDong" },
      {
        name: "description",
        content:
          "유튜브 드라마 영상으로 중국어를 배워보세요. AI가 장면을 분할하고 학습 콘텐츠를 만듭니다.",
      },
    ],
  }),
  component: DramasPage,
  errorComponent: ({ error }) => (
    <div className="glass rounded-3xl p-4 sm:p-6 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div>없습니다.</div>,
});

const PAGE_SIZE = 24;

// What the learner is choosing between: a Korean narrator explaining and
// quoting the Chinese, or Chinese throughout.
const NARRATION_LABEL: Record<string, string> = {
  ko: "한국어 설명",
  zh: "중국어 몰입",
};

function DramasPage() {
  const { data: profile } = useMyProfile();
  const isEditor = useIsEditor();
  const isAdmin = profile?.role === "admin";
  const qc = useQueryClient();
  const { data: dramas, isLoading } = useQuery({
    queryKey: ["dramas"],
    queryFn: () => listDramas(),
  });
  const { data: progressList } = useQuery({
    queryKey: ["drama-progress-list"],
    queryFn: () => listMyDramaProgress({}),
    enabled: !!profile,
  });
  const progressMap = new Map((progressList ?? []).map((p) => [p.drama_id, p.completed]));
  const [creating, setCreating] = useState(false);
  const [genreFilter, setGenreFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  // Which language the narrator speaks: Korean explains in Korean and quotes the
  // Chinese, Chinese is immersion. That is the choice a learner makes when
  // picking one video to watch, so it belongs next to genre and level.
  const [langFilter, setLangFilter] = useState("all");

  // Options come from the data rather than a fixed list, so the dropdowns stay
  // in step as the library grows instead of offering categories nothing is in.
  const genreOptions = useMemo(
    () =>
      [...new Set((dramas ?? []).map((d) => d.genre).filter(Boolean))].sort((a, b) =>
        String(a).localeCompare(String(b), "ko"),
      ) as string[],
    [dramas],
  );
  const levelOptions = useMemo(() => {
    const present = new Set((dramas ?? []).map((d) => d.level).filter(Boolean));
    // Keep pedagogical order, not alphabetical.
    return (["beginner", "intermediate", "advanced"] as const).filter((l) => present.has(l));
  }, [dramas]);
  const langOptions = useMemo(() => {
    const present = new Set((dramas ?? []).map((d) => d.narration_language).filter(Boolean));
    return (["ko", "zh"] as const).filter((l) => present.has(l));
  }, [dramas]);

  const visibleDramas = useMemo(
    () =>
      (dramas ?? []).filter(
        (d) =>
          (genreFilter === "all" || d.genre === genreFilter) &&
          (levelFilter === "all" || d.level === levelFilter) &&
          (langFilter === "all" || d.narration_language === langFilter),
      ),
    [dramas, genreFilter, levelFilter, langFilter],
  );
  const filtering = genreFilter !== "all" || levelFilter !== "all" || langFilter !== "all";

  // The library grows by a handful of videos a day, so the grid is paged
  // rather than rendering every card. Filtering narrows the same list, so the
  // page resets whenever it changes — otherwise a filter applied on page 5
  // would open on an empty screen.
  const [shown, setShown] = useState(PAGE_SIZE);
  useEffect(() => {
    setShown(PAGE_SIZE);
  }, [genreFilter, levelFilter, langFilter]);
  const pagedDramas = visibleDramas.slice(0, shown);
  const remaining = visibleDramas.length - pagedDramas.length;

  const del = useMutation({
    mutationFn: (id: string) => deleteDrama({ data: { id } }),
    onSuccess: () => {
      toast.success("삭제되었어요");
      qc.invalidateQueries({ queryKey: ["dramas"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "삭제 실패"),
  });

  // 난이도는 등록 시 한 번 고르고 나면 고칠 방법이 없었다. 목록에서 바로
  // 바꿀 수 있게 두어야 잘못 붙은 라벨이 그대로 굳지 않는다.
  const setLevel = useMutation({
    mutationFn: (v: { id: string; level: "beginner" | "intermediate" | "advanced" }) =>
      updateDramaLevel({ data: v }),
    onSuccess: (r) => {
      toast.success(`난이도를 ${levelLabel(r.level)}으로 바꿨어요`);
      qc.invalidateQueries({ queryKey: ["dramas"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "난이도 변경 실패"),
  });

  const resync = useMutation({
    mutationFn: () => resyncAllDramasWithoutCaptions(),
    onSuccess: (r) => {
      const failMsgs = r.results
        .filter((x) => x.status === "error")
        .slice(0, 3)
        .map((x) => `• ${x.title}: ${x.message ?? "실패"}`)
        .join("\n");
      toast.success(
        `재동기화 완료 — 성공 ${r.updated} · 자막없음 ${r.skipped} · 실패 ${r.failed}` +
          (failMsgs ? `\n${failMsgs}` : ""),
      );
      qc.invalidateQueries({ queryKey: ["dramas"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "재동기화 실패"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Film className="size-7 text-primary" /> 영상 학습
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            유튜브 영상을 넣으면 AI가 장면을 나누고 학습 자료를 만들어 드려요 🎬
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <Button
              onClick={() => {
                if (
                  confirm(
                    "자막이 있는 기존 드라마를 모두 다시 생성합니다. 각 영상마다 AI 크레딧이 소모되고 몇 분 걸릴 수 있어요. 계속할까요?",
                  )
                )
                  resync.mutate();
              }}
              variant="outline"
              className="gap-1"
              disabled={resync.isPending}
            >
              <RefreshCw className={`size-4 ${resync.isPending ? "animate-spin" : ""}`} />
              {resync.isPending ? "재동기화 중…" : "자막 재동기화"}
            </Button>
          )}
          {isEditor && (
            <Button
              onClick={() => setCreating((v) => !v)}
              variant={creating ? "secondary" : "default"}
              className="gap-1"
            >
              {creating ? (
                <>
                  <X className="size-4" /> 닫기
                </>
              ) : (
                <>
                  <Plus className="size-4" /> 드라마 추가
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {creating && isEditor && <CreateDramaForm onDone={() => setCreating(false)} />}

      {/* Filters — only worth showing once there is something to narrow down. */}
      {(genreOptions.length > 1 || levelOptions.length > 1 || langOptions.length > 1) && (
        <div className="glass rounded-3xl p-3 flex items-center gap-2 flex-wrap">
          <SlidersHorizontal className="size-4 text-muted-foreground ml-1" />
          {genreOptions.length > 1 && (
            <Select value={genreFilter} onValueChange={setGenreFilter}>
              <SelectTrigger className="w-44 text-sm">
                <SelectValue placeholder="카테고리" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 카테고리</SelectItem>
                {genreOptions.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {levelOptions.length > 1 && (
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="w-36 text-sm">
                <SelectValue placeholder="난이도" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 난이도</SelectItem>
                {levelOptions.map((l) => (
                  <SelectItem key={l} value={l}>
                    {levelLabel(l)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {langOptions.length > 1 && (
            <Select value={langFilter} onValueChange={setLangFilter}>
              <SelectTrigger className="w-40 text-sm" aria-label="나레이션 언어">
                <SelectValue placeholder="나레이션" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 나레이션</SelectItem>
                {langOptions.map((l) => (
                  <SelectItem key={l} value={l}>
                    {NARRATION_LABEL[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <span className="text-xs text-muted-foreground ml-auto mr-1">
            {visibleDramas.length}개{filtering && ` / 전체 ${dramas?.length ?? 0}개`}
          </span>
          {filtering && (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => {
                setGenreFilter("all");
                setLevelFilter("all");
              }}
            >
              초기화
            </Button>
          )}
        </div>
      )}

      {isLoading && (
        <div className="glass rounded-3xl p-5 sm:p-8 text-center text-muted-foreground">
          불러오는 중…
        </div>
      )}
      {!isLoading && dramas && dramas.length === 0 && (
        <div className="glass rounded-3xl p-10 text-center">
          <div className="text-4xl mb-2">🎬</div>
          <p className="font-medium">아직 등록된 드라마가 없어요.</p>
          <p className="text-sm text-muted-foreground mt-1">
            {isEditor
              ? "위 [드라마 추가]에서 첫 콘텐츠를 만들어보세요."
              : "곧 새로운 콘텐츠가 추가될 거예요!"}
          </p>
        </div>
      )}

      {!isLoading && dramas && dramas.length > 0 && visibleDramas.length === 0 && (
        <div className="glass rounded-3xl p-10 text-center">
          <div className="text-4xl mb-2">🔍</div>
          <p className="font-medium">조건에 맞는 영상이 없어요.</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => {
              setGenreFilter("all");
              setLevelFilter("all");
            }}
          >
            필터 초기화
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {pagedDramas.map((d) => {
          const canDelete = isAdmin || d.created_by === profile?.id;
          return (
            <div key={d.id} className="glass rounded-3xl overflow-hidden group relative">
              <Link
                to="/dramas/$id"
                params={{ id: d.id }}
                className="block hover:scale-[1.02] transition-transform"
              >
                <div className="aspect-video bg-gradient-to-br from-pink-200/60 via-purple-200/40 to-sky-200/60 relative overflow-hidden">
                  {d.thumbnail_url ? (
                    <img
                      src={d.thumbnail_url}
                      alt={d.title}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-5xl">🎬</div>
                  )}
                  <div className="absolute top-2 right-2 glass-soft rounded-full px-2 py-0.5 text-[10px] font-semibold">
                    {levelLabel(d.level)}
                  </div>
                  <div className="absolute bottom-2 left-2 bg-black/60 text-white rounded-full px-2 py-0.5 text-[10px] font-semibold">
                    🎞 {d.scene_count}장면
                    {(progressMap.get(d.id) ?? 0) > 0 && (
                      <span className="ml-1">
                        · ✅ {Math.min(progressMap.get(d.id)!, d.scene_count)}/{d.scene_count}
                      </span>
                    )}
                  </div>
                  {d.has_captions === false && (
                    <div
                      className="absolute bottom-2 right-2 bg-amber-500/95 text-white rounded-full px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1"
                      title="이 영상은 자막을 서버에서 가져오지 못해 AI가 대사·타임을 창작했을 수 있어요."
                    >
                      <AlertTriangle className="size-3" /> 자막 없음
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="font-bold truncate">{d.title}</div>
                  {d.title_zh && (
                    <div className="text-sm text-muted-foreground truncate">{d.title_zh}</div>
                  )}
                  {d.description && (
                    <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                      {d.description}
                    </div>
                  )}
                </div>
              </Link>
              {isEditor && (
                <div className="px-4 pb-4 -mt-2" onClick={(e) => e.stopPropagation()}>
                  <Select
                    value={d.level}
                    onValueChange={(v) =>
                      setLevel.mutate({ id: d.id, level: v as DramaListRow["level"] })
                    }
                    disabled={setLevel.isPending}
                  >
                    <SelectTrigger className="rounded-xl text-xs md:h-8" aria-label="난이도 변경">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEVEL_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {canDelete && (
                <button
                  onClick={() => {
                    if (confirm(`"${d.title}" 드라마를 삭제할까요?`)) del.mutate(d.id);
                  }}
                  className="absolute top-2 left-2 size-8 rounded-full bg-destructive/90 text-destructive-foreground grid place-items-center shadow-lg hover:bg-destructive transition-colors z-10"
                  title="삭제"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {remaining > 0 && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <Button
            variant="outline"
            className="rounded-2xl px-8"
            onClick={() => setShown((n) => n + PAGE_SIZE)}
          >
            더 보기 ({remaining}개 남음)
          </Button>
          <span className="text-xs text-muted-foreground">
            {pagedDramas.length} / {visibleDramas.length}개
          </span>
        </div>
      )}
    </div>
  );
}

function CreateDramaForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [level, setLevel] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [lang, setLang] = useState<"auto" | "zh-CN" | "zh-TW" | "en">("auto");

  // Debounced caption probe: whenever the URL changes, wait ~600ms then ask
  // the server whether YouTube exposes usable captions for that video. Result
  // gates the [학습 자료 생성] button so users don't waste AI credits on
  // videos we can't extract dialogue from.
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  useEffect(() => {
    const url = youtubeUrl.trim();
    setProbe(null);
    if (!url) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setProbing(true);
      try {
        const r = await probeCaptions({ data: { youtubeUrl: url, lang } });
        if (!cancelled) setProbe(r);
      } catch {
        if (!cancelled) setProbe(null);
      } finally {
        if (!cancelled) setProbing(false);
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [youtubeUrl, lang]);

  const mutation = useMutation({
    mutationFn: () => generateDrama({ data: { youtubeUrl, title, level, genre, lang } }),
    onSuccess: (res) => {
      toast.success("영상 학습 자료를 만들었어요 🎬");
      qc.invalidateQueries({ queryKey: ["dramas"] });
      onDone();
      navigate({ to: "/dramas/$id", params: { id: res.dramaId } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "생성 실패"),
  });

  const errMsg = mutation.error instanceof Error ? mutation.error.message : null;
  const isRateLimited = !!errMsg && /429|한도/.test(errMsg);
  const isCredit = !!errMsg && /402|크레딧/.test(errMsg);
  const errTitle = isRateLimited
    ? "요청이 잠깐 몰렸어요"
    : isCredit
      ? "AI 크레딧이 부족해요"
      : "생성에 실패했어요";
  const errHint = isRateLimited
    ? "약 30초~1분 후 [다시 시도]를 눌러주세요."
    : isCredit
      ? "관리자에게 크레딧 충전을 요청한 뒤 다시 시도해주세요."
      : "URL이 올바른지, 영상이 공개인지 확인한 뒤 다시 시도해주세요.";

  return (
    <div className="glass rounded-3xl p-5 space-y-4 border border-primary/30">
      <h2 className="font-semibold flex items-center gap-2">
        <Sparkles className="size-4 text-primary" /> AI로 영상 학습 만들기
      </h2>
      <p className="text-xs text-muted-foreground">
        AI가 영상을 시청하고 장면을 나눠 학습 자료를 생성해요. 영상 길이에 따라 30초~2분 정도
        걸려요.
      </p>

      {errMsg && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-sm text-destructive">{errTitle}</div>
              <div className="text-xs text-destructive/90 break-words">{errMsg}</div>
              <div className="text-xs text-muted-foreground">{errHint}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="gap-1"
            >
              <RotateCcw className="size-3.5" /> 다시 시도
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => mutation.reset()}
              disabled={mutation.isPending}
            >
              나중에 다시 시도
            </Button>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-xs text-muted-foreground">YouTube URL (필수)</label>
          <Textarea
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            rows={2}
            placeholder="https://www.youtube.com/watch?v=..."
            className="font-mono text-xs"
          />
          {youtubeUrl.trim() && (
            <div className="text-[11px] flex items-center gap-1.5">
              {probing ? (
                <>
                  <Loader2 className="size-3 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">자막 확인 중…</span>
                </>
              ) : probe?.ok ? (
                <>
                  <CheckCircle2 className="size-3 text-success" />
                  <span className="text-success">
                    자막 있음 · {probe.languageCode} · {probe.segmentCount}줄
                  </span>
                </>
              ) : probe && !probe.ok ? (
                <>
                  <AlertTriangle className="size-3 text-destructive" />
                  <span className="text-destructive">
                    {probe.reason === "no-video-id"
                      ? "올바른 YouTube URL이 아닙니다."
                      : probe.reason === "no-tracks"
                        ? "이 영상은 자막 트랙이 없어요 — 생성할 수 없습니다."
                        : `자막 트랙 ${probe.trackCount ?? 0}개가 있지만 YouTube가 빈 응답을 반환해요 (PoToken 보호 자동자막) — 생성할 수 없습니다.`}
                  </span>
                </>
              ) : null}
            </div>
          )}
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-muted-foreground">제목 (선택, 비우면 AI가 작성)</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 첫 만남의 인사"
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
          <label className="text-xs text-muted-foreground">자막 언어</label>
          <Select value={lang} onValueChange={(v) => setLang(v as typeof lang)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">자동 (권장)</SelectItem>
              <SelectItem value="zh-CN">🇨🇳 중국어(간체)</SelectItem>
              <SelectItem value="zh-TW">🇹🇼 중국어(번체)</SelectItem>
              <SelectItem value="en">🇺🇸 영어</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-muted-foreground">장르 (선택)</label>
          <Select
            value={genre || "__none__"}
            onValueChange={(v) => setGenre(v === "__none__" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="장르 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">선택 안 함</SelectItem>
              <SelectItem value="로맨스">💕 로맨스</SelectItem>
              <SelectItem value="사극/무협">🏯 사극/무협</SelectItem>
              <SelectItem value="일상/슬라이스">☕ 일상/슬라이스</SelectItem>
              <SelectItem value="가족">👨‍👩‍👧 가족</SelectItem>
              <SelectItem value="코미디">😂 코미디</SelectItem>
              <SelectItem value="학원물/청춘">🎒 학원물/청춘</SelectItem>
              <SelectItem value="오피스/직장">💼 오피스/직장</SelectItem>
              <SelectItem value="스릴러/미스터리">🕵️ 스릴러/미스터리</SelectItem>
              <SelectItem value="범죄/수사">🚔 범죄/수사</SelectItem>
              <SelectItem value="의학">🏥 의학</SelectItem>
              <SelectItem value="법정">⚖️ 법정</SelectItem>
              <SelectItem value="판타지">✨ 판타지</SelectItem>
              <SelectItem value="SF">🚀 SF</SelectItem>
              <SelectItem value="액션">💥 액션</SelectItem>
              <SelectItem value="스포츠">⚽ 스포츠</SelectItem>
              <SelectItem value="음식/요리">🍜 음식/요리</SelectItem>
              <SelectItem value="여행">🗺️ 여행</SelectItem>
              <SelectItem value="애니메이션">🎨 애니메이션</SelectItem>
              <SelectItem value="다큐멘터리">🎬 다큐멘터리</SelectItem>
              <SelectItem value="예능/버라이어티">🎤 예능/버라이어티</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          취소
        </Button>
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !youtubeUrl.trim() || probing || !probe?.ok}
        >
          {mutation.isPending
            ? "AI 분석 중… (1~2분 소요)"
            : probing
              ? "자막 확인 중…"
              : probe && !probe.ok
                ? "자막 없음 — 생성 불가"
                : "🎬 학습 자료 생성"}
        </Button>
      </div>
    </div>
  );
}
