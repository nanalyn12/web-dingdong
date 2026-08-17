import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Check, GripVertical, Pencil, Plus, Volume2, X } from "lucide-react";

import { useSession } from "@/lib/auth-client";
import { useZhTts } from "@/lib/use-zh-tts";
import {
  DEFAULT_LAYOUT,
  WIDGET_IDS,
  getContinueWatching,
  getDailyQuote,
  getDailySong,
  getWidgetLayout,
  getWidgetStats,
  saveWidgetLayout,
  type WidgetId,
} from "@/lib/widgets.functions";
import { levelLabel } from "@/lib/levels";

const WIDGET_META: Record<WidgetId, { title: string; emoji: string }> = {
  quote: { title: "오늘의 명언", emoji: "💬" },
  stats: { title: "학습 현황", emoji: "📊" },
  calendar: { title: "학습 캘린더", emoji: "📅" },
  continue: { title: "이어보기", emoji: "▶️" },
  song: { title: "오늘의 학습송", emoji: "🎵" },
};

const GUEST_KEY = "dd-widget-layout";

/** 개인화 위젯 패널 — 데스크톱 사이드바와 모바일 홈 상단에서 공용. */
export function WidgetPanel() {
  const { session } = useSession();
  const [layout, setLayout] = useState<WidgetId[]>(DEFAULT_LAYOUT);
  const [edit, setEdit] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Saved layout: DB when signed in, localStorage for guests (loaded after
  // mount to keep SSR/client markup identical).
  const serverLayout = useQuery({
    queryKey: ["widget-layout"],
    queryFn: () => getWidgetLayout({}),
    enabled: !!session,
    staleTime: Infinity,
  });
  useEffect(() => {
    if (session) {
      if (serverLayout.data) setLayout(serverLayout.data);
      return;
    }
    try {
      const raw = localStorage.getItem(GUEST_KEY);
      if (raw) {
        const parsed = (JSON.parse(raw) as string[]).filter((w): w is WidgetId =>
          (WIDGET_IDS as readonly string[]).includes(w),
        );
        setLayout(parsed);
      }
    } catch {
      /* ignore */
    }
  }, [session, serverLayout.data]);

  const save = useMutation({
    mutationFn: (next: WidgetId[]) => saveWidgetLayout({ data: { layout: next } }),
  });
  const persist = (next: WidgetId[]) => {
    setLayout(next);
    if (session) save.mutate(next);
    else {
      try {
        localStorage.setItem(GUEST_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    }
  };

  const available = WIDGET_IDS.filter((w) => !layout.includes(w));

  return (
    <div className="glass rounded-3xl p-3 space-y-2" data-tour="widget-panel">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-muted-foreground">내 위젯</span>
        <button
          type="button"
          onClick={() => setEdit((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] rounded-lg px-2 py-1 hover:bg-white/60 transition text-muted-foreground"
        >
          {edit ? <Check className="size-3" /> : <Pencil className="size-3" />}
          {edit ? "완료" : "편집"}
        </button>
      </div>

      {layout.length === 0 && !edit && (
        <p className="px-1 pb-1 text-xs text-muted-foreground">[편집]에서 위젯을 추가해보세요.</p>
      )}

      <div className="space-y-2">
        {layout.map((id, i) => (
          <div
            key={id}
            draggable={edit}
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragIndex === null || dragIndex === i) return;
              const next = [...layout];
              const [moved] = next.splice(dragIndex, 1);
              next.splice(i, 0, moved);
              setLayout(next);
              setDragIndex(i);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              persist(layout);
            }}
            className={[
              "rounded-2xl bg-white/50 border border-white/60 overflow-hidden",
              edit ? "cursor-grab active:cursor-grabbing" : "",
              dragIndex === i ? "opacity-60 ring-2 ring-primary/40" : "",
            ].join(" ")}
          >
            <div className="flex items-center gap-1.5 px-3 pt-2">
              {edit && <GripVertical className="size-3.5 text-muted-foreground shrink-0" />}
              <span className="text-[11px] font-semibold text-muted-foreground flex-1">
                {WIDGET_META[id].emoji} {WIDGET_META[id].title}
              </span>
              {edit && (
                <button
                  type="button"
                  onClick={() => persist(layout.filter((w) => w !== id))}
                  className="rounded-md p-0.5 hover:bg-white/70 text-muted-foreground"
                  title="위젯 제거"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <div className="px-3 pb-3 pt-1.5">
              {id === "quote" && <QuoteWidget />}
              {id === "stats" && <StatsWidget signedIn={!!session} />}
              {id === "calendar" && <CalendarWidget signedIn={!!session} />}
              {id === "continue" && <ContinueWidget signedIn={!!session} />}
              {id === "song" && <DailySongWidget />}
            </div>
          </div>
        ))}
      </div>

      {edit && available.length > 0 && (
        <div className="pt-1 space-y-1">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            위젯 추가
          </p>
          {available.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => persist([...layout, id])}
              className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm bg-white/40 hover:bg-white/70 transition text-left"
            >
              <Plus className="size-3.5 text-primary" />
              {WIDGET_META[id].emoji} {WIDGET_META[id].title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 💬 오늘의 명언 ─────────────────────────────────────────────────────── */

function QuoteWidget() {
  const { speak, speakingId } = useZhTts();
  const { data, isLoading } = useQuery({
    queryKey: ["daily-quote"],
    queryFn: () => getDailyQuote({}),
    staleTime: Infinity,
  });
  if (isLoading) return <p className="text-xs text-muted-foreground">불러오는 중…</p>;
  if (!data) return <p className="text-xs text-muted-foreground">오늘의 명언을 준비 중이에요.</p>;
  return (
    <div className="space-y-1">
      <div className="flex items-start gap-1.5">
        <p className="font-semibold leading-snug flex-1">{data.zh}</p>
        <button
          type="button"
          onClick={() => speak(data.zh, "daily-quote")}
          className={[
            "rounded-md p-1 hover:bg-white/70 shrink-0",
            speakingId === "daily-quote" ? "text-primary animate-pulse" : "text-muted-foreground",
          ].join(" ")}
          title="발음 듣기"
        >
          <Volume2 className="size-3.5" />
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">{data.pinyin}</p>
      <p className="text-sm">{data.ko}</p>
      {data.note && <p className="text-[11px] text-muted-foreground">{data.note}</p>}
    </div>
  );
}

/* ── 📊 학습 현황 ───────────────────────────────────────────────────────── */

function useWidgetStats(enabled: boolean) {
  return useQuery({
    queryKey: ["widget-stats"],
    queryFn: () => getWidgetStats({}),
    enabled,
    staleTime: 60_000,
  });
}

function StatsWidget({ signedIn }: { signedIn: boolean }) {
  const { data } = useWidgetStats(signedIn);
  if (!signedIn) {
    return (
      <p className="text-xs text-muted-foreground">
        <Link to="/auth" className="text-primary hover:underline">
          로그인
        </Link>
        하면 복습 현황과 스트릭이 보여요.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="text-2xl font-bold leading-none">{data ? data.dueCount : "…"}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">오늘 복습할 단어</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold leading-none">🔥{data ? data.streak : "…"}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">연속 학습일</div>
        </div>
      </div>
      {!!data?.dueCount && (
        <Link
          to="/vocabulary/review"
          className="block text-center text-xs font-semibold rounded-xl gradient-primary text-primary-foreground py-1.5 hover:opacity-90 transition"
        >
          지금 복습하기 →
        </Link>
      )}
      {data && data.dueCount === 0 && (
        <p className="text-[11px] text-emerald-700">오늘 복습 완료! 잘하고 있어요 ✨</p>
      )}
    </div>
  );
}

/* ── 📅 학습 캘린더 ─────────────────────────────────────────────────────── */

function CalendarWidget({ signedIn }: { signedIn: boolean }) {
  const { data } = useWidgetStats(signedIn);
  const active = new Set(data?.activityDates ?? []);

  const nowKst = new Date(Date.now() + 9 * 3600_000);
  const year = nowKst.getUTCFullYear();
  const month = nowKst.getUTCMonth(); // 0-based
  const todayKey = nowKst.toISOString().slice(0, 10);
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const key = (d: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold text-muted-foreground">
        {year}년 {month + 1}월
      </p>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {["일", "월", "화", "수", "목", "금", "토"].map((w) => (
          <span key={w} className="text-[9px] text-muted-foreground">
            {w}
          </span>
        ))}
        {cells.map((d, i) =>
          d === null ? (
            <span key={`e${i}`} />
          ) : (
            <span
              key={d}
              className={[
                "text-[10px] leading-none rounded-md py-1 relative",
                key(d) === todayKey ? "bg-primary/15 font-bold text-primary" : "",
                active.has(key(d)) ? "text-foreground" : "text-muted-foreground/70",
              ].join(" ")}
            >
              {d}
              {active.has(key(d)) && (
                <span className="absolute left-1/2 -translate-x-1/2 bottom-0 size-1 rounded-full bg-emerald-500" />
              )}
            </span>
          ),
        )}
      </div>
      {!signedIn && (
        <p className="text-[10px] text-muted-foreground">로그인하면 학습한 날이 표시돼요.</p>
      )}
    </div>
  );
}

/* ── ▶️ 이어보기 ────────────────────────────────────────────────────────── */

function ContinueWidget({ signedIn }: { signedIn: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["widget-continue"],
    queryFn: () => getContinueWatching({}),
    enabled: signedIn,
    staleTime: 30_000,
  });
  if (!signedIn)
    return <p className="text-xs text-muted-foreground">로그인하면 보던 영상이 이어져요.</p>;
  if (isLoading) return <p className="text-xs text-muted-foreground">불러오는 중…</p>;
  if (!data)
    return (
      <p className="text-xs text-muted-foreground">
        아직 시청 기록이 없어요.{" "}
        <Link to="/dramas" className="text-primary hover:underline">
          영상 학습 →
        </Link>
      </p>
    );
  const m = Math.floor(data.last_seconds / 60);
  const s = Math.floor(data.last_seconds % 60);
  return (
    <Link to="/dramas/$id" params={{ id: data.drama_id }} className="block group">
      {data.thumbnail_url && (
        <div className="aspect-video w-full rounded-xl overflow-hidden bg-black/10 mb-1.5">
          <img
            src={data.thumbnail_url}
            alt=""
            className="w-full h-full object-cover group-hover:scale-[1.02] transition"
          />
        </div>
      )}
      <p className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-primary transition">
        {data.title}
      </p>
      <div className="mt-1 h-1 rounded-full bg-white/60 overflow-hidden">
        <div className="h-full gradient-primary" style={{ width: `${data.percent}%` }} />
      </div>
      <p className="text-[10px] text-muted-foreground mt-0.5">
        {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}부터 이어보기 · {data.percent}%
      </p>
    </Link>
  );
}

/* ── 🎵 오늘의 학습송 ───────────────────────────────────────────────────── */

function DailySongWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["widget-daily-song"],
    queryFn: () => getDailySong({}),
    staleTime: Infinity,
  });
  if (isLoading) return <p className="text-xs text-muted-foreground">불러오는 중…</p>;
  if (!data) return <p className="text-xs text-muted-foreground">아직 학습송이 없어요.</p>;
  return (
    <Link to="/songs/$id" params={{ id: data.id }} className="flex items-center gap-3 group">
      <div className="size-12 rounded-xl overflow-hidden bg-primary/10 shrink-0 grid place-items-center">
        {data.cover_url ? (
          <img src={data.cover_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xl">🎵</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-snug line-clamp-1 group-hover:text-primary transition">
          {data.title}
        </p>
        {data.title_zh && (
          <p className="text-[11px] text-muted-foreground line-clamp-1">{data.title_zh}</p>
        )}
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
          {levelLabel(data.level)}
        </span>
      </div>
    </Link>
  );
}
