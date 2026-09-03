import { type ReactNode, useMemo, Fragment } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Volume2,
  Sparkles,
  Quote,
  MessageSquareQuote,
  BookOpen,
  GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SpeakButton } from "@/components/speak-button";

const HAN_RE = /[\u3400-\u9fff]/;
const HAN_PLUS = /[\u3400-\u9fff][\u3400-\u9fff\u3000-\u303f\uff00-\uffef，。！？、；：""''…—\s]*/g;

const extractChinese = (s: string) => {
  const matches = s.match(HAN_PLUS);
  if (!matches) return "";
  return matches.join("").trim();
};

/* ============ Types ============ */

export type SentenceItem = {
  zh: string;
  pinyin?: string;
  ko: string;
  prefix?: string; // 예:, A:, etc
};

export type ExpressionItem = {
  zh: string;
  pinyin?: string;
  meaning: string;
  notes?: string;
  examples: SentenceItem[];
  isGrammar?: boolean;
};

export type Block =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string; number?: string }
  | { type: "paragraph"; text: string }
  | { type: "expression-list"; items: ExpressionItem[] }
  | { type: "sentence-list"; items: SentenceItem[] }
  | { type: "bullet-list"; items: string[] }
  | { type: "blockquote"; text: string };

/* ============ Parser ============ */

const stripBold = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1");

// Try to parse a line as an example sentence: "中文. (pinyin) 한글"
// Returns null if not a sentence line.
function parseSentence(raw: string, defaultPrefix?: string): SentenceItem | null {
  let s = stripBold(raw.trim());
  let prefix = defaultPrefix;

  // Handle prefixes: "예:", "예)", "A:", "B:", speaker names
  const prefixMatch = s.match(/^(예\s*\d*[:：)]|[A-Za-z가-힣]+[:：])\s*/);
  if (prefixMatch) {
    prefix = prefixMatch[1].replace(/[:：)]/g, "").trim();
    s = s.slice(prefixMatch[0].length);
  }

  if (!HAN_RE.test(s)) return null;

  // Pattern: "中文.。(pinyin) 한글" or "中文 (pinyin.) 한글"
  const m = s.match(
    /^([\u3400-\u9fff\s\u3000-\u303f\uff00-\uffef，。！？、；：]+?)\s*[（(]([^)）]+)[)）]\s*(.*)$/,
  );
  if (m) {
    return {
      zh: m[1].trim(),
      pinyin: m[2].trim(),
      ko: m[3].trim(),
      prefix,
    };
  }

  // Pattern without pinyin: "中文 한글"
  const m2 = s.match(
    /^([\u3400-\u9fff\s\u3000-\u303f\uff00-\uffef，。！？、；：]+?)\s+([가-힣][^]*)$/,
  );
  if (m2) {
    return { zh: m2[1].trim(), ko: m2[2].trim(), prefix };
  }

  // Pure Chinese
  return { zh: s.trim(), ko: "", prefix };
}

// Try to parse an expression header: "**受欢迎 (shòu huānyíng)**: 환영받다..."
// or grammar: "**因为…所以…** (yīnwèi…suǒyǐ…): …때문에"
function parseExpressionHeader(
  raw: string,
): { zh: string; pinyin?: string; meaning: string; isGrammar?: boolean } | null {
  let s = raw.trim();
  // Remove leading numeric prefix like "1. " (from ordered list)
  s = s.replace(/^\d+\.\s*/, "");

  // Bold-wrapped: **X (pinyin)**: meaning  OR  **X**: meaning
  const m = s.match(/^\*\*(.+?)\*\*\s*[:：]?\s*(.*)$/);
  if (m) {
    const head = m[1].trim();
    const meaning = stripBold(m[2].trim());
    // Extract pinyin from head: "受欢迎 (shòu huānyíng)"
    const p = head.match(/^(.+?)\s*[（(]([^)）]+)[)）]\s*$/);
    if (p && HAN_RE.test(p[1])) {
      return { zh: p[1].trim(), pinyin: p[2].trim(), meaning };
    }
    if (HAN_RE.test(head)) {
      return { zh: head, meaning };
    }
    // No Han in bold — maybe pattern is bold but pinyin follows: "**受欢迎** (shòu huānyíng): meaning"
    const p2 = m[2].match(/^[（(]([^)）]+)[)）]\s*[:：]?\s*(.*)$/);
    if (p2 && HAN_RE.test(head)) {
      return { zh: head, pinyin: p2[1].trim(), meaning: stripBold(p2[2].trim()) };
    }
  }
  return null;
}

// Try to parse an H3 grammar header: "### 1. '因为…所以…' (yīnwèi…suǒyǐ…): …때문에"
function parseGrammarHeader(
  raw: string,
): { number?: string; zh: string; pinyin?: string; meaning: string } | null {
  let s = raw.trim();
  const nm = s.match(/^(\d+)\.\s*(.*)$/);
  const number = nm?.[1];
  if (nm) s = nm[2];

  // Pattern A: bold Chinese with inline pinyin, e.g.
  //   "빠른 **更新 (gēngxīn)** 속도"
  //   "**更新 (gēngxīn)**"
  const bp = s.match(/\*\*\s*([\u3400-\u9fff][^*]*?)\s*[（(]([^)）]+)[)）]\s*\*\*/);
  if (bp) {
    const zh = bp[1].trim();
    const pinyin = bp[2].trim();
    const meaning = s
      .replace(bp[0], "")
      .replace(/\s+/g, " ")
      .replace(/^[:：]\s*/, "")
      .trim();
    return { number, zh, pinyin, meaning };
  }

  // Pattern B: bold Chinese followed by (pinyin), e.g. "**因为…所以…** (yīnwèi…) : meaning"
  const bp2 = s.match(
    /\*\*\s*([\u3400-\u9fff][^*]*?)\s*\*\*\s*[（(]([^)）]+)[)）]\s*[:：]?\s*(.*)$/,
  );
  if (bp2) {
    return { number, zh: bp2[1].trim(), pinyin: bp2[2].trim(), meaning: stripBold(bp2[3].trim()) };
  }

  s = stripBold(s).replace(/^[''""'']+|[''""'']+$/g, "");

  // Pattern C: quoted or bare Chinese phrase + (pinyin) + meaning
  const m = s.match(/^[''""'']?(.+?)[''""'']?\s*[（(]([^)）]+)[)）]\s*[:：]?\s*(.*)$/);
  if (m && HAN_RE.test(m[1])) {
    return { number, zh: m[1].trim(), pinyin: m[2].trim(), meaning: m[3].trim() };
  }
  return null;
}

export function parseRichMarkdown(md: string): Block[] {
  const text = md.replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const blocks: Block[] = [];

  let i = 0;
  const n = lines.length;

  const flushPara = (buf: string[]) => {
    const t = buf.join(" ").trim();
    if (t) blocks.push({ type: "paragraph", text: t });
  };

  let pendingH3Grammar: {
    number?: string;
    zh: string;
    pinyin?: string;
    meaning: string;
  } | null = null;

  while (i < n) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank
    if (!trimmed) {
      i++;
      continue;
    }

    // Headings
    if (trimmed.startsWith("## ")) {
      pendingH3Grammar = null;
      blocks.push({ type: "h2", text: trimmed.slice(3).trim() });
      i++;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      const headText = trimmed.slice(4).trim();
      const g = parseGrammarHeader(headText);
      if (g) {
        // Buffer as grammar expression; collect following bullet lines as examples
        pendingH3Grammar = g;
        i++;
        continue;
      }
      pendingH3Grammar = null;
      const nm = headText.match(/^(\d+)\.\s*(.*)$/);
      blocks.push({ type: "h3", text: nm ? nm[2] : headText, number: nm?.[1] });
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith("> ")) {
      const buf: string[] = [trimmed.slice(2)];
      i++;
      while (i < n && lines[i].trim().startsWith("> ")) {
        buf.push(lines[i].trim().slice(2));
        i++;
      }
      blocks.push({ type: "blockquote", text: buf.join(" ") });
      continue;
    }

    // List (bullet or ordered)
    if (/^[*\-+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      // Collect all consecutive list items (with their indented continuations)
      const rawItems: string[] = [];
      while (i < n) {
        const ln = lines[i];
        const t = ln.trim();
        if (/^[*\-+]\s+/.test(t) || /^\d+\.\s+/.test(t)) {
          // Start a new item
          const contentStart = t.replace(/^[*\-+]\s+/, "").replace(/^\d+\.\s+/, "");
          const parts: string[] = [contentStart];
          i++;
          // Collect indented continuation lines (start with spaces/tab or non-list next line joined)
          while (i < n) {
            const next = lines[i];
            const nt = next.trim();
            if (!nt) break;
            if (/^[*\-+]\s+/.test(nt) || /^\d+\.\s+/.test(nt)) break;
            if (nt.startsWith("#")) break;
            // Any non-empty non-list, non-heading line is continuation
            parts.push(nt);
            i++;
          }
          rawItems.push(parts.join("\n"));
        } else {
          break;
        }
      }

      // Classify: expression list, sentence list, or plain bullet
      const expressionItems: ExpressionItem[] = [];
      let allExpressions = true;
      const sentenceItems: SentenceItem[] = [];
      let allSentences = true;
      const mixedNotes: string[] = [];
      const mixedSentences: SentenceItem[] = [];

      for (const raw of rawItems) {
        const [firstLine, ...rest] = raw.split("\n");
        const expr = parseExpressionHeader(firstLine);
        if (expr) {
          const notes: string[] = [];
          const examples: SentenceItem[] = [];
          for (const r of rest) {
            const rt = r.trim();
            const s = parseSentence(rt);
            if (s && (s.prefix?.startsWith("예") || HAN_RE.test(rt))) {
              examples.push(s);
            } else if (rt) {
              notes.push(stripBold(rt));
            }
          }
          expressionItems.push({
            zh: expr.zh,
            pinyin: expr.pinyin,
            meaning: expr.meaning,
            notes: notes.join(" ").trim() || undefined,
            examples,
          });
          allSentences = false;
        } else {
          allExpressions = false;
          const joined = rest.length ? [firstLine, ...rest].join(" ") : firstLine;
          const s = parseSentence(joined);
          if (s && s.zh) {
            sentenceItems.push(s);
            mixedSentences.push(s);
          } else {
            allSentences = false;
            mixedNotes.push(stripBold(joined));
          }
        }
      }

      if (allExpressions && expressionItems.length) {
        blocks.push({ type: "expression-list", items: expressionItems });
      } else if (allSentences && sentenceItems.length) {
        if (pendingH3Grammar) {
          blocks.push({
            type: "expression-list",
            items: [
              {
                zh: pendingH3Grammar.zh,
                pinyin: pendingH3Grammar.pinyin,
                meaning: pendingH3Grammar.meaning,
                examples: sentenceItems,
                isGrammar: /[….]{2,}/.test(pendingH3Grammar.zh),
              },
            ],
          });
          pendingH3Grammar = null;
        } else {
          blocks.push({ type: "sentence-list", items: sentenceItems });
        }
      } else if (pendingH3Grammar && (mixedSentences.length || mixedNotes.length)) {
        // Mixed under a grammar/expression h3: notes + examples
        blocks.push({
          type: "expression-list",
          items: [
            {
              zh: pendingH3Grammar.zh,
              pinyin: pendingH3Grammar.pinyin,
              meaning: pendingH3Grammar.meaning,
              notes: mixedNotes.join(" ").trim() || undefined,
              examples: mixedSentences,
              isGrammar: /[….]{2,}/.test(pendingH3Grammar.zh),
            },
          ],
        });
        pendingH3Grammar = null;
      } else if (mixedSentences.length && mixedNotes.length) {
        // Standalone mixed: render notes as paragraph, sentences as sentence-list
        blocks.push({ type: "paragraph", text: mixedNotes.join(" ") });
        blocks.push({ type: "sentence-list", items: mixedSentences });
      } else {
        blocks.push({
          type: "bullet-list",
          items: rawItems.map((r) => stripBold(r.replace(/\n/g, " "))),
        });
      }
      continue;
    }

    // If pending grammar and this is a plain paragraph, emit grammar as expression with meaning only
    if (pendingH3Grammar) {
      const paraBuf: string[] = [];
      while (
        i < n &&
        lines[i].trim() &&
        !lines[i].trim().startsWith("#") &&
        !/^[*\-+]\s+/.test(lines[i].trim())
      ) {
        paraBuf.push(lines[i].trim());
        i++;
      }
      blocks.push({
        type: "expression-list",
        items: [
          {
            zh: pendingH3Grammar.zh,
            pinyin: pendingH3Grammar.pinyin,
            meaning: pendingH3Grammar.meaning,
            notes: paraBuf.join(" "),
            examples: [],
            isGrammar: /[….]{2,}/.test(pendingH3Grammar.zh),
          },
        ],
      });
      pendingH3Grammar = null;
      continue;
    }

    // Plain paragraph
    const paraBuf: string[] = [];
    while (i < n) {
      const t = lines[i].trim();
      if (!t) break;
      if (t.startsWith("#")) break;
      if (/^[*\-+]\s+/.test(t) || /^\d+\.\s+/.test(t)) break;
      if (t.startsWith("> ")) break;
      paraBuf.push(t);
      i++;
    }
    flushPara(paraBuf);
  }

  return blocks;
}

/* ============ Renderers ============ */

const TONES = [
  {
    text: "text-rose-600",
    bg: "bg-rose-500",
    soft: "from-rose-50 to-surface",
    border: "border-rose-100",
  },
  {
    text: "text-sky-600",
    bg: "bg-sky-500",
    soft: "from-sky-50 to-surface",
    border: "border-sky-100",
  },
  {
    text: "text-emerald-600",
    bg: "bg-emerald-500",
    soft: "from-emerald-50 to-surface",
    border: "border-emerald-100",
  },
  {
    text: "text-indigo-600",
    bg: "bg-indigo-500",
    soft: "from-indigo-50 to-surface",
    border: "border-indigo-100",
  },
  {
    text: "text-amber-600",
    bg: "bg-amber-500",
    soft: "from-amber-50 to-surface",
    border: "border-amber-100",
  },
];

function SentenceCard({
  s,
  index,
  tone,
  speak,
  speakingId,
  showPinyin,
}: {
  s: SentenceItem;
  index: number;
  tone: (typeof TONES)[number];
  speak: (t: string, id?: string) => void;
  speakingId: string | null;
  showPinyin: boolean;
}) {
  const speaking = speakingId === s.zh;
  const speaker = s.prefix ?? (index % 2 === 0 ? "A" : "B");
  return (
    <div className="flex items-start gap-2">
      <div
        className={cn(
          "shrink-0 grid place-items-center size-7 rounded-full text-white text-[11px] font-black shadow-sm ring-2 ring-surface",
          tone.bg,
        )}
      >
        {speaker.slice(0, 2).toUpperCase()}
      </div>
      <div
        className={cn(
          "relative flex-1 min-w-0 rounded-2xl bg-surface border px-3 py-2 shadow-sm",
          tone.border,
          speaking && "ring-2 ring-offset-1",
        )}
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div
              className="text-base sm:text-[17px] font-bold text-slate-900 leading-snug"
              lang="zh-CN"
            >
              {s.zh}
            </div>
            {showPinyin && s.pinyin && (
              <div
                className={cn("text-xs italic mt-0.5", tone.text)}
                style={{ fontFamily: "Georgia, serif" }}
              >
                {s.pinyin}
              </div>
            )}
            {s.ko && <div className="text-sm text-slate-600 mt-0.5 leading-snug">{s.ko}</div>}
          </div>
          <button
            type="button"
            onClick={() => speak(s.zh, s.zh)}
            className={cn(
              "shrink-0 grid place-items-center size-6 rounded-full text-white shadow-sm hover:scale-110 transition-transform cursor-pointer",
              tone.bg,
              speaking && "animate-pulse",
            )}
            aria-label="재생"
          >
            <Volume2 className="size-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ExpressionCard({
  item,
  index,
  speak,
  speakingId,
  showPinyin,
}: {
  item: ExpressionItem;
  index: number;
  speak: (t: string, id?: string) => void;
  speakingId: string | null;
  showPinyin: boolean;
}) {
  const tone = TONES[index % TONES.length];
  const speaking = speakingId === item.zh;
  // Extract leading emoji so it renders inline with the label instead of on its own line.
  const meaningMatch = item.meaning.match(/^(\p{Extended_Pictographic}(?:\uFE0F)?)\s*(.*)$/su);
  const meaningEmoji = meaningMatch?.[1] ?? null;
  const meaningText = meaningMatch ? meaningMatch[2] : item.meaning;
  return (
    <div
      className={cn(
        "relative rounded-3xl border bg-gradient-to-br shadow-[0_10px_30px_-15px_rgba(15,23,42,0.15)] p-3 sm:p-4 overflow-hidden",
        tone.soft,
        tone.border,
      )}
    >
      {/* corner accent */}
      <div
        className={cn("absolute -right-8 -top-8 size-24 rounded-full opacity-20 blur-2xl", tone.bg)}
      />

      {/* Header */}
      <div className="relative flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div
            className={cn(
              "shrink-0 grid place-items-center size-10 rounded-2xl text-white shadow-md",
              tone.bg,
            )}
          >
            {item.isGrammar ? (
              <GraduationCap className="size-5" />
            ) : (
              <Sparkles className="size-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <div
                className="text-2xl sm:text-3xl font-black text-slate-900 leading-none tracking-tight"
                lang="zh-CN"
              >
                {item.zh}
              </div>
              {item.pinyin && (
                <div
                  className={cn("text-sm italic", tone.text)}
                  style={{ fontFamily: "Georgia, serif" }}
                >
                  {item.pinyin}
                </div>
              )}
            </div>
            <div
              className={cn("mt-0.5 text-[10px] font-black tracking-[0.25em] uppercase", tone.text)}
            >
              {item.isGrammar ? "Grammar Pattern" : "Key Expression"}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => speak(item.zh, item.zh)}
          className={cn(
            "shrink-0 grid place-items-center size-8 rounded-full text-white shadow-sm hover:scale-110 transition-transform cursor-pointer",
            tone.bg,
            speaking && "animate-pulse",
          )}
          aria-label={`${item.zh} 재생`}
        >
          <Volume2 className="size-4" />
        </button>
      </div>

      {/* Meaning */}
      <div className="mt-3 rounded-2xl bg-surface/80 backdrop-blur border border-surface px-3.5 py-2.5">
        <div className={cn("flex items-center gap-1.5 mb-0.5", tone.text)}>
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase">Meaning</span>
          {meaningEmoji && <span className="text-sm leading-none">{meaningEmoji}</span>}
        </div>
        <p className="text-sm sm:text-base font-semibold text-slate-800 leading-snug">
          {meaningText}
        </p>
        {item.notes && (
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mt-1">{item.notes}</p>
        )}
      </div>

      {/* Examples */}
      {item.examples.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          <div
            className={cn(
              "text-[10px] font-bold tracking-[0.2em] uppercase flex items-center gap-1.5",
              tone.text,
            )}
          >
            <MessageSquareQuote className="size-3" />
            예문 {item.examples.length}
          </div>
          <div className="space-y-1.5">
            {item.examples.map((s, i) => (
              <SentenceCard
                key={i}
                s={s}
                index={i}
                tone={tone}
                speak={speak}
                speakingId={speakingId}
                showPinyin={showPinyin}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function H2({ text, number }: { text: string; number: number }) {
  return (
    <div className="mt-4 first:mt-1 flex items-center gap-3">
      <span className="h-9 w-1.5 rounded-full bg-gradient-to-b from-rose-500 via-fuchsia-500 to-indigo-500 shrink-0" />
      <span className="grid place-items-center size-9 rounded-xl bg-gradient-to-br from-rose-100 to-indigo-100 text-rose-600 shrink-0">
        <Sparkles className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-black tracking-[0.3em] text-slate-400 uppercase">
          § {String(number).padStart(2, "0")}
        </div>
        <h2 className="text-2xl sm:text-[28px] font-black text-slate-900 leading-tight truncate">
          {text}
        </h2>
      </div>
    </div>
  );
}

/* Inline text with TTS pill if Chinese present */
function InlineText({
  text,
  speak,
  speakingId,
}: {
  text: string;
  speak: (t: string, id?: string) => void;
  speakingId: string | null;
}) {
  const zh = extractChinese(text);
  // Render with markdown inline (for **bold**)
  return (
    <div className="prose prose-sm max-w-none prose-p:my-0 prose-strong:text-primary prose-strong:font-semibold text-slate-700 leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      {zh && (
        <div className="mt-2">
          <SpeakButton size="sm" text={zh} speak={speak} active={speakingId === zh} />
        </div>
      )}
    </div>
  );
}

/* ============ Main renderer ============ */

export function RichLessonContent({
  md,
  speak,
  speakingId,
  showPinyin = true,
  variant = "content",
}: {
  md: string;
  speak: (t: string, id?: string) => void;
  speakingId: string | null;
  showPinyin?: boolean;
  variant?: "content" | "slide";
}) {
  const blocks = useMemo(() => parseRichMarkdown(md), [md]);

  let h2Idx = 0;
  let paraIdx = 0;

  return (
    <div className={cn("space-y-2", variant === "slide" ? "" : "")}>
      {blocks.map((b, i) => {
        if (b.type === "h2") {
          h2Idx += 1;
          return <H2 key={i} text={b.text} number={h2Idx} />;
        }
        if (b.type === "h3") {
          return (
            <h3
              key={i}
              className="mt-6 mb-1 text-lg font-bold text-slate-900 flex items-center gap-2 before:content-[''] before:size-2 before:rotate-45 before:bg-gradient-to-br before:from-rose-400 before:to-indigo-400"
            >
              {b.number && <span className="text-rose-500 tabular-nums">{b.number}.</span>}
              {b.text}
            </h3>
          );
        }
        if (b.type === "paragraph") {
          paraIdx += 1;
          const isFirst = paraIdx === 1;
          const zh = extractChinese(b.text);
          return (
            <div
              key={i}
              className={cn(
                "group/para relative rounded-2xl px-4 py-3 transition-colors",
                zh
                  ? "border-l-[3px] border-transparent [border-image:linear-gradient(180deg,#fb7185,#818cf8)_1] bg-gradient-to-r from-rose-50/40 via-surface to-indigo-50/30"
                  : "bg-surface/60",
              )}
            >
              <div
                className={cn(
                  "prose prose-sm sm:prose max-w-none prose-p:my-0 prose-strong:text-primary text-slate-700 leading-[1.85]",
                  isFirst &&
                    variant === "content" &&
                    "first-letter:float-left first-letter:mr-2 first-letter:text-5xl first-letter:font-bold first-letter:leading-[0.9] first-letter:text-transparent first-letter:bg-clip-text first-letter:bg-gradient-to-br first-letter:from-rose-500 first-letter:to-indigo-500",
                )}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{b.text}</ReactMarkdown>
              </div>
              {zh && (
                <div className="absolute -top-2 right-2 opacity-0 group-hover/para:opacity-100 transition-opacity">
                  <SpeakButton size="sm" text={zh} speak={speak} active={speakingId === zh} />
                </div>
              )}
            </div>
          );
        }
        if (b.type === "blockquote") {
          return (
            <blockquote
              key={i}
              className="relative rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 via-surface to-indigo-50/50 px-6 py-5 pl-14 shadow-sm"
            >
              <Quote className="absolute left-4 top-4 size-6 text-sky-400/70" />
              <div className="text-[10px] font-bold tracking-[0.2em] text-sky-500 uppercase mb-1">
                핵심 포인트
              </div>
              <div className="text-slate-800 leading-relaxed italic">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{b.text}</ReactMarkdown>
              </div>
            </blockquote>
          );
        }
        if (b.type === "expression-list") {
          return (
            <div
              key={i}
              className={cn(
                "grid gap-2.5",
                // A lone expression in its own block used to sit in the left
                // half of a two-column grid with dead space beside it, and the
                // Chinese line wrapped mid-phrase for no reason. Only split
                // into columns when there is actually something to pair with —
                // and never inside a slide, where the column is already narrow.
                b.items.length > 1 && variant !== "slide" && "md:grid-cols-2",
              )}
            >
              {b.items.map((item, idx) => (
                <ExpressionCard
                  key={idx}
                  item={item}
                  index={idx}
                  speak={speak}
                  speakingId={speakingId}
                  showPinyin={showPinyin}
                />
              ))}
            </div>
          );
        }
        if (b.type === "sentence-list") {
          return (
            <div
              key={i}
              className="rounded-3xl bg-surface/70 border border-surface p-4 sm:p-5 shadow-sm space-y-2"
            >
              <div className="text-[10px] font-black tracking-[0.3em] uppercase text-rose-500 flex items-center gap-1.5">
                <MessageSquareQuote className="size-3" /> 예문
              </div>
              {b.items.map((s, idx) => (
                <SentenceCard
                  key={idx}
                  s={s}
                  index={idx}
                  tone={TONES[idx % TONES.length]}
                  speak={speak}
                  speakingId={speakingId}
                  showPinyin={showPinyin}
                />
              ))}
            </div>
          );
        }
        if (b.type === "bullet-list") {
          return (
            <ul
              key={i}
              className={cn("grid gap-2 list-none p-0", b.items.length > 1 && "sm:grid-cols-2")}
            >
              {b.items.map((t, idx) => {
                const tone = TONES[idx % TONES.length];
                const zh = extractChinese(t);
                return (
                  <li
                    key={idx}
                    className={cn(
                      "flex items-start gap-2.5 rounded-2xl bg-surface border p-3 shadow-sm hover:shadow-md transition-shadow",
                      tone.border,
                    )}
                  >
                    <span className={cn("mt-1.5 size-1.5 rounded-full shrink-0", tone.bg)} />
                    <span className="flex-1 text-sm text-slate-700 leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{t}</ReactMarkdown>
                    </span>
                    {zh && (
                      <SpeakButton size="sm" text={zh} speak={speak} active={speakingId === zh} />
                    )}
                  </li>
                );
              })}
            </ul>
          );
        }
        return null;
      })}
    </div>
  );
}
