import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles,
  Volume2,
  Mic,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Lightbulb,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useZhTts } from "@/lib/use-zh-tts";
import { scorePronunciation } from "@/lib/vocab";
import {
  generateVocabPractice,
  type VocabExample,
  type VocabPractice,
} from "@/lib/vocab-practice.functions";

type SR = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
function getRecognition(): SR | null {
  if (typeof window === "undefined") return null;
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) return null;
  const r: SR = new Ctor();
  r.lang = "zh-CN";
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.continuous = false;
  return r;
}

type Word = {
  zh: string;
  pinyin?: string | null;
  ko?: string | null;
  emoji?: string | null;
};

export function VocabPracticeDialog({
  word,
  open,
  onOpenChange,
}: {
  word: Word | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const callGen = useServerFn(generateVocabPractice);
  const { speak, speakingId } = useZhTts();
  const [tab, setTab] = useState("examples");

  const gen = useMutation({
    mutationFn: (w: Word) =>
      callGen({ data: { zh: w.zh, pinyin: w.pinyin ?? null, ko: w.ko ?? null } }),
  });

  useEffect(() => {
    if (open && word) {
      setTab("examples");
      gen.reset();
      gen.mutate(word);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, word?.zh]);

  if (!word) return null;
  const data = gen.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white/95 backdrop-blur-xl border-white rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="text-2xl">{word.emoji || "📝"}</span>
            <div className="flex flex-col items-start text-left">
              <span className="text-2xl font-bold text-slate-900" lang="zh-CN">
                {word.zh}
              </span>
              {word.pinyin && (
                <span className="text-xs italic text-slate-500">{word.pinyin}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => speak(word.zh, word.zh)}
              className={cn(
                "ml-1 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 px-2.5 py-1 text-xs cursor-pointer",
                speakingId === word.zh && "animate-pulse bg-primary/30",
              )}
            >
              <Volume2 className="size-3.5" /> 듣기
            </button>
          </DialogTitle>
          <DialogDescription className="text-slate-600">
            {word.ko || "AI가 학습 자료를 만들어드려요."}
          </DialogDescription>
        </DialogHeader>

        {gen.isPending && (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
            <Sparkles className="size-4 animate-pulse text-primary" />
            AI가 학습 자료를 만들고 있어요...
          </div>
        )}

        {gen.error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm p-3">
            생성 실패: {(gen.error as Error).message}
            <Button size="sm" variant="ghost" className="ml-2" onClick={() => gen.mutate(word)}>
              다시 시도
            </Button>
          </div>
        )}

        {data && (
          <>
            {/* meaning + tip */}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-2xl bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-100 p-3">
                <p className="text-[11px] font-bold text-rose-600 uppercase tracking-wider mb-1">의미</p>
                <p className="text-sm text-slate-800">{data.meaning_ko}</p>
              </div>
              {data.tip && (
                <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-100 p-3">
                  <p className="text-[11px] font-bold text-amber-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Lightbulb className="size-3" /> 사용 팁
                  </p>
                  <p className="text-sm text-slate-800">{data.tip}</p>
                </div>
              )}
            </div>

            {data.collocations.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {data.collocations.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => speak(c, c)}
                    className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 cursor-pointer"
                    lang="zh-CN"
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            <Tabs value={tab} onValueChange={setTab} className="w-full mt-2">
              <TabsList className="grid grid-cols-3 bg-slate-100/70 rounded-xl p-1">
                <TabsTrigger value="examples" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  📚 예문
                </TabsTrigger>
                <TabsTrigger value="flashcard" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  🃏 플래시카드
                </TabsTrigger>
                <TabsTrigger value="quiz" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  🎯 퀴즈
                </TabsTrigger>
              </TabsList>

              <TabsContent value="examples" className="mt-3">
                <ExamplesPanel data={data} speak={speak} speakingId={speakingId} />
              </TabsContent>
              <TabsContent value="flashcard" className="mt-3">
                <FlashcardPanel
                  word={word}
                  data={data}
                  speak={speak}
                  speakingId={speakingId}
                />
              </TabsContent>
              <TabsContent value="quiz" className="mt-3">
                <QuizPanel data={data} speak={speak} speakingId={speakingId} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ============== Examples by level ============== */
function ExamplesPanel({
  data,
  speak,
  speakingId,
}: {
  data: VocabPractice;
  speak: (t: string, id?: string) => void;
  speakingId: string | null;
}) {
  const [level, setLevel] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const tones = {
    beginner: "from-emerald-100 to-emerald-50 border-emerald-200 text-emerald-700",
    intermediate: "from-sky-100 to-sky-50 border-sky-200 text-sky-700",
    advanced: "from-violet-100 to-violet-50 border-violet-200 text-violet-700",
  } as const;
  const labels = { beginner: "입문", intermediate: "중급", advanced: "고급" } as const;
  const list: VocabExample[] = data.examples[level] ?? [];
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {(["beginner", "intermediate", "advanced"] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLevel(l)}
            className={cn(
              "flex-1 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer",
              level === l
                ? `bg-gradient-to-br ${tones[l]} shadow-sm`
                : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50",
            )}
          >
            {labels[l]}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-6">예문이 없어요.</p>
      ) : (
        <div className="space-y-2">
          {list.map((ex, i) => (
            <div
              key={i}
              className="p-3 rounded-2xl bg-white border border-slate-100 shadow-[0_4px_16px_rgb(0,0,0,0.03)]"
            >
              <div className="flex items-start gap-2">
                <p
                  className="text-base font-semibold text-slate-900 flex-1 leading-snug"
                  lang="zh-CN"
                >
                  {ex.zh}
                </p>
                <button
                  type="button"
                  onClick={() => speak(ex.zh, ex.zh)}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 px-2 py-0.5 text-[11px] cursor-pointer",
                    speakingId === ex.zh && "animate-pulse bg-primary/30",
                  )}
                >
                  <Volume2 className="size-3" />
                </button>
              </div>
              {ex.pinyin && <p className="text-[11px] italic text-slate-500 mt-0.5">{ex.pinyin}</p>}
              {ex.ko && <p className="text-xs text-slate-600 mt-1">{ex.ko}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============== Flashcard + pronunciation test ============== */
function FlashcardPanel({
  word,
  data,
  speak,
  speakingId,
}: {
  word: Word;
  data: VocabPractice;
  speak: (t: string, id?: string) => void;
  speakingId: string | null;
}) {
  // Combine main word + all examples into deck.
  const deck: VocabExample[] = [
    { zh: word.zh, pinyin: word.pinyin ?? "", ko: word.ko ?? data.meaning_ko ?? "" },
    ...data.examples.beginner,
    ...data.examples.intermediate,
    ...data.examples.advanced,
  ];
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const recRef = useRef<SR | null>(null);

  useEffect(() => {
    setFlipped(false);
    setHeard(null);
    setScore(null);
    setErr(null);
  }, [idx]);
  useEffect(() => () => recRef.current?.abort?.(), []);

  const card = deck[idx];
  if (!card) return null;

  function start() {
    const rec = getRecognition();
    if (!rec) {
      setErr("이 브라우저는 음성 인식을 지원하지 않아요. (Chrome 권장)");
      return;
    }
    recRef.current = rec;
    setErr(null);
    setHeard(null);
    setScore(null);
    rec.onresult = (e: any) => {
      const t = e?.results?.[0]?.[0]?.transcript ?? "";
      setHeard(t);
      setScore(scorePronunciation(card.zh, t));
    };
    rec.onerror = (e: any) =>
      setErr(e?.error === "not-allowed" ? "마이크 권한이 필요해요." : "다시 시도해주세요.");
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  const pct = score == null ? null : Math.round(score * 100);
  const pass = pct != null && pct >= 70;

  return (
    <div className="space-y-3">
      {/* Card */}
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="w-full min-h-[180px] rounded-3xl bg-gradient-to-br from-rose-50 via-pink-50 to-sky-50 border border-white shadow-[0_12px_40px_-12px_rgba(244,114,182,0.25)] p-6 text-center transition-transform hover:scale-[1.01] cursor-pointer"
      >
        {!flipped ? (
          <>
            <p className="text-3xl sm:text-4xl font-semibold text-slate-900 leading-tight" lang="zh-CN">
              {card.zh}
            </p>
            <p className="text-xs text-slate-400 mt-3">탭하면 뜻이 나와요</p>
          </>
        ) : (
          <>
            {card.pinyin && (
              <p className="text-sm italic text-slate-500">{card.pinyin}</p>
            )}
            <p className="text-lg sm:text-xl font-semibold text-slate-800 mt-2">{card.ko}</p>
            <p className="text-xs text-slate-400 mt-3">탭하면 한자가 나와요</p>
          </>
        )}
      </button>

      {/* Nav */}
      <div className="flex items-center justify-between gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
        >
          <ChevronLeft className="size-4" /> 이전
        </Button>
        <span className="text-xs text-slate-500 font-semibold">
          {idx + 1} / {deck.length}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setIdx((i) => Math.min(deck.length - 1, i + 1))}
          disabled={idx === deck.length - 1}
        >
          다음 <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Pronunciation */}
      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            🎤 따라 말하기
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => speak(card.zh, card.zh)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 px-2.5 py-1 text-xs cursor-pointer",
                speakingId === card.zh && "animate-pulse bg-primary/30",
              )}
            >
              <Volume2 className="size-3" /> 듣기
            </button>
            <button
              type="button"
              onClick={listening ? () => recRef.current?.stop() : start}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold cursor-pointer",
                listening
                  ? "bg-rose-500 text-white animate-pulse"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50",
              )}
            >
              <Mic className="size-3" />
              {listening ? "듣는 중…" : "말하기"}
            </button>
          </div>
        </div>
        {err && <p className="text-[11px] text-rose-600">{err}</p>}
        {heard != null && (
          <div className="space-y-1.5">
            <p className="text-xs text-slate-600">
              들린 말: <span className="font-semibold text-slate-800" lang="zh-CN">{heard || "—"}</span>
            </p>
            {pct != null && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      pass
                        ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
                        : "bg-gradient-to-r from-amber-400 to-rose-400",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span
                  className={cn(
                    "text-xs font-bold inline-flex items-center gap-0.5",
                    pass ? "text-emerald-600" : "text-amber-600",
                  )}
                >
                  {pass ? <Check className="size-3" /> : <X className="size-3" />}
                  {pct}점
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============== Mini quiz ============== */
function QuizPanel({
  data,
  speak,
  speakingId,
}: {
  data: VocabPractice;
  speak: (t: string, id?: string) => void;
  speakingId: string | null;
}) {
  const [step, setStep] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);

  if (data.quiz.length === 0) {
    return <p className="text-sm text-slate-500 text-center py-6">퀴즈가 없어요.</p>;
  }

  if (done) {
    const pct = Math.round((correct / data.quiz.length) * 100);
    return (
      <div className="text-center space-y-3 py-6">
        <div className="text-5xl">{pct === 100 ? "🎉" : pct >= 50 ? "👏" : "💪"}</div>
        <p className="text-2xl font-bold text-slate-900">
          {correct} / {data.quiz.length}
        </p>
        <p className="text-sm text-slate-600">
          {pct === 100 ? "완벽해요!" : pct >= 50 ? "잘했어요!" : "다시 한번 도전해봐요."}
        </p>
        <Button
          onClick={() => {
            setStep(0);
            setCorrect(0);
            setDone(false);
          }}
          className="mt-2"
        >
          <RotateCcw className="size-4 mr-1" /> 다시 풀기
        </Button>
      </div>
    );
  }

  const q = data.quiz[step];
  function next(isRight: boolean) {
    if (isRight) setCorrect((c) => c + 1);
    if (step + 1 >= data.quiz.length) setDone(true);
    else setStep((s) => s + 1);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-rose-400 to-pink-400 transition-all"
            style={{ width: `${((step + 1) / data.quiz.length) * 100}%` }}
          />
        </div>
        <span className="text-[11px] text-slate-500 font-semibold">
          {step + 1} / {data.quiz.length}
        </span>
      </div>

      {q.type === "meaning" ? (
        <MeaningQ q={q} onAnswer={next} />
      ) : (
        <FillQ q={q} onAnswer={next} speak={speak} speakingId={speakingId} />
      )}
    </div>
  );
}

function MeaningQ({
  q,
  onAnswer,
}: {
  q: Extract<VocabPractice["quiz"][number], { type: "meaning" }>;
  onAnswer: (right: boolean) => void;
}) {
  const [pick, setPick] = useState<number | null>(null);
  const options = Array.isArray(q.options) ? q.options : [];
  return (
    <div className="space-y-3">
      <p className="text-base font-semibold text-slate-800">{q.question_ko}</p>
      <div className="grid gap-2">
        {options.map((opt, i) => {
          const isPick = pick === i;
          const isRight = i === q.correct;
          const reveal = pick !== null;
          return (
            <button
              key={i}
              type="button"
              disabled={reveal}
              onClick={() => setPick(i)}
              className={cn(
                "text-left px-4 py-2.5 rounded-2xl border transition-all cursor-pointer",
                !reveal && "bg-white border-slate-200 hover:bg-slate-50",
                reveal && isRight && "bg-emerald-50 border-emerald-300 text-emerald-800",
                reveal && isPick && !isRight && "bg-rose-50 border-rose-300 text-rose-800",
                reveal && !isPick && !isRight && "bg-white border-slate-100 text-slate-400",
              )}
            >
              <span className="font-semibold mr-2 text-slate-500">{String.fromCharCode(65 + i)}.</span>
              {opt}
            </button>
          );
        })}
      </div>
      {pick !== null && (
        <Button className="w-full" onClick={() => onAnswer(pick === q.correct)}>
          다음
        </Button>
      )}
    </div>
  );
}

function FillQ({
  q,
  onAnswer,
  speak,
  speakingId,
}: {
  q: Extract<VocabPractice["quiz"][number], { type: "fill" }>;
  onAnswer: (right: boolean) => void;
  speak: (t: string, id?: string) => void;
  speakingId: string | null;
}) {
  const [val, setVal] = useState("");
  const [reveal, setReveal] = useState(false);
  const right = val.trim() === (q.answer ?? "").trim();
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">빈칸에 들어갈 한자를 입력하세요.</p>
      <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-indigo-50 border border-sky-100 p-3">
        <div className="flex items-start gap-2">
          <p className="text-base font-semibold text-slate-900 flex-1" lang="zh-CN">
            {q.blanked_zh}
          </p>
          <button
            type="button"
            onClick={() => speak(q.sentence_zh, q.sentence_zh)}
            className={cn(
              "shrink-0 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 px-2 py-0.5 text-[11px] cursor-pointer",
              speakingId === q.sentence_zh && "animate-pulse bg-primary/30",
            )}
          >
            <Volume2 className="size-3" />
          </button>
        </div>
        {q.pinyin && <p className="text-[11px] italic text-slate-500 mt-1">{q.pinyin}</p>}
        {q.ko && <p className="text-xs text-slate-600 mt-1">{q.ko}</p>}
      </div>
      <Input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="정답 한자"
        disabled={reveal}
        onKeyDown={(e) => {
          if (e.key === "Enter" && val) setReveal(true);
        }}
      />
      {!reveal ? (
        <Button className="w-full" onClick={() => setReveal(true)} disabled={!val}>
          제출
        </Button>
      ) : (
        <>
          <div
            className={cn(
              "rounded-2xl p-3 text-sm border",
              right
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-800",
            )}
          >
            {right ? (
              <p className="font-semibold flex items-center gap-1">
                <Check className="size-4" /> 정답!
              </p>
            ) : (
              <p>
                정답: <span className="font-bold" lang="zh-CN">{q.answer}</span>
              </p>
            )}
          </div>
          <Button className="w-full" onClick={() => onAnswer(right)}>
            다음
          </Button>
        </>
      )}
    </div>
  );
}
