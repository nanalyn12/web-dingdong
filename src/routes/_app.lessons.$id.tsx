import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronLeft,
  ChevronRight,
  Info,
  RotateCcw,
  Volume2,
  Sparkles,
  Lightbulb,
  BookOpen,
  Image as ImageIcon,
  Check,
  X,
  Quote,
  BookMarked,
  MessageSquareQuote,
  AlertTriangle,
  Target,
  Pencil,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { RichLessonContent } from "@/components/lesson-rich-content";
import { LessonPdfButton } from "@/components/lesson-pdf-button";
import { loadProgress, saveProgress } from "@/lib/lesson-progress";
import { useZhTts } from "@/lib/use-zh-tts";
import { generateLessonComicImages } from "@/lib/lesson-images.functions";
import { KeyExpressionCard } from "@/components/key-expression-card";

export const Route = createFileRoute("/_app/lessons/$id")({
  head: () => ({ meta: [{ title: "레슨 — DingDong" }] }),
  component: LessonPage,
});

type Level = "beginner" | "intermediate" | "advanced";

type KeyExpression = { zh: string; pinyin?: string; ko: string; hsk?: number; emoji?: string };

type Dialogue = { speaker?: string; zh: string; pinyin?: string; ko: string };

type Slide = {
  title?: string;
  subtitle?: string;
  content?: string;
  key_point?: string;
  bullets?: string[];
  vocab?: Array<{ zh: string; pinyin?: string; ko: string }>;
  examples?: Array<{ zh: string; pinyin?: string; ko: string }>;
  usage_context?: string;
  common_mistake?: string;
  practice?: string | { question?: string; answer?: string };
  tip?: string;
  image_prompt?: string;
  image_url?: string;
};

type ComicPanel = {
  narration?: string;
  image_prompt?: string;
  image_url?: string;
  lines?: Array<{ speaker?: string; zh: string; pinyin?: string; ko: string }>;
};

type CulturalCard = {
  title?: string;
  description?: string;
} & Record<string, unknown>;

type QuizChoice = {
  type: "choice";
  question_ko: string;
  question_zh?: string;
  options: string[];
  correct: number;
  explanation?: string;
};
type QuizFill = {
  type: "fill";
  question_ko: string;
  sentence_zh: string;
  answer: string;
  hint?: string;
  explanation?: string;
};
type QuizOrder = {
  type: "order";
  question_ko: string;
  words: string[];
  correct_order: number[];
  answer_text?: string;
  explanation?: string;
};
type QuizItem = QuizChoice | QuizFill | QuizOrder;

type LessonRow = {
  id: string;
  title: string;
  content_md: string | null;
  level: Level | null;
  key_expressions: KeyExpression[];
  dialogues: Dialogue[];
  slides: Slide[];
  quiz: QuizItem[];
  comic_panels: ComicPanel[];
  cultural_note: CulturalCard | null;
  cultural_snippet: CulturalCard | null;
};

const HAN_RE = /[\u3400-\u9fff]/;
const hasHan = (s: string | undefined | null) => !!s && HAN_RE.test(s);

function normalizeMarkdown(md: string) {
  return md.replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
}

/* ---------- Reusable TTS button (Chinese only) ---------- */
function TtsButton({
  text,
  speak,
  active,
  size = "md",
  label,
}: {
  text: string;
  speak: (t: string, id?: string) => void;
  active: boolean;
  size?: "sm" | "md";
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => speak(text, text)}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0 cursor-pointer",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        active && "animate-pulse bg-primary/30",
      )}
      aria-label={`중국어 듣기: ${text}`}
    >
      <Volume2 className={size === "sm" ? "size-3" : "size-3.5"} />
      {label ?? "듣기"}
    </button>
  );
}

/* ============================================================== */
function LessonPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const callGenImages = useServerFn(generateLessonComicImages);

  const { data: lesson, isLoading, error } = useQuery({
    queryKey: ["lesson", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lessons")
        .select(
          "id, title, content_md, level, key_expressions, dialogues, slides, quiz, comic_panels, cultural_note, cultural_snippet",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as LessonRow;
    },
  });

  const [tab, setTab] = useState<string>(
    () => loadProgress(id).completedTabs[0] ?? "content",
  );
  const [completedTabs, setCompletedTabs] = useState<string[]>(
    () => loadProgress(id).completedTabs,
  );
  const [quizScore, setQuizScore] = useState<
    { correct: number; total: number } | undefined
  >(() => loadProgress(id).quizScore);

  useEffect(() => {
    if (!completedTabs.includes(tab)) {
      const next = [...completedTabs, tab];
      setCompletedTabs(next);
      saveProgress(id, { completedTabs: next });
    }
  }, [tab, completedTabs, id]);

  const { speak, speakingId } = useZhTts();

  const genImagesMut = useMutation({
    mutationFn: () => callGenImages({ data: { lessonId: id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lesson", id] }),
  });

  if (isLoading) {
    return (
      <section className="glass rounded-3xl p-8">
        <p className="text-muted-foreground">불러오는 중...</p>
      </section>
    );
  }
  if (error || !lesson) {
    return (
      <section className="glass rounded-3xl p-8">
        <p className="text-destructive">강의를 찾을 수 없습니다.</p>
      </section>
    );
  }

  const level: Level = lesson.level ?? "beginner";
  const showPinyin = level === "beginner";
  const levelLabel =
    level === "beginner"
      ? "입문 (HSK 1~3급)"
      : level === "intermediate"
        ? "중급 (HSK 4~6급)"
        : "고급 (HSK 7~9급)";

  return (
    <section className="glass rounded-3xl p-6 sm:p-8 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{lesson.title}</h1>
          <p className="text-xs text-muted-foreground mt-1">난이도: {levelLabel}</p>
        </div>
        <LessonPdfButton
          lessonTitle={lesson.title}
          level={levelLabel}
          keyExpressions={lesson.key_expressions ?? []}
          completedTabs={completedTabs}
          quizScore={quizScore}
        />
      </header>

      <div className="flex items-start gap-2 rounded-2xl bg-sky-50/60 dark:bg-sky-950/30 border border-sky-200/60 px-3 py-2 text-xs text-sky-900 dark:text-sky-100">
        <Info className="size-4 mt-0.5 shrink-0" />
        <span>
          중국어 옆 🔊 버튼을 누르면 발음을 들을 수 있어요. 게스트 진도와 퀴즈 점수는
          이 브라우저에만 저장됩니다.
        </span>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="flex flex-wrap gap-1 h-auto bg-white/60 backdrop-blur-xl rounded-2xl border border-white/70 shadow-sm p-1">
          <TabsTrigger value="key" className="data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 text-slate-500 font-semibold rounded-xl">핵심표현</TabsTrigger>
          <TabsTrigger value="content" className="data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 text-slate-500 font-semibold rounded-xl">본문</TabsTrigger>
          <TabsTrigger value="dialogue" className="data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 text-slate-500 font-semibold rounded-xl">실전대화</TabsTrigger>
          <TabsTrigger value="slides" className="data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 text-slate-500 font-semibold rounded-xl">슬라이드</TabsTrigger>
          <TabsTrigger value="quiz" className="data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 text-slate-500 font-semibold rounded-xl">퀴즈</TabsTrigger>
        </TabsList>

        <TabsContent value="key" className="mt-4">
          <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
            {(lesson.key_expressions ?? []).map((k, i) => {
              const tones = [
                { tag: "bg-rose-50 text-rose-600 border-rose-100", hover: "hover:shadow-[0_20px_40px_-12px_rgba(244,114,182,0.25)]", pin: "text-rose-500", ring: "ring-1 ring-rose-100" },
                { tag: "bg-indigo-50 text-indigo-600 border-indigo-100", hover: "hover:shadow-[0_20px_40px_-12px_rgba(99,102,241,0.25)]", pin: "text-indigo-500", ring: "ring-1 ring-indigo-100" },
                { tag: "bg-emerald-50 text-emerald-600 border-emerald-100", hover: "hover:shadow-[0_20px_40px_-12px_rgba(34,197,94,0.25)]", pin: "text-emerald-500", ring: "ring-1 ring-emerald-100" },
                { tag: "bg-sky-50 text-sky-600 border-sky-100", hover: "hover:shadow-[0_20px_40px_-12px_rgba(14,165,233,0.25)]", pin: "text-sky-500", ring: "ring-1 ring-sky-100" },
              ];
              const t = tones[i % tones.length];
              return (
                <KeyExpressionCard
                  key={i}
                  k={k}
                  index={i}
                  tone={t}
                  lessonId={id}
                  speak={speak}
                  speaking={speakingId === k.zh}
                />
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="content" className="space-y-6">
          <ContentMarkdown
            md={lesson.content_md ?? ""}
            speak={speak}
            speakingId={speakingId}
            showPinyin={showPinyin}
          />

          {/* Comic strip */}
          {(lesson.comic_panels ?? []).length > 0 && (
            <ComicStrip
              panels={lesson.comic_panels ?? []}
              speak={speak}
              speakingId={speakingId}
              showPinyin={showPinyin}
              onGenerate={() => genImagesMut.mutate()}
              generating={genImagesMut.isPending}
              error={genImagesMut.error?.message}
            />
          )}

          {/* Cultural cards */}
          {(lesson.cultural_note || lesson.cultural_snippet) && (
            <div className="grid gap-3 md:grid-cols-2">
              {lesson.cultural_note && (
                <CulturalCardView
                  card={lesson.cultural_note}
                  tone="lavender"
                  icon={<BookOpen className="size-4" />}
                  badge="문화 노트"
                />
              )}
              {lesson.cultural_snippet && (
                <CulturalCardView
                  card={lesson.cultural_snippet}
                  tone="mint"
                  icon={<Lightbulb className="size-4" />}
                  badge="문화 팁"
                />
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="dialogue" className="space-y-3">
          <DialogueList
            dialogues={lesson.dialogues ?? []}
            showPinyin={showPinyin}
            speak={speak}
            speakingId={speakingId}
          />
        </TabsContent>

        <TabsContent value="slides">
          <SlidesCarousel
            slides={lesson.slides ?? []}
            showPinyin={showPinyin}
            speak={speak}
            speakingId={speakingId}
          />
        </TabsContent>

        <TabsContent value="quiz">
          <QuizRunner
            quiz={lesson.quiz ?? []}
            onScore={(correct, total) => {
              setQuizScore({ correct, total });
              saveProgress(id, {
                quizScore: { correct, total },
                completedTabs: ["quiz"],
              });
            }}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}

/* ---------------- Content markdown with inline TTS ---------------- */

function ContentMarkdown({
  md,
  speak,
  speakingId,
  showPinyin,
}: {
  md: string;
  speak: (t: string, id?: string) => void;
  speakingId: string | null;
  showPinyin: boolean;
}) {
  const normalized = useMemo(() => normalizeMarkdown(md), [md]);
  const allChinese = useMemo(() => {
    const m = normalized.match(
      /[\u3400-\u9fff][\u3400-\u9fff\u3000-\u303f\uff00-\uffef，。！？、；：""''…—\s]*/g,
    );
    return m ? m.join("").trim() : "";
  }, [normalized]);

  return (
    <div className="relative group">
      <div className="absolute -inset-1 bg-gradient-to-r from-rose-200/60 via-sky-200/40 to-indigo-200/60 rounded-[2rem] blur opacity-30 group-hover:opacity-50 transition duration-700 pointer-events-none"></div>
      <article className="relative bg-white/90 backdrop-blur-2xl p-5 sm:p-8 rounded-[1.8rem] border border-white shadow-[0_25px_60px_-15px_rgba(15,23,42,0.15)]">
        {/* Editorial header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-gradient-to-r from-rose-500 to-indigo-500 text-white text-[11px] font-bold rounded-full tracking-[0.2em] uppercase shadow-sm">
              본문 · Reading
            </span>
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-400"></div>
              <div className="w-1.5 h-1.5 rounded-full bg-sky-400"></div>
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
            </div>
          </div>
          {allChinese && (
            <TtsButton
              text={allChinese}
              speak={speak}
              active={speakingId === allChinese}
              label="전체 듣기"
            />
          )}
        </div>

        <RichLessonContent
          md={normalized}
          speak={speak}
          speakingId={speakingId}
          showPinyin={showPinyin}
          variant="content"
        />
      </article>
    </div>
  );
}



/* ---------------- Cultural Card ---------------- */

function CulturalCardView({
  card,
  tone,
  icon,
  badge,
}: {
  card: CulturalCard;
  tone: "lavender" | "mint";
  icon: ReactNode;
  badge: string;
}) {
  const desc =
    (typeof card.description === "string" && card.description) ||
    (typeof card.text === "string" && (card.text as string)) ||
    "";
  const title = (typeof card.title === "string" && card.title) || badge;
  const toneCls =
    tone === "lavender"
      ? "from-purple-100/70 to-pink-100/40 border-purple-200/60"
      : "from-emerald-100/70 to-sky-100/40 border-emerald-200/60";
  return (
    <div
      className={cn(
        "rounded-3xl border bg-gradient-to-br p-5 backdrop-blur-sm",
        toneCls,
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-foreground/70">
          {icon}
          {badge}
        </span>
      </div>
      <h4 className="text-lg font-bold mb-2">{title}</h4>
      <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/85">
        {desc}
      </p>
    </div>
  );
}

/* ---------------- Comic Strip ---------------- */

function ComicStrip({
  panels,
  speak,
  speakingId,
  showPinyin,
  onGenerate,
  generating,
  error,
}: {
  panels: ComicPanel[];
  speak: (t: string, id?: string) => void;
  speakingId: string | null;
  showPinyin: boolean;
  onGenerate: () => void;
  generating: boolean;
  error?: string;
}) {
  const hasAnyImage = panels.some((p) => p.image_url);
  return (
    <div className="rounded-3xl border bg-gradient-to-br from-pink-50/60 to-amber-50/40 dark:from-pink-950/20 dark:to-amber-950/10 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <ImageIcon className="size-5 text-pink-500" />
          만화로 보는 본문
        </h3>
        {!hasAnyImage && (
          <Button
            size="sm"
            onClick={onGenerate}
            disabled={generating}
            className="bg-pink-500 hover:bg-pink-600 text-white"
          >
            {generating ? "그리는 중..." : "🎨 AI 만화 이미지 생성"}
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {panels.map((p, i) => (
          <div
            key={i}
            className="rounded-2xl bg-white/70 dark:bg-background/40 border overflow-hidden shadow-sm"
          >
            {p.image_url ? (
              <img
                src={p.image_url}
                alt={p.narration ?? `panel ${i + 1}`}
                className="w-full aspect-square object-cover"
              />
            ) : (
              <div className="w-full aspect-square flex items-center justify-center bg-gradient-to-br from-pink-100 to-purple-100 text-4xl">
                🖼️
              </div>
            )}
            <div className="p-3 space-y-2">
              {p.narration && (
                <p className="text-xs text-muted-foreground italic">{p.narration}</p>
              )}
              {(p.lines ?? []).map((l, j) => (
                <div key={j} className="rounded-lg bg-background/50 p-2 text-sm">
                  {l.speaker && (
                    <div className="text-[10px] text-muted-foreground">
                      {l.speaker}
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold" lang="zh-CN">
                      {l.zh}
                    </span>
                    <TtsButton
                      text={l.zh}
                      speak={speak}
                      active={speakingId === l.zh}
                      size="sm"
                    />
                  </div>
                  {showPinyin && l.pinyin && (
                    <div className="text-[11px] text-muted-foreground">
                      {l.pinyin}
                    </div>
                  )}
                  {l.ko && <div className="text-xs text-foreground/75">{l.ko}</div>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Dialogue ---------------- */

function DialogueList({
  dialogues,
  showPinyin,
  speak,
  speakingId,
}: {
  dialogues: Dialogue[];
  showPinyin: boolean;
  speak: (t: string, id?: string) => void;
  speakingId: string | null;
}) {
  if (!dialogues.length) {
    return <p className="text-sm text-muted-foreground">대화가 없습니다.</p>;
  }
  return (
    <div className="flex flex-col gap-4 bg-white/50 backdrop-blur-md p-4 sm:p-6 rounded-[2rem] border border-white/70 shadow-sm">
      {dialogues.map((d, i) => {
        const isDing = (d.speaker ?? "").includes("叮");
        const ttsId = `dlg-${i}`;
        const initial = (d.speaker ?? (isDing ? "B" : "A")).slice(0, 1).toUpperCase();
        return (
          <div
            key={i}
            className={cn(
              "flex items-start gap-3 max-w-[92%] sm:max-w-[80%]",
              isDing ? "ml-auto flex-row-reverse" : "mr-auto",
            )}
          >
            <div
              className={cn(
                "w-10 h-10 rounded-2xl flex-shrink-0 flex items-center justify-center font-bold shadow-sm border-2 border-white",
                isDing
                  ? "bg-rose-500 text-white shadow-rose-100"
                  : "bg-sky-500 text-white shadow-sky-100",
              )}
            >
              {initial}
            </div>
            <div
              className={cn(
                "px-4 py-3 rounded-2xl shadow-sm border max-w-full",
                isDing
                  ? "bg-rose-500 border-rose-400 text-white rounded-tr-none"
                  : "bg-white border-slate-100 text-slate-900 rounded-tl-none",
              )}
            >
              {d.speaker && (
                <div
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-wider mb-1",
                    isDing ? "text-rose-100" : "text-slate-400",
                  )}
                >
                  {d.speaker}
                </div>
              )}
              <div className="flex items-start gap-2 flex-wrap">
                <p
                  className={cn(
                    "text-lg sm:text-xl font-semibold leading-snug",
                    isDing ? "text-white" : "text-slate-900",
                  )}
                  lang="zh-CN"
                >
                  {d.zh}
                </p>
                <TtsButton
                  text={d.zh}
                  speak={(t) => speak(t, ttsId)}
                  active={speakingId === ttsId}
                  size="sm"
                />
              </div>
              {showPinyin && d.pinyin && (
                <div
                  className={cn(
                    "text-xs italic mt-1",
                    isDing ? "text-rose-100" : "text-sky-500",
                  )}
                >
                  {d.pinyin}
                </div>
              )}
              {d.ko && (
                <div
                  className={cn(
                    "text-[13px] mt-1.5 font-medium",
                    isDing ? "text-rose-50/90" : "text-slate-500",
                  )}
                >
                  {d.ko}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Slides ---------------- */

type SlideTheme = {
  grad: string;
  accent: string;
  accentHex: string;
  text: string;
  ring: string;
  softBg: string;
};

const SLIDE_THEMES: SlideTheme[] = [
  { grad: "from-rose-100 via-pink-50 to-white", accent: "bg-rose-500", accentHex: "#f43f5e", text: "text-rose-600", ring: "ring-rose-200", softBg: "bg-rose-50" },
  { grad: "from-sky-100 via-cyan-50 to-white", accent: "bg-sky-500", accentHex: "#0ea5e9", text: "text-sky-600", ring: "ring-sky-200", softBg: "bg-sky-50" },
  { grad: "from-emerald-100 via-teal-50 to-white", accent: "bg-emerald-500", accentHex: "#10b981", text: "text-emerald-600", ring: "ring-emerald-200", softBg: "bg-emerald-50" },
  { grad: "from-indigo-100 via-violet-50 to-white", accent: "bg-indigo-500", accentHex: "#6366f1", text: "text-indigo-600", ring: "ring-indigo-200", softBg: "bg-indigo-50" },
  { grad: "from-amber-100 via-orange-50 to-white", accent: "bg-amber-500", accentHex: "#f59e0b", text: "text-amber-600", ring: "ring-amber-200", softBg: "bg-amber-50" },
];

/* Progress ring (SVG) */
function ProgressRing({
  progress,
  size = 56,
  stroke = 5,
  color,
  label,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  color: string;
  label: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (progress / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#e2e8f0" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 500ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-slate-700 tabular-nums">
        {label}
      </div>
    </div>
  );
}

/* Ring bullet card (Competitive-Edge style) */
function RingBulletCard({
  text,
  index,
  total,
  color,
}: {
  text: string;
  index: number;
  total: number;
  color: string;
}) {
  const size = 168;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // Rotate arc emphasis for each card (staggered starting angle)
  const arcPortion = 0.72 - (index / Math.max(1, total)) * 0.15;
  const dash = c * arcPortion;
  const gap = c - dash;
  const rotate = -90 + index * 25;
  const isShort = text.length <= 14;
  return (
    <div className="group flex flex-col items-center gap-2.5">
      <div
        className="relative transition-transform duration-300 group-hover:scale-105"
        style={{ width: size, height: size }}
      >
        {/* Background ring */}
        <svg width={size} height={size} className="absolute inset-0">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="#e2e8f0" strokeWidth={stroke} fill="none" opacity="0.5" />
          <g style={{ transformOrigin: "center", transform: `rotate(${rotate}deg)` }}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={color}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${gap}`}
              className="transition-all duration-700"
              style={{
                filter: `drop-shadow(0 4px 12px ${color}55)`,
              }}
            />
          </g>
        </svg>
        {/* Inner disc */}
        <div
          className="absolute inset-3 rounded-full bg-white/85 backdrop-blur flex items-center justify-center px-4 text-center shadow-inner"
          style={{ boxShadow: "inset 0 2px 8px rgba(15,23,42,0.06)" }}
        >
          {isShort ? (
            <span className="text-[15px] sm:text-base font-bold leading-tight" style={{ color }}>
              {text}
            </span>
          ) : (
            <span className="text-[13px] font-semibold leading-tight text-slate-700 line-clamp-4">
              {text}
            </span>
          )}
        </div>
        {/* Numeric badge */}
        <div
          className="absolute -top-1 -right-1 size-8 rounded-full text-white text-xs font-black flex items-center justify-center shadow-md ring-2 ring-white"
          style={{ backgroundColor: color }}
        >
          {String(index + 1).padStart(2, "0")}
        </div>
      </div>
    </div>
  );
}

/* Vocab hero tile */
function VocabHeroCard({
  v,
  color,
  speak,
  speakingId,
}: {
  v: { zh: string; pinyin?: string; ko: string };
  color: string;
  speak: (t: string, id?: string) => void;
  speakingId: string | null;
}) {
  return (
    <button
      type="button"
      onClick={() => speak(v.zh, v.zh)}
      className="group relative overflow-hidden rounded-3xl border border-white bg-gradient-to-br from-white via-white to-slate-50 p-5 text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-[0_20px_40px_-15px_rgba(15,23,42,0.25)] cursor-pointer"
      style={{ minHeight: 180 }}
    >
      {/* corner blob */}
      <div
        className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full opacity-15 blur-2xl transition-opacity group-hover:opacity-30"
        style={{ backgroundColor: color }}
      />
      <div className="flex items-center gap-1 mb-2">
        {[1, 2, 3, 4].map((tone) => (
          <span
            key={tone}
            className="size-1.5 rounded-full"
            style={{ backgroundColor: `${color}${tone === 1 ? "" : "80"}`, opacity: 0.3 + tone * 0.15 }}
          />
        ))}
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest" style={{ color }}>
          <Volume2 className={cn("size-3", speakingId === v.zh && "animate-pulse")} /> Play
        </span>
      </div>
      <div
        className="text-4xl sm:text-5xl font-black leading-none text-center py-3 tracking-tight"
        style={{ color: "#0f172a" }}
        lang="zh-CN"
      >
        {v.zh}
      </div>
      {v.pinyin && (
        <div className="text-center text-sm italic mt-1" style={{ color, fontFamily: "'Georgia', serif" }}>
          {v.pinyin}
        </div>
      )}
      <div className="text-center text-sm text-slate-600 mt-1 leading-snug">{v.ko}</div>
    </button>
  );
}

/* Example speech bubble */
function ExampleBubble({
  e,
  idx,
  color,
  showPinyin,
  speak,
  speakingId,
}: {
  e: { zh: string; pinyin?: string; ko: string; speaker?: string };
  idx: number;
  color: string;
  showPinyin: boolean;
  speak: (t: string, id?: string) => void;
  speakingId: string | null;
}) {
  const isLeft = idx % 2 === 0;
  const speaker = e.speaker ?? (isLeft ? "A" : "B");
  const speaking = speakingId === e.zh;
  return (
    <div className={cn("flex items-start gap-3", isLeft ? "flex-row" : "flex-row-reverse")}>
      <div
        className="shrink-0 size-11 rounded-full flex items-center justify-center text-white text-sm font-black shadow-md ring-4 ring-white"
        style={{ backgroundColor: color }}
      >
        {speaker.slice(0, 1).toUpperCase()}
      </div>
      <div
        className={cn(
          "relative flex-1 rounded-2xl bg-white/90 backdrop-blur border border-white shadow-sm p-3.5 transition-all",
          speaking && "ring-2 ring-offset-2",
        )}
        style={{
          maxWidth: "calc(100% - 3.5rem)",
          ...(speaking ? ({ ["--tw-ring-color" as string]: color } as React.CSSProperties) : {}),
        }}
      >
        {/* tail */}
        <div
          className={cn(
            "absolute top-3 size-3 rotate-45 bg-white border-white",
            isLeft ? "-left-1.5 border-l border-b" : "-right-1.5 border-r border-t",
          )}
        />
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-base sm:text-lg font-bold text-slate-900 leading-snug" lang="zh-CN">
              {e.zh}
            </div>
            {showPinyin && e.pinyin && (
              <div className="text-xs italic mt-0.5" style={{ color }}>
                {e.pinyin}
              </div>
            )}
            <div className="text-sm text-slate-600 mt-1 leading-snug">{e.ko}</div>
          </div>
          <button
            type="button"
            onClick={() => speak(e.zh, e.zh)}
            className={cn(
              "shrink-0 inline-flex items-center justify-center size-8 rounded-full text-white shadow-sm hover:scale-110 transition-transform cursor-pointer",
              speaking && "animate-pulse",
            )}
            style={{ backgroundColor: color }}
            aria-label="재생"
          >
            <Volume2 className="size-4" />
          </button>
        </div>
        {/* progress bar */}
        <div className="mt-2 h-1 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={cn("h-full transition-all", speaking ? "animate-pulse" : "")}
            style={{
              width: speaking ? "100%" : "0%",
              backgroundColor: color,
              transitionDuration: speaking ? "3000ms" : "300ms",
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* Key point spotlight */
function KeyPointSpotlight({ text, color }: { text: string; color: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-3xl bg-white/85 backdrop-blur border border-white shadow-[0_15px_40px_-15px_rgba(15,23,42,0.2)] p-5 sm:p-6"
      style={{
        backgroundImage: `radial-gradient(circle at 15% 30%, ${color}18, transparent 55%)`,
      }}
    >
      <div className="flex items-center gap-4 sm:gap-5">
        <div
          className="shrink-0 relative size-16 sm:size-20 rounded-3xl flex items-center justify-center text-white shadow-lg"
          style={{
            background: `linear-gradient(135deg, ${color}, ${color}bb)`,
            boxShadow: `0 15px 35px -10px ${color}80`,
          }}
        >
          <Lightbulb className="size-8 sm:size-10" />
          <span
            className="absolute -inset-1 rounded-3xl opacity-30 blur-md -z-10"
            style={{ backgroundColor: color }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black tracking-[0.3em] uppercase mb-1" style={{ color }}>
            Key Point
          </div>
          <p className="text-lg sm:text-2xl font-bold leading-snug text-slate-900">
            {text}
          </p>
        </div>
      </div>
    </div>
  );
}

function SlidesCarousel({
  slides,
  showPinyin,
  speak,
  speakingId,
}: {
  slides: Slide[];
  showPinyin: boolean;
  speak: (t: string, id?: string) => void;
  speakingId: string | null;
}) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);

  const go = (next: number) => {
    if (next < 0 || next > slides.length - 1) return;
    setDir(next > i ? 1 : -1);
    setI(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(Math.min(slides.length - 1, i + 1));
      if (e.key === "ArrowLeft") go(Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
     
  }, [i, slides.length]);

  if (!slides.length) {
    return <p className="text-sm text-muted-foreground">슬라이드가 없습니다.</p>;
  }
  const slide = slides[Math.min(i, slides.length - 1)];
  const total = slides.length;
  const progress = ((i + 1) / total) * 100;
  const theme = SLIDE_THEMES[i % SLIDE_THEMES.length];

  const hasStructured = !!(
    slide.key_point ||
    slide.content ||
    slide.bullets?.length ||
    slide.vocab?.length ||
    slide.examples?.length ||
    slide.usage_context ||
    slide.common_mistake ||
    slide.tip ||
    slide.practice
  );

  const isCoverOnly = !hasStructured && !!(slide.title || slide.subtitle);

  const allZh = [
    slide.title,
    slide.subtitle,
    slide.content,
    slide.key_point,
    ...(slide.bullets ?? []),
    ...(slide.vocab ?? []).map((v) => v.zh),
    ...(slide.examples ?? []).map((e) => e.zh),
  ]
    .filter(Boolean)
    .join(" ")
    .match(/[\u3400-\u9fff][\u3400-\u9fff\u3000-\u303f\uff00-\uffef，。！？、；：\s]*/g)
    ?.join("") ?? "";

  // Staggered animation wrapper
  const stagger = (idx: number) => ({
    animation: "fade-in 0.5s ease-out both",
    animationDelay: `${idx * 80}ms`,
  });

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Left index rail */}
      <div className="lg:w-14 flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible px-1 lg:px-0 py-2 lg:py-0 lg:pt-6">
        {slides.map((s, idx) => {
          const active = idx === i;
          const t = SLIDE_THEMES[idx % SLIDE_THEMES.length];
          return (
            <button
              key={idx}
              onClick={() => go(idx)}
              title={s.title ?? `슬라이드 ${idx + 1}`}
              className={cn(
                "shrink-0 group relative flex items-center gap-2 rounded-full transition-all cursor-pointer",
                active ? "lg:w-12 lg:h-12 w-10 h-10" : "lg:w-9 lg:h-9 w-8 h-8 opacity-60 hover:opacity-100",
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center rounded-full w-full h-full text-xs font-bold border-2 transition-all",
                  active
                    ? cn("bg-white shadow-lg", t.text, "border-current scale-110")
                    : "bg-white/60 text-slate-500 border-slate-200 hover:border-slate-400",
                )}
              >
                {idx + 1}
              </span>
            </button>
          );
        })}
      </div>

      {/* Deck */}
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "relative rounded-[2.2rem] border border-white/70 bg-gradient-to-br shadow-[0_25px_60px_-15px_rgba(15,23,42,0.2)] overflow-hidden",
            theme.grad,
          )}
        >
          <div className={cn("absolute -top-16 -right-16 size-64 rounded-full opacity-30 blur-3xl", theme.accent)} />
          <div className={cn("absolute -bottom-20 -left-20 size-72 rounded-full opacity-20 blur-3xl", theme.accent)} />

          <div key={i} className="relative p-6 sm:p-9 min-h-[520px] flex flex-col gap-5">
            {/* Header */}
            <div
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4"
              style={stagger(0)}
            >
              <ProgressRing
                progress={progress}
                color={theme.accentHex}
                label={`${i + 1}/${total}`}
              />
              <div className="min-w-0">
                <div className={cn("text-[10px] font-black tracking-[0.3em] uppercase mb-1", theme.text)}>
                  Slide {String(i + 1).padStart(2, "0")}
                </div>
                {slide.title && (
                  <h3 className={cn(
                    "font-black text-slate-900 leading-[1.1] tracking-tight truncate",
                    isCoverOnly ? "text-3xl sm:text-5xl" : "text-2xl sm:text-3xl",
                  )}>
                    {slide.title}
                  </h3>
                )}
                {slide.subtitle && !isCoverOnly && (
                  <p className="mt-1 text-sm sm:text-base text-slate-600 leading-snug truncate">
                    {slide.subtitle}
                  </p>
                )}
              </div>
              {allZh && (
                <TtsButton
                  text={allZh}
                  speak={speak}
                  active={speakingId === allZh}
                  label="전체 듣기"
                />
              )}
            </div>

            {/* Cover-only layout */}
            {isCoverOnly && slide.subtitle && (
              <div className="flex-1 flex items-center justify-center" style={stagger(1)}>
                <p className="text-xl sm:text-2xl text-slate-700 text-center max-w-2xl leading-relaxed">
                  {slide.subtitle}
                </p>
              </div>
            )}

            {/* Key point */}
            {slide.key_point && (
              <div style={stagger(1)}>
                <KeyPointSpotlight text={slide.key_point} color={theme.accentHex} />
              </div>
            )}

            {/* Content markdown (rich) */}
            {slide.content && (
              <div
                className="rounded-3xl bg-white/70 backdrop-blur border border-white/80 p-2 sm:p-3"
                style={stagger(2)}

              >
                <RichLessonContent
                  md={normalizeMarkdown(slide.content)}
                  speak={speak}
                  speakingId={speakingId}
                  showPinyin={showPinyin}
                  variant="slide"
                />
              </div>
            )}

            {/* Bullets as ring cards */}
            {slide.bullets && slide.bullets.length > 0 && (
              <div style={stagger(2)}>
                <div className={cn("text-[10px] font-black tracking-[0.3em] uppercase mb-4", theme.text)}>
                  Highlights
                </div>
                <div
                  className={cn(
                    "grid gap-6 justify-items-center",
                    slide.bullets.length === 1 && "grid-cols-1",
                    slide.bullets.length === 2 && "grid-cols-2",
                    slide.bullets.length === 3 && "grid-cols-2 md:grid-cols-3",
                    slide.bullets.length >= 4 && "grid-cols-2 md:grid-cols-4",
                  )}
                >
                  {slide.bullets.map((b, idx) => (
                    <RingBulletCard
                      key={idx}
                      text={b}
                      index={idx}
                      total={slide.bullets!.length}
                      color={theme.accentHex}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Vocab hero tiles */}
            {slide.vocab && slide.vocab.length > 0 && (
              <div style={stagger(3)}>
                <div className={cn("text-[10px] font-black tracking-[0.3em] uppercase mb-3 flex items-center gap-1.5", theme.text)}>
                  <BookMarked className="size-3" /> Vocabulary
                </div>
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
                  {slide.vocab.map((v, idx) => (
                    <VocabHeroCard
                      key={idx}
                      v={v}
                      color={theme.accentHex}
                      speak={speak}
                      speakingId={speakingId}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Examples as bubbles */}
            {slide.examples && slide.examples.length > 0 && (
              <div style={stagger(4)}>
                <div className={cn("text-[10px] font-black tracking-[0.3em] uppercase mb-3 flex items-center gap-1.5", theme.text)}>
                  <MessageSquareQuote className="size-3" /> 예문
                </div>
                <div className="space-y-3">
                  {slide.examples.map((e, idx) => (
                    <ExampleBubble
                      key={idx}
                      e={e}
                      idx={idx}
                      color={theme.accentHex}
                      showPinyin={showPinyin}
                      speak={speak}
                      speakingId={speakingId}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Meta mini-cards */}
            {(slide.usage_context || slide.common_mistake || slide.tip) && (
              <div className="grid gap-3 sm:grid-cols-3" style={stagger(5)}>
                {slide.usage_context && (
                  <SlideMiniCard
                    label="사용 맥락"
                    text={slide.usage_context}
                    icon={<Target className="size-3.5" />}
                    tone="sky"
                  />
                )}
                {slide.common_mistake && (
                  <SlideMiniCard
                    label="자주 하는 실수"
                    text={slide.common_mistake}
                    icon={<AlertTriangle className="size-3.5" />}
                    tone="rose"
                  />
                )}
                {slide.tip && (
                  <SlideMiniCard
                    label="팁"
                    text={slide.tip}
                    icon={<Lightbulb className="size-3.5" />}
                    tone="amber"
                  />
                )}
              </div>
            )}

            {slide.practice && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button
                    size="sm"
                    className={cn("self-start rounded-full text-white shadow-md hover:shadow-lg", theme.accent, "hover:opacity-90")}
                  >
                    <Pencil className="size-3.5 mr-1.5" />
                    연습 문제 보기
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 rounded-2xl bg-white/85 backdrop-blur border border-white p-4 text-sm space-y-1.5">
                  {typeof slide.practice === "string" ? (
                    <p className="text-slate-700">{slide.practice}</p>
                  ) : (
                    <>
                      {slide.practice.question && (
                        <p className="text-slate-800 font-medium">{slide.practice.question}</p>
                      )}
                      {slide.practice.answer && (
                        <p className="text-slate-500">
                          <span className={cn("font-semibold", theme.text)}>정답:</span>{" "}
                          {slide.practice.answer}
                        </p>
                      )}
                    </>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}

            {!hasStructured && !isCoverOnly && (
              <p className="text-sm text-slate-500 italic">이 슬라이드는 시각 자료 위주입니다.</p>
            )}
          </div>

          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/40">
            <div
              className={cn("h-full transition-all duration-500", theme.accent)}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="lg"
            onClick={() => go(i - 1)}
            disabled={i === 0}
            className="rounded-full bg-white/70 backdrop-blur border-slate-200 hover:bg-white cursor-pointer disabled:opacity-40"
          >
            <ChevronLeft className="size-4" /> 이전
          </Button>
          <div className="text-sm font-semibold text-slate-600 tabular-nums">
            <span className={theme.text}>{String(i + 1).padStart(2, "0")}</span>
            <span className="text-slate-300 mx-1">/</span>
            <span>{String(total).padStart(2, "0")}</span>
          </div>
          <Button
            size="lg"
            onClick={() => go(i + 1)}
            disabled={i === total - 1}
            className={cn("rounded-full text-white shadow-md cursor-pointer disabled:opacity-40", theme.accent, "hover:opacity-90")}
          >
            다음 <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SlideMiniCard({
  label,
  text,
  icon,
  tone,
}: {
  label: string;
  text: string;
  icon: ReactNode;
  tone: "sky" | "rose" | "amber";
}) {
  const tones = {
    sky: "from-sky-50 to-white border-sky-100 text-sky-600",
    rose: "from-rose-50 to-white border-rose-100 text-rose-600",
    amber: "from-amber-50 to-white border-amber-100 text-amber-600",
  } as const;
  return (
    <div className={cn("rounded-2xl bg-gradient-to-br border p-3.5", tones[tone])}>
      <div className="text-[10px] font-bold tracking-[0.2em] uppercase mb-1.5 flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
        {text}
      </p>
    </div>
  );
}

function SlideMeta({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-xl bg-background/40 p-3 border">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </div>
      <p className="text-sm whitespace-pre-wrap">{text}</p>
    </div>
  );
}

/* ---------------- Quiz ---------------- */

type AnswerState = {
  submitted: boolean;
  correct: boolean;
  choiceIndex?: number;
  fillValue?: string;
  orderPicks?: number[];
};

function QuizRunner({
  quiz,
  onScore,
}: {
  quiz: QuizItem[];
  onScore?: (correct: number, total: number) => void;
}) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<number, AnswerState>>({});
  const [finished, setFinished] = useState(false);
  const [reviewWrong, setReviewWrong] = useState(false);
  const [streak, setStreak] = useState(0);

  if (!quiz.length) {
    return <p className="text-sm text-muted-foreground">퀴즈가 없습니다.</p>;
  }

  const wrongIndices = Object.entries(answers)
    .filter(([, a]) => a.submitted && !a.correct)
    .map(([k]) => Number(k));

  const visibleIndices = reviewWrong ? wrongIndices : quiz.map((_, idx) => idx);
  const currentQuestionIdx = visibleIndices[i] ?? 0;
  const q = quiz[currentQuestionIdx];
  const a = answers[currentQuestionIdx];

  const setAnswer = (next: AnswerState) => {
    setAnswers((s) => ({ ...s, [currentQuestionIdx]: next }));
    if (next.submitted) {
      setStreak((s) => (next.correct ? s + 1 : 0));
    }
  };

  const score = quiz.reduce(
    (acc, _, idx) => acc + (answers[idx]?.correct ? 1 : 0),
    0,
  );

  if (finished) {
    const passed = score >= Math.ceil(quiz.length * 0.7);
    const pct = Math.round((score / quiz.length) * 100);
    return (
      <div className="space-y-4">
        <div className="glass-soft rounded-3xl p-8 text-center space-y-4">
          <div className="text-7xl">{passed ? "🎉" : "💪"}</div>
          <div className="text-sm text-muted-foreground">결과</div>
          <div className="text-5xl font-bold text-gradient-primary">
            {score} / {quiz.length}
          </div>
          <div className="h-3 rounded-full bg-background/40 overflow-hidden border max-w-xs mx-auto">
            <div
              className={cn(
                "h-full transition-all",
                passed ? "bg-emerald-500" : "bg-amber-500",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div
            className={cn(
              "text-sm font-medium",
              passed ? "text-emerald-600" : "text-amber-600",
            )}
          >
            {passed ? "통과! 정말 잘했어요 🎉" : "조금만 더 연습해봐요!"}
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Button
              onClick={() => {
                setAnswers({});
                setI(0);
                setFinished(false);
                setReviewWrong(false);
                setStreak(0);
              }}
            >
              <RotateCcw className="size-4" /> 다시 풀기
            </Button>
            {wrongIndices.length > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  setReviewWrong(true);
                  setI(0);
                  setFinished(false);
                }}
              >
                틀린 문항 다시보기 ({wrongIndices.length})
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!q) {
    return <p className="text-sm text-muted-foreground">표시할 문항이 없습니다.</p>;
  }

  const isLast = i === visibleIndices.length - 1;
  const total = visibleIndices.length;
  const progressPct = ((i + 1) / total) * 100;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="text-sm text-muted-foreground whitespace-nowrap">
          {i + 1} / {total}
        </div>
        <div className="h-2 flex-1 rounded-full bg-background/40 overflow-hidden border">
          <div
            className="h-full bg-gradient-to-r from-pink-400 via-purple-400 to-sky-400 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {streak >= 2 && (
          <div className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-xs font-semibold text-amber-700">
            🔥 {streak} 연속!
          </div>
        )}
      </div>

      <div
        key={currentQuestionIdx}
        className="glass-soft rounded-3xl p-6 space-y-4 min-h-[280px] animate-in fade-in slide-in-from-bottom-2 duration-300"
      >
        <div className="flex items-start gap-2">
          <span className="inline-flex shrink-0 items-center justify-center size-7 rounded-full bg-primary/15 text-primary text-xs font-bold">
            Q
          </span>
          <div className="text-base font-semibold">{q.question_ko}</div>
        </div>

        {q.type === "choice" && (
          <ChoiceBlock q={q} answer={a} setAnswer={setAnswer} />
        )}
        {q.type === "fill" && <FillBlock q={q} answer={a} setAnswer={setAnswer} />}
        {q.type === "order" && (
          <OrderBlock q={q} answer={a} setAnswer={setAnswer} />
        )}

        {a?.submitted && (
          <div
            className={cn(
              "rounded-2xl border p-3 text-sm flex items-start gap-2 animate-in fade-in",
              a.correct
                ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                : "bg-rose-50 border-rose-300 text-rose-900",
            )}
          >
            {a.correct ? (
              <Check className="size-5 shrink-0 mt-0.5" />
            ) : (
              <X className="size-5 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="font-bold mb-1">
                {a.correct ? "정답이에요! 🎉" : "아쉬워요"}
              </div>
              {q.explanation && <div>{q.explanation}</div>}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setI((v) => Math.max(0, v - 1))}
          disabled={i === 0}
        >
          <ChevronLeft className="size-4" /> 이전
        </Button>
        {isLast ? (
          <Button
            onClick={() => {
              setFinished(true);
              onScore?.(score, quiz.length);
            }}
            disabled={!a?.submitted}
          >
            결과 보기
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => setI((v) => Math.min(total - 1, v + 1))}
            disabled={!a?.submitted}
          >
            다음 <ChevronRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function ChoiceBlock({
  q,
  answer,
  setAnswer,
}: {
  q: QuizChoice;
  answer?: AnswerState;
  setAnswer: (s: AnswerState) => void;
}) {
  const options = Array.isArray(q.options) ? q.options : [];
  if (!options.length) {
    return (
      <p className="text-sm text-muted-foreground">
        이 객관식 문항의 보기 데이터가 비어 있습니다.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {q.question_zh && (
        <div className="text-lg font-medium rounded-xl bg-background/40 px-3 py-2 border" lang="zh-CN">
          {q.question_zh}
        </div>
      )}
      <div className="grid gap-2">
        {options.map((opt, idx) => {
          const submitted = answer?.submitted;
          const isPicked = answer?.choiceIndex === idx;
          const isCorrect = idx === q.correct;
          const cls = cn(
            "w-full text-left rounded-2xl border-2 px-4 py-3 transition-all cursor-pointer",
            "bg-background/40 hover:bg-background/70 hover:scale-[1.01] active:scale-[0.99]",
            submitted &&
              isCorrect &&
              "bg-emerald-100 border-emerald-500 text-emerald-900 scale-[1.01]",
            submitted &&
              isPicked &&
              !isCorrect &&
              "bg-rose-100 border-rose-500 text-rose-900",
            !submitted && isPicked && "border-primary",
            submitted && "hover:scale-100 cursor-default",
          );
          return (
            <button
              type="button"
              key={idx}
              className={cls}
              disabled={submitted}
              onClick={() =>
                setAnswer({
                  submitted: true,
                  correct: idx === q.correct,
                  choiceIndex: idx,
                })
              }
            >
              <span className="mr-2 inline-flex items-center justify-center size-6 rounded-full bg-foreground/10 text-xs font-bold">
                {String.fromCharCode(65 + idx)}
              </span>
              <span lang="zh-CN">{opt}</span>
              {submitted && isCorrect && (
                <Check className="inline ml-2 size-4 text-emerald-600" />
              )}
              {submitted && isPicked && !isCorrect && (
                <X className="inline ml-2 size-4 text-rose-600" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FillBlock({
  q,
  answer,
  setAnswer,
}: {
  q: QuizFill;
  answer?: AnswerState;
  setAnswer: (s: AnswerState) => void;
}) {
  const [value, setValue] = useState(answer?.fillValue ?? "");
  const submitted = answer?.submitted;
  const parts = (q.sentence_zh ?? "___").split(/_{2,}/);
  return (
    <div className="space-y-3">
      <div className="text-lg rounded-2xl bg-background/40 px-3 py-2 border" lang="zh-CN">
        {parts.map((p, idx) => (
          <span key={idx}>
            {p}
            {idx < parts.length - 1 && (
              <span
                className={cn(
                  "inline-block mx-1 px-2 py-0.5 rounded border-b-2 min-w-[3em] text-center font-semibold",
                  submitted && answer?.correct && "text-emerald-700 border-emerald-500 bg-emerald-50",
                  submitted && !answer?.correct && "text-rose-700 border-rose-500 bg-rose-50",
                  !submitted && "text-primary border-primary/50",
                )}
              >
                {submitted ? value || "___" : "___"}
              </span>
            )}
          </span>
        ))}
      </div>
      {!submitted && (
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="정답 입력"
            lang="zh-CN"
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim()) {
                const ok = value.trim() === q.answer.trim();
                setAnswer({ submitted: true, correct: ok, fillValue: value });
              }
            }}
          />
          <Button
            onClick={() => {
              const ok = value.trim() === q.answer.trim();
              setAnswer({ submitted: true, correct: ok, fillValue: value });
            }}
            disabled={!value.trim()}
          >
            제출
          </Button>
        </div>
      )}
      {submitted && !answer?.correct && (
        <div className="text-sm">
          정답:{" "}
          <span className="font-semibold text-emerald-700" lang="zh-CN">
            {q.answer}
          </span>
        </div>
      )}
      {!submitted && q.hint && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm">
              💡 힌트 보기
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="text-sm text-muted-foreground mt-1">
            {q.hint}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function OrderBlock({
  q,
  answer,
  setAnswer,
}: {
  q: QuizOrder;
  answer?: AnswerState;
  setAnswer: (s: AnswerState) => void;
}) {
  const words = Array.isArray(q.words) ? q.words : [];
  const correctOrder = Array.isArray(q.correct_order) ? q.correct_order : [];
  const [picks, setPicks] = useState<number[]>(answer?.orderPicks ?? []);
  const submitted = answer?.submitted;
  if (!words.length) {
    return (
      <p className="text-sm text-muted-foreground">
        이 순서 맞추기 문항의 단어 데이터가 비어 있습니다.
      </p>
    );
  }
  const remaining = words
    .map((_, idx) => idx)
    .filter((idx) => !picks.includes(idx));

  const pickedWords = picks.map((idx) => words[idx]);
  const submit = () => {
    const ok =
      picks.length === correctOrder.length &&
      picks.every((v, idx) => v === correctOrder[idx]);
    setAnswer({ submitted: true, correct: ok, orderPicks: picks });
  };

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "min-h-[3.5rem] rounded-2xl border-2 border-dashed p-3 flex flex-wrap gap-2 bg-background/40 transition-colors",
          submitted && answer?.correct && "border-emerald-400 bg-emerald-50/50",
          submitted && !answer?.correct && "border-rose-400 bg-rose-50/50",
        )}
      >
        {pickedWords.length === 0 && (
          <span className="text-sm text-muted-foreground self-center">
            아래 단어를 순서대로 선택하세요
          </span>
        )}
        {pickedWords.map((w, idx) => (
          <button
            key={idx}
            type="button"
            disabled={submitted}
            onClick={() => setPicks((p) => p.filter((_, j) => j !== idx))}
            className="px-3 py-1.5 rounded-xl bg-primary/15 border border-primary/40 text-base hover:bg-primary/25 transition-colors cursor-pointer"
            lang="zh-CN"
          >
            {w}
          </button>
        ))}
      </div>
      {!submitted && (
        <div className="flex flex-wrap gap-2">
          {remaining.map((idx) => (
            <button
              key={idx}
              type="button"
              className="px-3 py-1.5 rounded-xl bg-background/60 border-2 text-base hover:bg-background hover:scale-105 transition-all cursor-pointer"
              onClick={() => setPicks((p) => [...p, idx])}
              lang="zh-CN"
            >
              {words[idx]}
            </button>
          ))}
        </div>
      )}
      {!submitted && (
        <div className="flex gap-2">
          <Button onClick={submit} disabled={picks.length !== words.length}>
            제출
          </Button>
          <Button variant="outline" onClick={() => setPicks([])}>
            초기화
          </Button>
        </div>
      )}
      {submitted && q.answer_text && (
        <div className="text-sm">
          정답:{" "}
          <span className="font-semibold text-emerald-700" lang="zh-CN">
            {q.answer_text}
          </span>
        </div>
      )}
    </div>
  );
}
