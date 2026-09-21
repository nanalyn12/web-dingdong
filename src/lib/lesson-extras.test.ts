import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import {
  normalizeStorybook,
  normalizeVocabComparison,
  STORYBOOK_PAGE_SHAPE,
  VOCAB_COMPARISON_SHAPE,
} from "./lesson-extras";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

/*
 * One real item per key combination found in the production database
 * (2026-09-22: 50 vocab comparisons in 21 shapes, 132 storybook pages in 10).
 * The generation prompt never fixed either structure, so every run invented
 * its own keys. Long explanations are trimmed; the keys are exactly as stored.
 */

const VC: Record<string, Record<string, unknown>> = {
  "word1/word2/comparison": {
    word1: { ko: "타임슬립하다", zh: "穿越", pinyin: "chuānyuè" },
    word2: { ko: "여행하다", zh: "旅行", pinyin: "lǚxíng" },
    comparison: "'穿越'는 시공간을 초월하는 이동, '旅行'은 현실의 여행입니다.",
  },
  "korean_word/chinese_words/explanation": {
    explanation: "'受欢迎'은 동사구, '人气'는 명사입니다.",
    korean_word: "인기",
    chinese_words: [
      { zh: "受欢迎", pinyin: "shòu huānyíng", ko_meaning: "환영받다, 인기가 많다 (동사구)" },
      { zh: "人气", pinyin: "rénqì", ko_meaning: "인기 (명사)" },
    ],
  },
  "zh_word/ko_meaning/notes/examples": {
    notes: "일반적으로 눈으로 보는 행위를 나타냅니다.",
    pinyin: "kàn",
    zh_word: "看",
    ko_example: "저는 책을 봐요.",
    ko_meaning: "보다",
    zh_example: "我看书。(Wǒ kàn shū.)",
  },
  "zh 'A vs B' / ko": {
    ko: "'辨析'는 차이점과 공통점을 분석해 구분하는 것, '区分'은 일반적으로 나누는 것입니다.",
    zh: "辨析 vs 区分",
  },
  "zh_a/zh_b/description_ko": {
    ko_a: "안녕하세요 (일반적)",
    ko_b: "안녕하세요 (존칭)",
    zh_a: "你好",
    zh_b: "您好",
    pinyin_a: "Nǐ hǎo",
    pinyin_b: "Nín hǎo",
    description_ko: "'你好'는 친한 사이, '您好'는 격식 있는 상황에서 씁니다.",
  },
  "zh/note": {
    ko: "부르다, ~라고 하다",
    zh: "叫",
    note: "주로 자신의 이름을 말할 때 '我叫...'처럼 사용합니다.",
    pinyin: "jiào",
  },
  "zh/zh2/explanation": {
    ko: "회사",
    zh: "公司",
    ko2: "기업",
    zh2: "企业",
    pinyin: "gōngsī",
    pinyin2: "qǐyè",
    explanation: "'公司'는 두루 쓰이고, '企业'는 규모가 큰 조직에 씁니다.",
  },
  "zh/compare_zh (pinyin in parens)": {
    ko: "회사나 조직의 특정 사업 활동, 전문적인 업무.",
    zh: "业务 (yèwù)",
    compare_ko: "일반적인 일, 직업, 노동.",
    compare_zh: "工作 (gōngzuò)",
  },
  "zh1/zh2/explanation": {
    ko1: "제품",
    ko2: "서비스",
    zh1: "产品",
    zh2: "服务",
    pinyin1: "chǎnpǐn",
    pinyin2: "fúwù",
    explanation: "'产品'은 물건, '服务'는 용역입니다.",
  },
  "zh/comparison_note_ko": {
    ko: "시간이 있다 (여유 시간)",
    zh: "有空",
    pinyin: "yǒu kòng",
    comparison_note_ko: "주로 여가 시간이나 일정이 비어있는 상태를 나타냅니다.",
  },
  "zh/zh2 (no note)": {
    ko: "미안합니다 (일상생활에서 가볍게 사용)",
    zh: "对不起",
    ko2: "죄송합니다 (격식 있는 상황)",
    zh2: "抱歉",
    pinyin: "duìbuqǐ",
    pinyin2: "bàoqiàn",
  },
  "zh_a/zh_b/explanation_ko": {
    ko_a: "목적, 목표 (단기적, 구체적)",
    ko_b: "목표, 목적 (장기적, 전략적)",
    zh_a: "目的",
    zh_b: "目标",
    pinyin_a: "mùdì",
    pinyin_b: "mùbiāo",
    explanation_ko: "'目的'는 구체적인 목적, '目标'는 장기적인 목표입니다.",
  },
  "zh/zh2/description_ko/description_ko2": {
    ko: "제안, 건의 (동사/명사)",
    zh: "建议",
    ko2: "의견, 견해 (명사)",
    zh2: "意见",
    description_ko: "'建议'는 제안하는 의미가 강합니다.",
    description_ko2: "'意见'은 개인적인 견해를 의미합니다.",
  },
  "zh/compare_zh/compare_pinyin": {
    ko: "저는 ~라고 생각해요 (주관적)",
    zh: "我觉得",
    pinyin: "wǒ juéde",
    compare_ko: "저는 ~라고 생각합니다 (공식적)",
    compare_zh: "我认为",
    compare_pinyin: "wǒ rènwéi",
  },
  "title 'A vs B' / description (markdown)": {
    title: "可以 (kěyǐ) vs 能 (néng)",
    description:
      "두 단어 모두 '할 수 있다'는 의미입니다.\n- **可以 (kěyǐ)**: 허락, 가능성.\n- **能 (néng)**: 능력, 가능성.",
  },
  "zh/comparison_ko/comparison_zh": {
    ko: "다음 단계",
    zh: "下一步",
    pinyin: "xià yībù",
    comparison_ko: "'下一步'는 다음 단계, '下一次'는 다음 기회를 의미합니다.",
    comparison_zh: "与“下一次”相比，“下一步”更侧重于下一个环节。",
  },
  "zh (pinyin in parens, duplicated)/description": {
    ko: "결정하다 (동사) / 결정 (명사)",
    zh: "决定 (juédìng)",
    pinyin: "juédìng",
    description: "최종적인 판단을 내리거나 그 판단 자체를 의미합니다.",
  },
  "zh/description_ko/example (markdown)": {
    ko: "계획 (명사/동사)",
    zh: "计划",
    pinyin: "jìhuà",
    example_ko: "우리는 새로운 시장 계획이 있습니다.",
    example_zh: "我们有一个新的市场**计划**。",
    description_ko: "미래에 무엇을 할지에 대한 구체적인 생각입니다.",
    example_pinyin: "Wǒmen yǒu yīgè xīn de shìchǎng **jìhuà**.",
  },
  "zh/zh_compare": {
    ko: "확인하다 (정보, 사실을 재확인)",
    zh: "确认",
    pinyin: "quèrèn",
    ko_compare: "확정하다, 결정하다",
    zh_compare: "确定",
    pinyin_compare: "quèdìng",
  },
  "word_zh/compare_to_zh/explanation_ko": {
    word_ko: "안녕하세요",
    word_zh: "你好",
    word_pinyin: "nǐ hǎo",
    compare_to_ko: "안녕하세요 (존칭)",
    compare_to_zh: "您好",
    explanation_ko: "'你好'는 일반적인 인사말, '您好'는 존경을 표할 때 씁니다.",
    compare_to_pinyin: "nín hǎo",
  },
  "zh/zh_compare/example": {
    ko: "알다 (사람, 사물, 경험을 통해)",
    zh: "认识",
    pinyin: "rènshi",
    example_ko: "만나서 매우 기쁩니다.",
    example_zh: "很高兴认识您。",
    ko_compare: "알다 (정보, 사실을 통해)",
    zh_compare: "知道",
    pinyin_compare: "zhīdào",
  },
};

const PROMPT = "No text, no characters. Watercolor storybook style.";

const SB: Record<string, Record<string, unknown>> = {
  text: { text: "지수는 중국 웹소설의 세계에 푹 빠졌어요.", page_number: 1, image_prompt: PROMPT },
  "text/zh/pinyin": {
    zh: "지수迷上了中国网络小说。",
    text: "지수는 중국 웹소설에 푹 빠졌어요.",
    pinyin: "Zhīxiù mí shàng le Zhōngguó wǎngluò xiǎoshuō.",
    page_number: 1,
    image_prompt: PROMPT,
  },
  "title/text_ko/text_zh/pinyin": {
    title: "새로운 취미를 찾아서",
    pinyin: "Zhìxiù zhèngzài xúnzhǎo xīn de àihào.",
    text_ko: "지수는 새로운 취미를 찾고 있었어요.",
    text_zh: "智秀正在寻找新的爱好。",
    page_number: 1,
    image_prompt: PROMPT,
  },
  narration: { narration: "지수는 HSK 고급 시험을 준비했어요.", image_prompt: PROMPT },
  "narration/lines (object)": {
    lines: {
      ko: "첫 중국 출장이라니, 너무 긴장돼!",
      zh: "第一次去中国出差，好紧张啊！",
      pinyin: "Dì yī cì qù Zhōngguó chūchāi, hǎo jǐnzhāng a!",
      speaker: "지수",
    },
    narration: "지수는 첫 중국 출장을 앞두고 마음이 두근거렸어요.",
    image_prompt: PROMPT,
  },
  "narration/lines (empty)/page_number": {
    lines: [],
    narration: "지수는 중국 비즈니스 파트너와 첫 만남을 앞두고 있었어요.",
    page_number: 1,
    image_prompt: PROMPT,
  },
  "title/narration/lines (array)": {
    lines: [
      {
        ko: "아차, 회의 시간을 바꿔야겠어!",
        zh: "哎呀，我得改会议时间了！",
        pinyin: "Āiyā, wǒ děi gǎi huìyì shíjiān le!",
        speaker: "지수",
      },
    ],
    title: "지수 씨의 고민",
    narration: "지수 씨는 중요한 미팅을 앞두고 있었어요.",
    image_prompt: PROMPT,
  },
  "title/text": {
    text: "지수는 중요한 회의에 참석했어요.",
    title: "회의실의 고민",
    page_number: 1,
    image_prompt: PROMPT,
  },
  "text_ko/text_zh/pinyin": {
    pinyin: "Jīntiān zhòngyào de shāngwù huìyì chénggōng jiéshù le.",
    text_ko: "오늘 중요한 비즈니스 미팅이 성공적으로 끝났어요.",
    text_zh: "今天重要的商务会议成功结束了。",
    page_number: 1,
    image_prompt: PROMPT,
  },
  "text_ko/text_zh": {
    text_ko: "지수는 중국 뉴미디어 산업 강좌를 듣기 시작했어요.",
    text_zh: "智秀开始上中国新媒体产业的课程。",
    page_number: 1,
    image_prompt: PROMPT,
  },
};

const one = (raw: Record<string, unknown>) => {
  const out = normalizeVocabComparison([raw]);
  expect(out).toHaveLength(1);
  return out[0];
};

describe("vocabulary comparisons, whatever shape they were stored in", () => {
  // C-1
  it.each(Object.entries(VC))("%s → at least one word", (_, raw) => {
    const c = one(raw);
    expect(c.words.length).toBeGreaterThanOrEqual(1);
    for (const w of c.words) expect(w.zh.trim()).not.toBe("");
  });

  it("covers every shape found in production", () => {
    expect(Object.keys(VC)).toHaveLength(21);
  });

  // C-2
  it.each([
    ["word1/word2/comparison", ["穿越", "旅行"]],
    ["korean_word/chinese_words/explanation", ["受欢迎", "人气"]],
    ["zh 'A vs B' / ko", ["辨析", "区分"]],
    ["zh_a/zh_b/description_ko", ["你好", "您好"]],
    ["zh/zh2/explanation", ["公司", "企业"]],
    ["zh/compare_zh (pinyin in parens)", ["业务", "工作"]],
    ["zh1/zh2/explanation", ["产品", "服务"]],
    ["zh/zh2 (no note)", ["对不起", "抱歉"]],
    ["zh_a/zh_b/explanation_ko", ["目的", "目标"]],
    ["zh/zh2/description_ko/description_ko2", ["建议", "意见"]],
    ["zh/compare_zh/compare_pinyin", ["我觉得", "我认为"]],
    ["title 'A vs B' / description (markdown)", ["可以", "能"]],
    ["zh/zh_compare", ["确认", "确定"]],
    ["word_zh/compare_to_zh/explanation_ko", ["你好", "您好"]],
    ["zh/zh_compare/example", ["认识", "知道"]],
  ])("%s → two words in order", (key, zhs) => {
    expect(one(VC[key]).words.map((w) => w.zh)).toEqual(zhs);
  });

  it("carries the Korean meaning and pinyin of each side", () => {
    const c = one(VC["zh_a/zh_b/description_ko"]);
    expect(c.words[1]).toEqual({ zh: "您好", pinyin: "Nín hǎo", ko: "안녕하세요 (존칭)" });
    const k = one(VC["korean_word/chinese_words/explanation"]);
    expect(k.words[0]).toEqual({
      zh: "受欢迎",
      pinyin: "shòu huānyíng",
      ko: "환영받다, 인기가 많다 (동사구)",
    });
  });

  // C-3
  it.each([
    ["word1/word2/comparison", "시공간을 초월하는"],
    ["korean_word/chinese_words/explanation", "동사구"],
    ["zh_word/ko_meaning/notes/examples", "눈으로 보는"],
    ["zh_a/zh_b/description_ko", "격식 있는"],
    ["zh/note", "이름을 말할 때"],
    ["zh_a/zh_b/explanation_ko", "장기적인 목표"],
    ["zh/comparison_note_ko", "여가 시간"],
    ["zh/comparison_ko/comparison_zh", "다음 기회"],
    ["zh (pinyin in parens, duplicated)/description", "최종적인 판단"],
    ["zh/description_ko/example (markdown)", "구체적인 생각"],
    ["word_zh/compare_to_zh/explanation_ko", "존경을 표할 때"],
  ])("%s → its explanation becomes the note", (key, fragment) => {
    expect(one(VC[key]).note).toContain(fragment);
  });

  it("keeps both halves of a two-part description", () => {
    const note = one(VC["zh/zh2/description_ko/description_ko2"]).note ?? "";
    expect(note).toContain("제안하는 의미");
    expect(note).toContain("개인적인 견해");
  });

  it("leaves no markdown bold markers behind", () => {
    for (const raw of Object.values(VC)) {
      const c = one(raw);
      const text = JSON.stringify(c);
      expect(text).not.toContain("**");
    }
  });

  it("keeps an example sentence when one was stored", () => {
    const c = one(VC["zh/description_ko/example (markdown)"]);
    expect(c.example).toEqual({
      zh: "我们有一个新的市场计划。",
      pinyin: "Wǒmen yǒu yīgè xīn de shìchǎng jìhuà.",
      ko: "우리는 새로운 시장 계획이 있습니다.",
    });
    expect(one(VC["zh_word/ko_meaning/notes/examples"]).example?.zh).toBe("我看书。(Wǒ kàn shū.)");
  });

  // C-4
  it("splits an 'A vs B' heading into two words and keeps the explanation", () => {
    const c = one(VC["zh 'A vs B' / ko"]);
    expect(c.words.map((w) => w.zh)).toEqual(["辨析", "区分"]);
    expect(c.note).toContain("차이점과 공통점");
    const t = one(VC["title 'A vs B' / description (markdown)"]);
    expect(t.words).toEqual([
      { zh: "可以", pinyin: "kěyǐ" },
      { zh: "能", pinyin: "néng" },
    ]);
    expect(t.note).toContain("할 수 있다");
  });

  // C-10
  it("moves pinyin written in parentheses out of the Chinese", () => {
    const c = one(VC["zh/compare_zh (pinyin in parens)"]);
    expect(c.words).toEqual([
      { zh: "业务", pinyin: "yèwù", ko: "회사나 조직의 특정 사업 활동, 전문적인 업무." },
      { zh: "工作", pinyin: "gōngzuò", ko: "일반적인 일, 직업, 노동." },
    ]);
    expect(one(VC["zh (pinyin in parens, duplicated)/description"]).words[0]).toMatchObject({
      zh: "决定",
      pinyin: "juédìng",
    });
  });

  it("does not strip a parenthesis that holds Chinese", () => {
    const c = one({ zh: "打算（计划）", ko: "계획하다" });
    expect(c.words[0].zh).toBe("打算（计划）");
  });

  // C-7
  it("drops what it cannot read, without throwing", () => {
    expect(normalizeVocabComparison(null)).toEqual([]);
    expect(normalizeVocabComparison({})).toEqual([]);
    expect(normalizeVocabComparison("穿越 vs 旅行")).toEqual([]);
    expect(normalizeVocabComparison([null, 3, {}, { note: "설명만" }])).toEqual([]);
  });
});

describe("storybook pages, whatever shape they were stored in", () => {
  // C-5
  it.each(Object.entries(SB))("%s → a page with something to read", (_, raw) => {
    const pages = normalizeStorybook([raw]);
    expect(pages).toHaveLength(1);
    const p = pages[0];
    expect(!!p.ko || !!p.zh || p.lines.length > 0).toBe(true);
  });

  it("covers every shape found in production", () => {
    expect(Object.keys(SB)).toHaveLength(10);
  });

  it("reads Korean from text_ko, text or narration, and Chinese from text_zh or zh", () => {
    expect(normalizeStorybook([SB["title/text_ko/text_zh/pinyin"]])[0]).toMatchObject({
      title: "새로운 취미를 찾아서",
      ko: "지수는 새로운 취미를 찾고 있었어요.",
      zh: "智秀正在寻找新的爱好。",
      pinyin: "Zhìxiù zhèngzài xúnzhǎo xīn de àihào.",
    });
    expect(normalizeStorybook([SB["text/zh/pinyin"]])[0]).toMatchObject({
      ko: "지수는 중국 웹소설에 푹 빠졌어요.",
      zh: "지수迷上了中国网络小说。",
    });
    expect(normalizeStorybook([SB["narration"]])[0].ko).toBe("지수는 HSK 고급 시험을 준비했어요.");
  });

  // C-6
  it("wraps a single line into a list and treats a missing one as none", () => {
    const [p] = normalizeStorybook([SB["narration/lines (object)"]]);
    expect(p.lines).toEqual([
      {
        speaker: "지수",
        zh: "第一次去中国出差，好紧张啊！",
        pinyin: "Dì yī cì qù Zhōngguó chūchāi, hǎo jǐnzhāng a!",
        ko: "첫 중국 출장이라니, 너무 긴장돼!",
      },
    ]);
    expect(normalizeStorybook([SB["narration"]])[0].lines).toEqual([]);
    expect(normalizeStorybook([SB["narration/lines (empty)/page_number"]])[0].lines).toEqual([]);
  });

  it("puts pages in page_number order when there is one", () => {
    const pages = normalizeStorybook([
      { page_number: 2, text: "둘째" },
      { page_number: 1, text: "첫째" },
      { page_number: 3, text: "셋째" },
    ]);
    expect(pages.map((p) => p.ko)).toEqual(["첫째", "둘째", "셋째"]);
  });

  it("keeps stored order when pages carry no number", () => {
    const pages = normalizeStorybook([{ narration: "가" }, { narration: "나" }]);
    expect(pages.map((p) => p.ko)).toEqual(["가", "나"]);
  });

  // C-7
  it("drops what it cannot read, without throwing", () => {
    expect(normalizeStorybook(undefined)).toEqual([]);
    expect(normalizeStorybook("page")).toEqual([]);
    expect(normalizeStorybook([null, 1, {}, { image_prompt: PROMPT }])).toEqual([]);
  });
});

describe("the shapes the generation prompt asks for", () => {
  // C-8
  it("the vocabulary comparison example parses and normalizes", () => {
    const parsed = JSON.parse(VOCAB_COMPARISON_SHAPE);
    const [c] = normalizeVocabComparison([parsed]);
    expect(c.words).toHaveLength(2);
    expect(c.note).toBeTruthy();
  });

  it("the storybook page example parses and normalizes", () => {
    const parsed = JSON.parse(STORYBOOK_PAGE_SHAPE);
    const [p] = normalizeStorybook([parsed]);
    expect(p.ko).toBeTruthy();
    expect(p.lines.length).toBeGreaterThanOrEqual(1);
  });

  // C-9
  it("the lesson generator's prompt uses both examples", () => {
    const src = read("lib/generate-lesson.functions.ts");
    expect(src).toMatch(/VOCAB_COMPARISON_SHAPE/);
    expect(src).toMatch(/STORYBOOK_PAGE_SHAPE/);
  });

  it("the lesson reader selects both columns", () => {
    const src = read("lib/courses.functions.ts");
    const start = src.indexOf("export const getLesson");
    expect(start).toBeGreaterThanOrEqual(0);
    const body = src.slice(start, src.indexOf("\nexport ", start + 1));
    expect(body).toMatch(/storybook_pages: tables\.lessons\.storybook_pages/);
    expect(body).toMatch(/vocab_comparison: tables\.lessons\.vocab_comparison/);
  });
});
