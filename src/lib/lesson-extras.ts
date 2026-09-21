// AI 생성형 세부강의의 두 부가 콘텐츠 — 헷갈리는 단어 비교(vocab_comparison)와
// 스토리북(storybook_pages) — 를 화면이 읽을 수 있는 한 가지 모양으로 맞춘다.
//
// 생성 프롬프트가 두 필드의 구조를 정하지 않았던 탓에(`[vocab_comparison] 2-3개.`
// 가 전부였다), 운영 DB에는 어휘 비교 21가지·스토리북 10가지 키 조합이 섞여
// 있다. 그래서 화면은 두 컬럼을 select조차 하지 않았고, 22편에 저장된 132쪽과
// 50개가 학습자에게 한 번도 보이지 않았다.
//
// quiz-normalize.ts 와 같은 방식이다: 저장된 모양은 믿지 않고 읽을 때 고친다.
// 앞으로 만들어질 것은 아래 *_SHAPE 를 프롬프트가 그대로 요구해 한 모양으로
// 들어온다. 모르는 모양은 조용히 버린다 — 틀린 내용을 그리느니 안 그린다.

export type ExtraWord = { zh: string; pinyin?: string; ko?: string };

export type VocabComparison = {
  /** 한국어 단어 하나에 여러 중국어가 대응하는 경우의 그 한국어("인기"). */
  title?: string;
  words: ExtraWord[];
  /** 두 단어의 차이 설명(한국어). */
  note?: string;
  example?: ExtraWord;
};

export type StoryLine = { speaker?: string; zh: string; pinyin?: string; ko?: string };

export type StoryPage = {
  title?: string;
  /** 한국어 서술. */
  ko?: string;
  /** 페이지 서술의 중국어(있는 경우). */
  zh?: string;
  pinyin?: string;
  lines: StoryLine[];
};

/** 프롬프트가 요구하는 어휘 비교 한 항목의 모양. generate-lesson 이 그대로 끼워 쓴다. */
export const VOCAB_COMPARISON_SHAPE = JSON.stringify({
  words: [
    { zh: "喜欢", pinyin: "xǐhuan", ko: "좋아하다" },
    { zh: "爱", pinyin: "ài", ko: "사랑하다" },
  ],
  note: "'喜欢'은 가벼운 호감, '爱'는 깊은 애정을 나타냅니다.",
  example: {
    zh: "我喜欢看电影。",
    pinyin: "Wǒ xǐhuan kàn diànyǐng.",
    ko: "저는 영화 보는 것을 좋아해요.",
  },
});

/** 프롬프트가 요구하는 스토리북 한 페이지의 모양. */
export const STORYBOOK_PAGE_SHAPE = JSON.stringify({
  page_number: 1,
  narration: "지수는 처음으로 중국 친구 叮叮을 만났어요.",
  lines: [
    {
      speaker: "叮叮",
      zh: "你好！我叫叮叮。",
      pinyin: "Nǐ hǎo! Wǒ jiào Dīngdīng.",
      ko: "안녕! 나는 叮叮이야.",
    },
  ],
  image_prompt:
    "Ji-su meeting a friend at a cafe. Watercolor storybook style. No text, no characters.",
});

// ---------------------------------------------------------------- helpers

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

const HAN = /[㐀-鿿]/;

/** 비어 있지 않은 문자열이면 다듬어 돌려준다. 마크다운 굵게 표시(**)는 걷어 낸다. */
function text(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\*\*/g, "").trim();
  return t ? t : undefined;
}

/** 여러 후보 중 처음으로 값이 있는 것. */
function first(o: Obj, keys: string[]): string | undefined {
  for (const k of keys) {
    const t = text(o[k]);
    if (t) return t;
  }
  return undefined;
}

/**
 * `"业务 (yèwù)"` 처럼 한자 뒤에 병음을 괄호로 붙여 둔 것을 떼어 낸다. 괄호 안에
 * 한자가 있으면(`"打算（计划）"`) 병음이 아니라 뜻풀이이므로 그대로 둔다.
 */
function splitParenPinyin(zh: string): { zh: string; pinyin?: string } {
  const m = /^(.+?)\s*[(（]\s*([^()（）]+?)\s*[)）]\s*$/.exec(zh);
  if (!m || HAN.test(m[2]) || !HAN.test(m[1])) return { zh };
  return { zh: m[1].trim(), pinyin: m[2] };
}

function word(zh: unknown, pinyin: unknown, ko: unknown): ExtraWord | null {
  const z = text(zh);
  if (!z) return null;
  const split = splitParenPinyin(z);
  const w: ExtraWord = { zh: split.zh };
  const p = text(pinyin) ?? split.pinyin;
  if (p) w.pinyin = p;
  const k = text(ko);
  if (k) w.ko = k;
  return w;
}

const VS = /\s+vs\.?\s+/i;

/** `"辨析 vs 区分"` → 두 단어. vs 꼴이 아니면 null. */
function wordsFromVs(v: unknown): ExtraWord[] | null {
  const t = text(v);
  if (!t || !VS.test(t)) return null;
  const parts = t.split(VS).map((p) => word(p, undefined, undefined));
  return parts.every((p): p is ExtraWord => p !== null) && parts.length >= 2 ? parts : null;
}

/** 비교되는 두 쪽의 키 이름 묶음. 저장된 21가지 조합이 이 중 하나씩을 쓴다. */
const PRIMARY: [string, string, string][] = [
  ["zh_a", "pinyin_a", "ko_a"],
  ["zh1", "pinyin1", "ko1"],
  ["word_zh", "word_pinyin", "word_ko"],
  ["zh_word", "pinyin", "ko_meaning"],
  ["zh", "pinyin", "ko"],
];
const SECONDARY: [string, string, string][] = [
  ["zh_b", "pinyin_b", "ko_b"],
  ["zh2", "pinyin2", "ko2"],
  ["compare_zh", "compare_pinyin", "compare_ko"],
  ["zh_compare", "pinyin_compare", "ko_compare"],
  ["compare_to_zh", "compare_to_pinyin", "compare_to_ko"],
];

const NOTE_KEYS = [
  "note",
  "comparison",
  "explanation",
  "explanation_ko",
  "description",
  "comparison_note_ko",
  "comparison_ko",
  "notes",
];

function fromSlots(o: Obj, slots: [string, string, string][]): ExtraWord | null {
  for (const [z, p, k] of slots) {
    const w = word(o[z], o[p], o[k]);
    if (w) return w;
  }
  return null;
}

function wordsOf(o: Obj): { words: ExtraWord[]; koIsNote: boolean } {
  // 지금 프롬프트가 요구하는 모양.
  if (Array.isArray(o.words)) {
    const ws = o.words.filter(isObj).map((w) => word(w.zh, w.pinyin, w.ko));
    return { words: ws.filter((w): w is ExtraWord => w !== null), koIsNote: false };
  }
  if (isObj(o.word1)) {
    const ws = [o.word1, o.word2].filter(isObj).map((w) => word(w.zh, w.pinyin, w.ko));
    return { words: ws.filter((w): w is ExtraWord => w !== null), koIsNote: false };
  }
  if (Array.isArray(o.chinese_words)) {
    const ws = o.chinese_words.filter(isObj).map((w) => word(w.zh, w.pinyin, w.ko_meaning ?? w.ko));
    return { words: ws.filter((w): w is ExtraWord => w !== null), koIsNote: false };
  }
  // "辨析 vs 区分" 한 줄 + 긴 ko 설명.
  const vsZh = wordsFromVs(o.zh);
  if (vsZh) return { words: vsZh, koIsNote: true };

  const a = fromSlots(o, PRIMARY);
  const b = fromSlots(o, SECONDARY);
  if (a) return { words: b ? [a, b] : [a], koIsNote: false };

  // 제목만 "可以 (kěyǐ) vs 能 (néng)" 이고 나머지는 설명인 경우.
  const vsTitle = wordsFromVs(o.title);
  return { words: vsTitle ?? [], koIsNote: false };
}

function noteOf(o: Obj, koIsNote: boolean): string | undefined {
  if (koIsNote) return text(o.ko);
  // 설명이 두 단어에 하나씩 나뉘어 저장된 경우는 이어 붙인다.
  const pair = [text(o.description_ko), text(o.description_ko2)].filter(Boolean);
  if (pair.length) return pair.join("\n");
  return first(o, NOTE_KEYS);
}

function exampleOf(o: Obj): ExtraWord | undefined {
  // 지금 프롬프트가 요구하는 모양: example: { zh, pinyin, ko }.
  if (isObj(o.example))
    return exampleOf({
      example_zh: o.example.zh,
      example_pinyin: o.example.pinyin,
      example_ko: o.example.ko,
    });
  const zh = first(o, ["example_zh", "zh_example"]);
  if (!zh) return undefined;
  const ex: ExtraWord = { zh };
  const p = text(o.example_pinyin);
  if (p) ex.pinyin = p;
  const k = first(o, ["example_ko", "ko_example"]);
  if (k) ex.ko = k;
  return ex;
}

// ---------------------------------------------------------------- public

export function normalizeVocabComparison(raw: unknown): VocabComparison[] {
  if (!Array.isArray(raw)) return [];
  const out: VocabComparison[] = [];
  for (const item of raw) {
    if (!isObj(item)) continue;
    const { words, koIsNote } = wordsOf(item);
    if (words.length === 0) continue;
    const c: VocabComparison = { words };
    const title = text(item.korean_word);
    if (title) c.title = title;
    const note = noteOf(item, koIsNote);
    if (note) c.note = note;
    const example = exampleOf(item);
    if (example) c.example = example;
    out.push(c);
  }
  return out;
}

function storyLine(raw: unknown): StoryLine | null {
  if (!isObj(raw)) return null;
  const zh = text(raw.zh);
  if (!zh) return null;
  const l: StoryLine = { zh };
  const speaker = text(raw.speaker);
  if (speaker) l.speaker = speaker;
  const pinyin = text(raw.pinyin);
  if (pinyin) l.pinyin = pinyin;
  const ko = text(raw.ko);
  if (ko) l.ko = ko;
  return l;
}

function storyPage(raw: Obj): StoryPage | null {
  const rawLines = Array.isArray(raw.lines) ? raw.lines : isObj(raw.lines) ? [raw.lines] : [];
  const lines = rawLines.map(storyLine).filter((l): l is StoryLine => l !== null);
  const ko = first(raw, ["text_ko", "text", "narration"]);
  const zh = first(raw, ["text_zh", "zh"]);
  if (!ko && !zh && lines.length === 0) return null;
  const p: StoryPage = { lines };
  const title = text(raw.title);
  if (title) p.title = title;
  if (ko) p.ko = ko;
  if (zh) p.zh = zh;
  const pinyin = text(raw.pinyin);
  if (pinyin) p.pinyin = pinyin;
  return p;
}

export function normalizeStorybook(raw: unknown): StoryPage[] {
  if (!Array.isArray(raw)) return [];
  const objs = raw.filter(isObj);
  // 모든 페이지에 번호가 있을 때만 번호순으로. 섞여 있으면 저장 순서를 믿는다.
  const numbered = objs.length > 0 && objs.every((o) => typeof o.page_number === "number");
  const ordered = numbered
    ? [...objs].sort((a, b) => (a.page_number as number) - (b.page_number as number))
    : objs;
  return ordered.map(storyPage).filter((p): p is StoryPage => p !== null);
}
