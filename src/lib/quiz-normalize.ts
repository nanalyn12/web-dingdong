// Repair AI-authored quiz items into the one shape the lesson quiz UI renders.
//
// The lesson generators only ever told Gemini "[quiz] 정확히 6개. choice 2 +
// fill 2 + order 2" without naming a single field, so every run invented its
// own keys: 654 stored items across 117 distinct shapes. None of them carried
// `correct`, only 56 carried `question_ko`, and most `options` were arrays of
// {zh, pinyin, ko} objects — which the choice renderer passed straight to React
// as a child, throwing "Objects are not valid as a React child" and taking the
// whole 퀴즈 tab down with it. That is why lessons looked quiz-less.
//
// Everything needed to render is already in those items, just under different
// names, so this recovers them locally instead of regenerating with the API.
// Pure and dependency-free: the lesson page runs it on read, and the
// generators run it before writing so new lessons are stored canonical.
//
// Anything that still cannot be rendered is dropped — a missing question beats
// a broken one.

export type QuizChoice = {
  type: "choice";
  question_ko: string;
  question_zh?: string;
  options: string[];
  correct: number;
  explanation?: string;
};

export type QuizFill = {
  type: "fill";
  question_ko: string;
  sentence_zh: string;
  answer: string;
  hint?: string;
  explanation?: string;
};

export type QuizOrder = {
  type: "order";
  question_ko: string;
  words: string[];
  correct_order: number[];
  answer_text?: string;
  explanation?: string;
};

export type QuizItem = QuizChoice | QuizFill | QuizOrder;

/* ---------------- small helpers ---------------- */

const HAN = /[㐀-鿿]/;
const HANGUL = /[가-힣]/;
/** Blank markers seen in stored items: ___, ＿＿, （ ）, ( ), □□. */
const BLANK_RE = /[_＿]{2,}|（\s*）|\(\s*\)|□{1,}/;
/** Leading option labels the model bakes into the text: "A. ", "b) ", "A、". */
const OPTION_LABEL_RE = /^\s*[A-Da-d]\s*[.)、．：:]\s*/;

const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function text(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number") return String(v);
  return undefined;
}

/** First non-empty string among the given keys. */
function pick(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = text(o[k]);
    if (v) return v;
  }
  return undefined;
}

/** Chinese payload of a value that may be a plain string or a {zh,…} object. */
function zhOf(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim().replace(OPTION_LABEL_RE, "") || undefined;
  const o = rec(v);
  return pick(o, ["zh", "text", "word", "sentence"]);
}

/** Comparison key: drop spacing and punctuation so "我爱你。" == "我 爱 你". */
function fold(s: string): string {
  return s
    .replace(OPTION_LABEL_RE, "")
    .replace(/\s/g, "") // \s covers the ideographic space U+3000 too
    .replace(/[-.,!?;:'"·。，、？！；：“”‘’（）()《》〈〉…—]/g, "")
    .toLowerCase();
}

function normalizeBlanks(s: string): string {
  return s.replace(/[_＿]{2,}/g, "___").replace(/（\s*）|\(\s*\)|□+/g, "___");
}

const hasBlank = (s: string | undefined) => !!s && BLANK_RE.test(s);

/** Deterministic shuffle — a fresh order on every render would reset the
 * learner's in-progress answer. */
function seededShuffle<T>(arr: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    h = (Math.imul(h, 48271) + 11) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** An index that may have been written 0-based or 1-based. */
function asIndex(v: unknown, len: number): number {
  const n =
    typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
  if (!Number.isInteger(n)) return -1;
  if (n >= 0 && n < len) return n;
  if (n >= 1 && n <= len) return n - 1; // 1-based
  return -1;
}

/* ---------------- shared field extraction ---------------- */

const EXPLANATION_KEYS = [
  "explanation",
  "explanation_ko",
  "ko_explanation",
  "ko_answer_explanation",
  "ko_answer_description",
  "explanation_zh",
];
const HINT_KEYS = ["hint", "hint_ko", "ko_hint", "pinyin_hint", "zh_hint"];

/** Split whatever the model called "the question" into a Korean prompt and an
 * optional Chinese sentence. `question` is Korean about half the time and the
 * Chinese sentence itself the other half, with `ko` holding the translation. */
function splitQuestion(o: Record<string, unknown>): { ko?: string; zh?: string } {
  const explicitKo = pick(o, ["question_ko"]);
  const explicitZh = pick(o, ["question_zh", "zh_question"]);
  const raw = pick(o, ["question"]);
  const ko = pick(o, ["ko", "ko_sentence"]);

  if (explicitKo)
    return { ko: explicitKo, zh: explicitZh ?? (raw && !HANGUL.test(raw) ? raw : undefined) };
  if (!raw) return { ko: ko, zh: explicitZh };
  // Chinese-only question → the Korean line lives in `ko`.
  if (HAN.test(raw) && !HANGUL.test(raw)) return { ko: ko ?? raw, zh: explicitZh ?? raw };
  return { ko: raw, zh: explicitZh };
}

/* ---------------- choice ---------------- */

type Opt = { label: string; zh?: string; ko?: string; flagged: boolean };

function toOption(v: unknown): Opt | null {
  if (typeof v === "string") {
    const label = v.trim().replace(OPTION_LABEL_RE, "");
    return label ? { label, zh: HAN.test(label) ? label : undefined, flagged: false } : null;
  }
  const o = rec(v);
  if (!Object.keys(o).length) return null;
  const zh = pick(o, ["zh", "text", "word"]);
  const ko = pick(o, ["ko", "meaning"]);
  const pinyin = pick(o, ["pinyin"]);
  const flagged = o.is_answer === true || o.is_correct === true || o.correct === true;
  if (!zh && !ko) {
    // Shapes like {"A": "..."} — the only string value is the option text.
    const only = Object.values(o).find((x): x is string => typeof x === "string" && !!x.trim());
    return only ? { label: only.trim().replace(OPTION_LABEL_RE, ""), flagged } : null;
  }
  const label = [zh, pinyin && `(${pinyin})`, zh && ko && "·", !zh || ko ? ko : undefined]
    .filter(Boolean)
    .join(" ")
    .trim();
  return label ? { label, zh, ko, flagged } : null;
}

function resolveCorrect(o: Record<string, unknown>, opts: Opt[]): number {
  const flagged = opts.findIndex((x) => x.flagged);
  if (flagged >= 0) return flagged;

  for (const key of ["answer_index", "correct", "correct_index", "answer_idx"]) {
    if (key in o) {
      const i = asIndex(o[key], opts.length);
      if (i >= 0) return i;
    }
  }

  const rawAnswer = o.answer;
  if (typeof rawAnswer === "number") {
    const i = asIndex(rawAnswer, opts.length);
    if (i >= 0) return i;
  }

  const candidates = [
    typeof rawAnswer === "string" ? rawAnswer : undefined,
    zhOf(rawAnswer),
    pick(o, ["answer_zh", "answer_ko", "ko_answer"]),
  ].filter((x): x is string => !!x && !!x.trim());

  for (const cand of candidates) {
    const c = cand.trim();
    // "B" / "b" → positional.
    if (/^[A-Da-d]$/.test(c)) {
      const i = c.toUpperCase().charCodeAt(0) - 65;
      if (i < opts.length) return i;
    }
    if (/^\d+$/.test(c)) {
      const i = asIndex(Number(c), opts.length);
      if (i >= 0) return i;
    }
    const f = fold(c);
    if (!f) continue;
    const exact = opts.findIndex(
      (x) => fold(x.zh ?? "") === f || fold(x.ko ?? "") === f || fold(x.label) === f,
    );
    if (exact >= 0) return exact;
    const partial = opts.findIndex((x) => {
      const l = fold(x.label);
      return l.length > 1 && (l.includes(f) || f.includes(l));
    });
    if (partial >= 0) return partial;
  }
  return -1;
}

function normalizeChoice(o: Record<string, unknown>): QuizChoice | null {
  const rawOpts = [o.options, o.choices, o.options_zh, o.answers].find(Array.isArray) as
    | unknown[]
    | undefined;
  if (!rawOpts) return null;
  const opts = rawOpts.map(toOption).filter((x): x is Opt => !!x);
  if (opts.length < 2) return null;

  const correct = resolveCorrect(o, opts);
  if (correct < 0) return null; // no answer we can trust — better to drop

  const { ko, zh } = splitQuestion(o);
  return {
    type: "choice",
    question_ko: ko ?? "다음 중 알맞은 것을 고르세요.",
    question_zh: zh && zh !== ko ? zh : undefined,
    options: opts.map((x) => x.label),
    correct,
    explanation: pick(o, EXPLANATION_KEYS),
  };
}

/* ---------------- fill ---------------- */

/** Strip a Chinese or Korean instruction label: "请填空：你___吗？". */
function stripLabel(s: string): string {
  const m = s.match(/^\s*([^:：\n]{1,12})[:：]\s*(.+)$/s);
  return m && HAN.test(m[2]) ? m[2].trim() : s.trim();
}

function normalizeFill(o: Record<string, unknown>): QuizFill | null {
  const answer =
    pick(o, ["answer", "answer_zh", "correct_answer"]) ??
    zhOf(o.answer) ??
    (Array.isArray(o.correct_words_zh)
      ? o.correct_words_zh.map(zhOf).filter(Boolean).join("")
      : undefined);
  if (!answer) return null;

  let sentence = pick(o, ["sentence_zh", "zh_sentence", "sentence"]);
  let questionKo = pick(o, ["question_ko"]);
  let hint = pick(o, HINT_KEYS);

  const raw = pick(o, ["question"]);
  const segments = (raw ?? "")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (!sentence) {
    // The blanked sentence is usually one line of `question`, sometimes tucked
    // inside parentheses ("저는 …입니다. (빈칸 채우기: 我___李智秀。)"), with the
    // Korean instruction around it.
    const paren = (raw ?? "").match(/[（(]([^）)]*(?:[_＿]{2,}|□)[^）)]*)[）)]/);
    if (paren) {
      sentence = stripLabel(paren[1]);
      questionKo ??= (raw ?? "").replace(paren[0], "").trim() || undefined;
    } else {
      const blankSeg = segments.find(hasBlank);
      if (blankSeg) {
        sentence = blankSeg;
        questionKo ??= segments.filter((s) => s !== blankSeg).join(" ") || undefined;
      } else {
        const zhq = pick(o, ["question_zh", "zh_question"]);
        if (zhq) {
          sentence = stripLabel(zhq);
          questionKo ??= raw;
        } else if (raw && HAN.test(raw) && !HANGUL.test(raw)) {
          sentence = raw;
        }
      }
    }
  }

  // "我不能___你。 (나는 너 없이는 안 돼.)" — move a trailing translation out of
  // the sentence so the blanked line stays clean Chinese.
  if (sentence) {
    const trailing = sentence.match(/[（(]([^）)_＿]*[가-힣][^）)_＿]*)[）)]\s*$/);
    if (trailing && hasBlank(sentence.slice(0, trailing.index))) {
      questionKo ??= trailing[1].trim();
      sentence = sentence.slice(0, trailing.index).trim();
    }
  }

  questionKo ??= segments.find((s) => HANGUL.test(s) && s !== sentence);
  questionKo ??= pick(o, ["ko", "ko_sentence"]);
  hint ??= pick(o, ["ko", "pinyin"]);

  // No Chinese sentence at all — the item is a short-answer prompt ("…라고
  // 말할 때 쓰는 표현은?"). The blank alone is a fine target as long as the
  // Korean question carries the actual task.
  if (!sentence && !questionKo) return null;

  return {
    type: "fill",
    question_ko: questionKo ?? "빈칸에 알맞은 말을 넣어보세요.",
    sentence_zh: normalizeBlanks(
      !sentence ? "___" : hasBlank(sentence) ? sentence : `${sentence} ___`,
    ),
    answer,
    hint: hint && hint !== questionKo ? hint : undefined,
    explanation: pick(o, EXPLANATION_KEYS),
  };
}

/* ---------------- order ---------------- */

const WORD_KEYS = [
  "words",
  "words_zh",
  "scrambled_words",
  "scrambled_zh_words",
  "shuffled_words_zh",
  "scrambled_zh",
  "parts",
  "sentence_zh", // some items store the scrambled tiles under this name
];
const ORDER_INDEX_KEYS = ["correct_order", "correct_order_indices", "answer_order"];
// `correct_order` / `answer_order` hold indices about as often as they hold the
// ordered words themselves, so both names appear here and above.
const ORDERED_WORDS_KEYS = [
  "correct_order",
  "answer_order",
  "correct_order_zh",
  "correct_words_zh",
  "correct_order_pinyin",
];
const SENTENCE_KEYS = [
  "answer_zh",
  "ordered_sentence_zh",
  "ordered_sentence",
  "correct_sentence_zh",
  "full_sentence",
  "sentence_zh",
];

/** Walk the target sentence and consume `words` in the order they appear,
 * longest candidate first so "电视剧" wins over a stray "电".
 *
 * Returns the word indices in sentence order. It may be shorter than `words`:
 * models sometimes stuff a distractor into the list ("你" alongside "带你")
 * that the answer never uses. Covering the whole sentence is what matters —
 * the caller drops whatever was left over. */
function orderFromSentence(words: string[], sentence: string): number[] | null {
  let rest = fold(sentence);
  const used = new Set<number>();
  const out: number[] = [];
  while (rest.length && out.length < words.length) {
    let best = -1;
    let bestLen = 0;
    for (let i = 0; i < words.length; i++) {
      if (used.has(i)) continue;
      const w = fold(words[i]);
      if (w && rest.startsWith(w) && w.length > bestLen) {
        best = i;
        bestLen = w.length;
      }
    }
    if (best < 0) return null;
    used.add(best);
    out.push(best);
    rest = rest.slice(bestLen);
  }
  return rest.length ? null : out;
}

/** Word lists the model wrote into prose instead of an array:
 * "…배열하세요: 魅力 / C-POP / 的 / 探索" or "…만드세요.\n[这个 / 我 / 要 / 点]". */
function wordsFromText(s: string | undefined): string[] {
  if (!s || !s.includes("/")) return [];
  const body =
    s.match(/[[［(（]([^\]］)）\n]*\/[^\]］)）\n]*)[\]］)）]/)?.[1] ??
    s.match(/[:：]\s*([^\n]*\/[^\n]*)/)?.[1] ??
    s.match(/([^\n]*\/[^\n]*)/)?.[1];
  const parts = (body ?? "")
    .split(/[/、,，]/)
    .map((t) => t.trim())
    .filter(Boolean);
  return parts.length >= 2 && parts.some((p) => HAN.test(p)) ? parts : [];
}

function normalizeOrder(o: Record<string, unknown>): QuizOrder | null {
  const { ko, zh } = splitQuestion(o);
  const rawWords = WORD_KEYS.map((k) => o[k]).find(Array.isArray) as unknown[] | undefined;
  // Punctuation-only tiles ("。", "！") are noise the learner cannot place and
  // they never appear in the folded answer, so they would fail every match.
  let words = (rawWords ?? []).map(zhOf).filter((w): w is string => !!w && !!fold(w));

  const orderedWords = (
    (Array.isArray(o.answer) ? (o.answer as unknown[]) : undefined) ??
    (ORDERED_WORDS_KEYS.map((k) => o[k]).find(
      (v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x !== "number"),
    ) as unknown[] | undefined) ??
    []
  )
    .map(zhOf)
    .filter((w): w is string => !!w && !!fold(w));

  const sentence =
    (typeof o.answer === "string" ? o.answer.trim() : undefined) ??
    SENTENCE_KEYS.map((k) => zhOf(o[k])).find(Boolean) ??
    zhOf(o.ordered_sentence) ??
    (typeof o.correct_order === "string" ? o.correct_order.trim() : undefined);

  if (words.length < 2) words = wordsFromText(pick(o, ["question", "question_zh", "zh_question"]));
  // Still nothing scrambled — build the tiles from the answer itself.
  if (words.length < 2) {
    if (orderedWords.length < 2) return null;
    words = seededShuffle(orderedWords, orderedWords.join("|"));
  }

  let order: number[] | null = null;

  const rawOrder = ORDER_INDEX_KEYS.map((k) => o[k]).find(
    (v) => Array.isArray(v) && v.length > 0 && v.every((n) => typeof n === "number"),
  ) as number[] | undefined;
  if (rawOrder && rawOrder.length === words.length) {
    const base = Math.min(...rawOrder) === 1 && Math.max(...rawOrder) === words.length ? 1 : 0;
    const shifted = rawOrder.map((n) => n - base);
    if (
      shifted.every((n) => n >= 0 && n < words.length) &&
      new Set(shifted).size === words.length
    ) {
      order = shifted;
    }
  }

  if (!order && orderedWords.length === words.length) {
    const used = new Set<number>();
    const mapped = orderedWords.map((w) => {
      const i = words.findIndex((x, idx) => !used.has(idx) && fold(x) === fold(w));
      if (i >= 0) used.add(i);
      return i;
    });
    if (mapped.every((i) => i >= 0)) order = mapped;
  }

  if (!order) {
    const target = sentence ?? (orderedWords.length ? orderedWords.join("") : undefined);
    const seq = target ? orderFromSentence(words, target) : null;
    if (seq) {
      // Drop tiles the answer never uses, then renumber against what is left.
      if (seq.length < words.length) {
        const kept = seq.map((i) => words[i]);
        words = seededShuffle(kept, kept.join("|"));
        const used = new Set<number>();
        order = kept.map((w) => {
          const i = words.findIndex((x, idx) => !used.has(idx) && x === w);
          used.add(i);
          return i;
        });
      } else {
        order = seq;
      }
    }
  }

  if (!order || order.length !== words.length) return null;

  // Show the sentence the tiles actually spell. Where the stored answer has a
  // word the tile list is missing, echoing it back would tell a learner who
  // arranged every tile correctly that the answer was something else.
  const rebuilt = order.map((i) => words[i]).join("");
  const answerText = sentence && fold(sentence) === fold(rebuilt) ? sentence : rebuilt;

  return {
    type: "order",
    question_ko: ko ?? "다음 단어를 올바른 순서로 배열하세요.",
    words,
    correct_order: order,
    answer_text: answerText || zh,
    explanation: pick(o, EXPLANATION_KEYS),
  };
}

/* ---------------- entry point ---------------- */

/** Infer the kind when `type` is missing or non-standard
 * (`fill_in_the_blank` accounts for 46 stored items on its own). */
function kindOf(o: Record<string, unknown>): "choice" | "fill" | "order" | null {
  const t = (text(o.type) ?? "").toLowerCase();
  if (t.startsWith("choice") || t.includes("multiple")) return "choice";
  if (t.startsWith("order") || t.includes("arrange") || t.includes("sort")) return "order";
  if (t.startsWith("fill") || t.includes("blank")) return "fill";
  if (Array.isArray(o.options) || Array.isArray(o.choices)) return "choice";
  if (WORD_KEYS.some((k) => Array.isArray(o[k]))) return "order";
  if (o.answer !== undefined) return "fill";
  return null;
}

export function normalizeQuizItem(raw: unknown): QuizItem | null {
  const o = rec(raw);
  if (!Object.keys(o).length) return null;
  switch (kindOf(o)) {
    case "choice":
      return normalizeChoice(o);
    case "fill":
      return normalizeFill(o);
    case "order":
      return normalizeOrder(o);
    default:
      return null;
  }
}

/** Normalize a whole stored `lessons.quiz` array, dropping unrenderable items. */
export function normalizeQuiz(raw: unknown): QuizItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeQuizItem).filter((q): q is QuizItem => !!q);
}

/** For write paths. Falls back to the raw array when nothing normalizes, so a
 * generation is never silently thrown away — the read path normalizes too, and
 * a later pass can still recover it. */
export function normalizeQuizForStorage(raw: unknown): unknown[] {
  const items = normalizeQuiz(raw);
  if (items.length) return items;
  return Array.isArray(raw) ? raw : [];
}

/** The exact shape to ask the model for. Both lesson generators embed this, so
 * the prompt and the renderer cannot drift apart again. */
export const QUIZ_PROMPT_SPEC = `[quiz] 정확히 6개 (choice 2 + fill 2 + order 2). 아래 JSON 형태를 그대로 지키세요. 키 이름을 바꾸거나 추가하지 마세요.
- choice: {"type":"choice","question_ko":"한국어 질문","question_zh":"중국어 질문(선택)","options":["보기1","보기2","보기3","보기4"],"correct":0,"explanation":"한국어 해설"}
  · options는 반드시 **문자열** 배열. 객체 배열 금지. 보기 앞에 "A." "B)" 같은 기호를 붙이지 말 것.
  · correct는 반드시 정답 보기의 **0부터 시작하는 숫자 인덱스**. 정답 텍스트나 "B" 같은 알파벳 금지.
- fill: {"type":"fill","question_ko":"한국어 지시문","sentence_zh":"빈칸을 ___로 표시한 중국어 문장","answer":"빈칸에 들어갈 한자","hint":"힌트(선택)","explanation":"한국어 해설"}
  · sentence_zh에는 한자만 (한국어 번역은 question_ko에). 빈칸은 밑줄 3개 ___ 로 표시.
  · answer는 빈칸에 그대로 들어갈 한자 문자열.
- order: {"type":"order","question_ko":"한국어 지시문","words":["단어1","단어2","단어3"],"correct_order":[2,0,1],"answer_text":"완성된 중국어 문장","explanation":"한국어 해설"}
  · words는 **섞인 순서**의 문자열 배열. 구두점만 있는 항목(。！，) 금지.
  · correct_order는 words의 0부터 시작하는 인덱스를 정답 순서대로 나열하며, 길이가 words와 같아야 함.
  · answer_text는 words를 correct_order 순서로 이어붙인 문장과 정확히 일치해야 함.`;
