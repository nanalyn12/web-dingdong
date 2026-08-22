import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  ArrowLeft,
  Check,
  Eye,
  Headphones,
  Puzzle,
  Shuffle,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { shuffle } from "@/lib/shuffle";
import { useZhTts } from "@/lib/use-zh-tts";
import { useVocabStore } from "@/hooks/use-vocab-store";
import { srsStatus } from "@/lib/vocab-srs";
import { normalizeZh, type VocabItem } from "@/lib/vocab";

type Mode = "flash" | "cloze" | "match" | "dictate";

const searchSchema = z.object({
  mode: fallback(z.enum(["flash", "cloze", "match", "dictate"]), "flash").default("flash"),
  scope: fallback(z.enum(["due", "all"]), "due").default("due"),
  limit: fallback(z.number().int().min(4).max(50), 20).default(20),
});

export const Route = createFileRoute("/_app/vocabulary_/review")({
  head: () => ({
    meta: [
      { title: "단어 복습 — DingDong" },
      { name: "description", content: "간격 반복으로 오늘의 단어를 복습하세요." },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  component: ReviewPage,
});

const MODE_INFO: Record<Mode, { icon: React.ReactNode; label: string; desc: string }> = {
  flash: {
    icon: <Sparkles className="size-4" />,
    label: "플래시카드",
    desc: "카드를 뒤집어 스스로 채점",
  },
  cloze: {
    icon: <Puzzle className="size-4" />,
    label: "빈칸(병음→한자)",
    desc: "병음·뜻 힌트로 한자 입력",
  },
  match: { icon: <Shuffle className="size-4" />, label: "매칭", desc: "한자와 뜻을 짝지어요" },
  dictate: { icon: <Headphones className="size-4" />, label: "받아쓰기", desc: "듣고 한자를 입력" },
};

function ReviewPage() {
  const store = useVocabStore();
  const { mode, scope, limit } = Route.useSearch();
  const navigate = useNavigate({ from: "/vocabulary/review" });

  // Snapshot the queue on session start so grading doesn't reshuffle.
  const [queue, setQueue] = useState<VocabItem[] | null>(null);
  useEffect(() => {
    if (store.loading || queue) return;
    const now = new Date();
    const pool =
      scope === "due"
        ? store.items.filter(
            (v) => srsStatus(v.srs, now) === "due" || srsStatus(v.srs, now) === "new",
          )
        : store.items;
    const shuffled = shuffle(pool).slice(0, limit);
    setQueue(shuffled);
  }, [store.loading, store.items, scope, limit, queue]);

  if (store.loading || !queue) {
    return (
      <section className="glass rounded-3xl p-5 sm:p-8">
        <p className="text-muted-foreground">불러오는 중…</p>
      </section>
    );
  }

  if (queue.length === 0) {
    return (
      <section className="glass rounded-3xl p-10 text-center space-y-3">
        <div className="text-4xl">🎉</div>
        <p className="font-semibold">지금 복습할 단어가 없어요!</p>
        <Button asChild variant="outline">
          <Link to="/vocabulary">단어장으로</Link>
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link
          to="/vocabulary"
          className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:min-h-0"
        >
          <ArrowLeft className="size-4" /> 단어장
        </Link>
        <div className="flex gap-1 glass-soft rounded-full p-1">
          {(Object.keys(MODE_INFO) as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setQueue(null);
                navigate({ search: (p: z.infer<typeof searchSchema>) => ({ ...p, mode: m }) });
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs cursor-pointer",
                mode === m
                  ? "gradient-primary text-primary-foreground"
                  : "text-foreground/70 hover:text-foreground",
              )}
            >
              {MODE_INFO[m].icon}
              {MODE_INFO[m].label}
            </button>
          ))}
        </div>
      </div>

      {mode === "flash" && <FlashSession queue={queue} onGrade={store.gradeById} />}
      {mode === "cloze" && <ClozeSession queue={queue} onGrade={store.gradeById} />}
      {mode === "match" && <MatchSession queue={queue} onGrade={store.gradeById} />}
      {mode === "dictate" && <DictateSession queue={queue} onGrade={store.gradeById} />}
    </section>
  );
}

/* ═══ 공통 훅 ═══════════════════════════════════════════════════ */

function useProgress(total: number) {
  const [idx, setIdx] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const done = idx >= total;
  return {
    idx,
    correct,
    wrong,
    done,
    total,
    next: (ok: boolean) => {
      setIdx((n) => n + 1);
      if (ok) setCorrect((n) => n + 1);
      else setWrong((n) => n + 1);
    },
    reset: () => {
      setIdx(0);
      setCorrect(0);
      setWrong(0);
    },
  };
}

function SessionShell({
  progress,
  children,
}: {
  progress: ReturnType<typeof useProgress>;
  children: React.ReactNode;
}) {
  const pct = Math.min(100, (progress.idx / progress.total) * 100);
  if (progress.done) {
    return (
      <div className="glass rounded-3xl p-10 text-center space-y-3">
        <div className="text-4xl">✨</div>
        <p className="font-semibold text-lg">복습 완료!</p>
        <p className="text-sm text-muted-foreground">
          정답 <b className="text-emerald-600">{progress.correct}</b> · 오답{" "}
          <b className="text-rose-500">{progress.wrong}</b> · 다음 복습 일정에 반영되었어요.
        </p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={progress.reset}>
            다시 하기
          </Button>
          <Button asChild>
            <Link to="/vocabulary">목록으로</Link>
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          진행 {progress.idx + 1}/{progress.total}
        </span>
        <span>
          정답 {progress.correct} · 오답 {progress.wrong}
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
      {children}
    </div>
  );
}

/* ═══ 플래시카드 ════════════════════════════════════════════════ */

function FlashSession({
  queue,
  onGrade,
}: {
  queue: VocabItem[];
  onGrade: (id: string, g: 0 | 1 | 2) => Promise<void> | void;
}) {
  const p = useProgress(queue.length);
  const [flipped, setFlipped] = useState(false);
  const cur = queue[p.idx];
  const { speak } = useZhTts();

  const grade = async (g: 0 | 1 | 2) => {
    await onGrade(cur.id, g);
    setFlipped(false);
    p.next(g >= 1);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!cur) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "1") grade(0);
      else if (e.key === "2") grade(1);
      else if (e.key === "3") grade(2);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur]);

  return (
    <SessionShell progress={p}>
      {cur && (
        <div className="glass rounded-3xl p-5 sm:p-8 min-h-[280px] flex flex-col items-center justify-center gap-4">
          <button
            onClick={() => speak(cur.zh, cur.zh)}
            className="absolute right-6 mt-2 self-end p-2 rounded-full hover:bg-white/60"
            aria-label="발음 듣기"
          >
            <Volume2 className="size-4 text-primary" />
          </button>
          <p className="text-5xl font-bold" lang="zh-CN">
            {cur.zh}
          </p>
          {cur.pinyin && <p className="text-sm italic text-slate-500">{cur.pinyin}</p>}
          {flipped ? (
            <>
              <div className="h-px w-24 bg-slate-200" />
              <p className="text-lg text-slate-800">{cur.ko || "(뜻이 없어요)"}</p>
            </>
          ) : (
            <Button variant="outline" onClick={() => setFlipped(true)} className="gap-1">
              <Eye className="size-4" /> 뜻 보기 (Space)
            </Button>
          )}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="outline"
          onClick={() => grade(0)}
          className="border-rose-200 text-rose-600 hover:bg-rose-50"
        >
          모름 <span className="text-[10px] opacity-60 ml-1">(1)</span>
        </Button>
        <Button
          variant="outline"
          onClick={() => grade(1)}
          className="border-amber-200 text-amber-700 hover:bg-amber-50"
        >
          헷갈림 <span className="text-[10px] opacity-60 ml-1">(2)</span>
        </Button>
        <Button
          variant="outline"
          onClick={() => grade(2)}
          className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
        >
          암기 <span className="text-[10px] opacity-60 ml-1">(3)</span>
        </Button>
      </div>
    </SessionShell>
  );
}

/* ═══ 빈칸(병음 → 한자) ════════════════════════════════════════ */

function ClozeSession({
  queue,
  onGrade,
}: {
  queue: VocabItem[];
  onGrade: (id: string, g: 0 | 1 | 2) => Promise<void> | void;
}) {
  const p = useProgress(queue.length);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<null | "ok" | "no" | "hint">(null);
  const [hintUsed, setHintUsed] = useState(false);
  const cur = queue[p.idx];
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAnswer("");
    setFeedback(null);
    setHintUsed(false);
    inputRef.current?.focus();
  }, [p.idx]);

  const submit = async () => {
    if (!cur || feedback) return;
    const ok = normalizeZh(answer) === normalizeZh(cur.zh);
    const grade: 0 | 1 | 2 = ok ? (hintUsed ? 1 : 2) : 0;
    setFeedback(ok ? "ok" : "no");
    await onGrade(cur.id, grade);
    setTimeout(() => p.next(ok), 700);
  };

  return (
    <SessionShell progress={p}>
      {cur && (
        <div className="glass rounded-3xl p-4 sm:p-6 space-y-4">
          <div className="text-center space-y-1">
            <p className="text-xs text-muted-foreground">뜻</p>
            <p className="text-lg font-semibold">{cur.ko || "(뜻 정보 없음)"}</p>
            {cur.pinyin && (
              <p className="text-sm italic text-slate-500 mt-1">
                {hintUsed ? cur.pinyin : "___ ___ ___"}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="한자로 입력"
              lang="zh-CN"
              className="text-center text-xl h-12"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <Button onClick={submit} disabled={!answer || !!feedback}>
              확인
            </Button>
          </div>
          <div className="flex justify-between text-xs">
            <button
              className="text-primary hover:underline"
              onClick={() => setHintUsed(true)}
              disabled={hintUsed}
            >
              💡 병음 힌트
            </button>
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={async () => {
                setFeedback("no");
                await onGrade(cur.id, 0);
                setTimeout(() => p.next(false), 600);
              }}
            >
              모르겠어요
            </button>
          </div>
          {feedback === "ok" && (
            <p className="text-center text-emerald-600 font-semibold flex items-center justify-center gap-1">
              <Check className="size-4" /> 정답! {cur.zh}
            </p>
          )}
          {feedback === "no" && (
            <p className="text-center text-rose-600 font-semibold flex items-center justify-center gap-1">
              <X className="size-4" /> 정답: {cur.zh}
            </p>
          )}
        </div>
      )}
    </SessionShell>
  );
}

/* ═══ 매칭 ════════════════════════════════════════════════════ */

function MatchSession({
  queue,
  onGrade,
}: {
  queue: VocabItem[];
  onGrade: (id: string, g: 0 | 1 | 2) => Promise<void> | void;
}) {
  const CHUNK = 5;
  const chunks = useMemo(() => {
    const arr: VocabItem[][] = [];
    const pool = queue.filter((v) => v.ko);
    for (let i = 0; i < pool.length; i += CHUNK) arr.push(pool.slice(i, i + CHUNK));
    return arr;
  }, [queue]);
  const [chunkIdx, setChunkIdx] = useState(0);
  // Memoised because the `?? []` fallback would otherwise hand `kos` a fresh
  // array on every render past the last chunk, reshuffling it for no reason.
  const chunk = useMemo(() => chunks[chunkIdx] ?? [], [chunks, chunkIdx]);
  const [selectedZh, setSelectedZh] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrongFlash, setWrongFlash] = useState<string | null>(null);
  const [wrongCount, setWrongCount] = useState<Record<string, number>>({});
  const kos = useMemo(() => shuffle(chunk), [chunk]);

  useEffect(() => {
    setSelectedZh(null);
    setMatched(new Set());
    setWrongCount({});
  }, [chunkIdx]);

  const done = matched.size === chunk.length && chunk.length > 0;

  const pickZh = (id: string) => {
    if (matched.has(id)) return;
    setSelectedZh(id);
  };

  const pickKo = async (id: string) => {
    if (!selectedZh || matched.has(id)) return;
    if (selectedZh === id) {
      matched.add(id);
      setMatched(new Set(matched));
      setSelectedZh(null);
      await onGrade(id, (wrongCount[id] ?? 0) > 0 ? 1 : 2);
    } else {
      setWrongFlash(id);
      setWrongCount((w) => ({ ...w, [selectedZh]: (w[selectedZh] ?? 0) + 1 }));
      setTimeout(() => setWrongFlash(null), 400);
    }
  };

  if (chunks.length === 0) {
    return (
      <div className="glass rounded-3xl p-5 sm:p-8 text-center text-muted-foreground text-sm">
        뜻이 없는 단어들이라 매칭을 만들 수 없어요.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          세트 {chunkIdx + 1}/{chunks.length}
        </span>
        <span>
          {matched.size}/{chunk.length} 매칭
        </span>
      </div>
      <div className="glass rounded-3xl p-4 grid grid-cols-2 gap-3">
        <div className="space-y-2">
          {chunk.map((v) => (
            <button
              key={v.id}
              onClick={() => pickZh(v.id)}
              disabled={matched.has(v.id)}
              className={cn(
                "w-full text-left rounded-2xl border p-3 text-lg font-semibold transition-all",
                matched.has(v.id) && "opacity-40 line-through border-emerald-200 bg-emerald-50",
                selectedZh === v.id && "border-primary ring-2 ring-primary/40 bg-primary/5",
                !matched.has(v.id) &&
                  selectedZh !== v.id &&
                  "border-slate-200 bg-white hover:bg-slate-50 cursor-pointer",
              )}
              lang="zh-CN"
            >
              {v.zh}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {kos.map((v) => (
            <button
              key={v.id}
              onClick={() => pickKo(v.id)}
              disabled={matched.has(v.id)}
              className={cn(
                "w-full text-left rounded-2xl border p-3 text-sm transition-all",
                matched.has(v.id) && "opacity-40 line-through border-emerald-200 bg-emerald-50",
                wrongFlash === v.id && "border-rose-300 bg-rose-50 animate-pulse",
                !matched.has(v.id) &&
                  wrongFlash !== v.id &&
                  "border-slate-200 bg-white hover:bg-slate-50 cursor-pointer",
              )}
            >
              {v.ko}
            </button>
          ))}
        </div>
      </div>
      {done && (
        <div className="flex justify-end">
          <Button
            onClick={() =>
              chunkIdx + 1 < chunks.length ? setChunkIdx(chunkIdx + 1) : setChunkIdx(chunks.length)
            }
          >
            {chunkIdx + 1 < chunks.length ? "다음 세트" : "완료"}
          </Button>
        </div>
      )}
      {chunkIdx >= chunks.length && (
        <div className="glass rounded-3xl p-5 sm:p-8 text-center space-y-2">
          <div className="text-3xl">✨</div>
          <p className="font-semibold">매칭 완료!</p>
          <Button asChild>
            <Link to="/vocabulary">목록으로</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

/* ═══ 받아쓰기 ═══════════════════════════════════════════════════ */

function DictateSession({
  queue,
  onGrade,
}: {
  queue: VocabItem[];
  onGrade: (id: string, g: 0 | 1 | 2) => Promise<void> | void;
}) {
  const p = useProgress(queue.length);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<null | "ok" | "no">(null);
  const cur = queue[p.idx];
  const { speak } = useZhTts();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAnswer("");
    setFeedback(null);
    if (cur) setTimeout(() => speak(cur.zh, cur.zh), 200);
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.idx]);

  const submit = async () => {
    if (!cur || feedback) return;
    const ok = normalizeZh(answer) === normalizeZh(cur.zh);
    setFeedback(ok ? "ok" : "no");
    await onGrade(cur.id, ok ? 2 : 0);
    setTimeout(() => p.next(ok), 800);
  };

  return (
    <SessionShell progress={p}>
      {cur && (
        <div className="glass rounded-3xl p-4 sm:p-6 space-y-4 text-center">
          <p className="text-xs text-muted-foreground">🎧 들리는 대로 한자로 입력하세요</p>
          <Button variant="outline" className="gap-2 mx-auto" onClick={() => speak(cur.zh, cur.zh)}>
            <Volume2 className="size-4" /> 다시 듣기
          </Button>
          <div className="flex gap-2 max-w-sm mx-auto">
            <Input
              ref={inputRef}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="한자로 입력"
              lang="zh-CN"
              className="text-center text-xl h-12"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <Button onClick={submit} disabled={!answer || !!feedback}>
              확인
            </Button>
          </div>
          {feedback === "ok" && (
            <p className="text-emerald-600 font-semibold flex items-center justify-center gap-1">
              <Check className="size-4" /> 정답! {cur.zh} ({cur.pinyin})
            </p>
          )}
          {feedback === "no" && (
            <p className="text-rose-600 font-semibold flex items-center justify-center gap-1">
              <X className="size-4" /> 정답: {cur.zh} ({cur.pinyin})
            </p>
          )}
        </div>
      )}
    </SessionShell>
  );
}
