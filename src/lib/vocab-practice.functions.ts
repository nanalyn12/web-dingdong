import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { createTextProvider } from "./ai-gateway.server";
import { optionalAuth, requireAuth } from "@/lib/auth-middleware";
import { assertEditor } from "@/lib/courses.functions";
import type { Json } from "@/db/schema";

const Input = z.object({
  zh: z.string().min(1),
  pinyin: z.string().optional().nullable(),
  ko: z.string().optional().nullable(),
});

/** Thrown when a guest asks for a word that is not in the shared cache yet.
 * The client matches on this to show a sign-in prompt rather than an error. */
export const GUEST_GENERATION_BLOCKED = "GUEST_GENERATION_BLOCKED";

export function isGuestGenerationBlocked(err: unknown): boolean {
  return (err instanceof Error ? err.message : String(err)).includes(
    GUEST_GENERATION_BLOCKED,
  );
}

export type VocabExample = { zh: string; pinyin: string; ko: string };
export type VocabQuizMeaning = {
  type: "meaning";
  question_ko: string;
  options: string[];
  correct: number;
};
export type VocabQuizFill = {
  type: "fill";
  sentence_zh: string;
  blanked_zh: string;
  pinyin: string;
  ko: string;
  answer: string;
};
export type VocabPractice = {
  meaning_ko: string;
  tip: string;
  collocations: string[];
  examples: {
    beginner: VocabExample[];
    intermediate: VocabExample[];
    advanced: VocabExample[];
  };
  quiz: Array<VocabQuizMeaning | VocabQuizFill>;
};

function extractJson(text: string) {
  const t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error("JSON not found");
  return JSON.parse(t.slice(s, e + 1));
}

async function buildVocabPractice(data: z.infer<typeof Input>): Promise<VocabPractice> {
    const gateway = createTextProvider();

    const system = [
      "당신은 친절한 중국어 선생님 '叮叮'입니다.",
      "한국인 성인 학습자를 위해 단어 학습 자료를 JSON으로 생성하세요.",
      "오직 유효한 JSON 객체만 반환하세요. 마크다운/설명 금지.",
      "모든 중국어 문장에는 정확한 핀인(병음, 성조 포함)과 자연스러운 한국어 번역을 함께 제공하세요.",
    ].join("\n");

    const prompt = [
      `단어: ${data.zh}${data.pinyin ? ` (${data.pinyin})` : ""}${data.ko ? ` — ${data.ko}` : ""}`,
      "",
      "다음 스키마에 정확히 맞춘 JSON 객체를 출력하세요:",
      `{
  "meaning_ko": "단어의 핵심 뜻 한 줄 설명 (한국어)",
  "tip": "학습자에게 도움이 되는 사용 팁 1문장 (한국어)",
  "collocations": ["자주 함께 쓰이는 표현 3-4개 (한자만)"],
  "examples": {
    "beginner": [{"zh":"한자","pinyin":"hàn zì","ko":"한국어 번역"}, ... 3개],
    "intermediate": [... 3개],
    "advanced": [... 3개]
  },
  "quiz": [
    {"type":"meaning","question_ko":"이 단어의 뜻은?","options":["뜻1","뜻2","뜻3","뜻4"],"correct":0},
    {"type":"fill","sentence_zh":"완성된 한자 문장","blanked_zh":"빈칸이 ___ 으로 표시된 한자 문장","pinyin":"전체 핀인","ko":"한국어 번역","answer":"빈칸에 들어갈 한자"}
  ]
}`,
      "",
      "규칙:",
      "- 난이도별 예문 길이: 초급 6-10자, 중급 10-16자, 고급 16자 이상.",
      "- 예문은 일상에서 정말 자주 쓰이는 자연스러운 문장으로.",
      "- quiz는 정확히 2개 (meaning 1 + fill 1).",
      "- meaning 보기 4개 중 1개만 정답, 나머지는 그럴듯한 오답.",
      "- fill의 answer는 반드시 위 단어(또는 그 핵심 한자)와 일치.",
    ].join("\n");

    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system,
      prompt,
    });

    const parsed = extractJson(text);

    // Light normalization with safe fallbacks.
    const safeExamples = (arr: any): VocabExample[] =>
      Array.isArray(arr)
        ? arr
            .filter((x) => x && typeof x.zh === "string")
            .map((x) => ({ zh: String(x.zh), pinyin: String(x.pinyin ?? ""), ko: String(x.ko ?? "") }))
        : [];

    return {
      meaning_ko: String(parsed.meaning_ko ?? data.ko ?? ""),
      tip: String(parsed.tip ?? ""),
      collocations: Array.isArray(parsed.collocations)
        ? parsed.collocations.map((c: unknown) => String(c)).slice(0, 6)
        : [],
      examples: {
        beginner: safeExamples(parsed?.examples?.beginner),
        intermediate: safeExamples(parsed?.examples?.intermediate),
        advanced: safeExamples(parsed?.examples?.advanced),
      },
      quiz: Array.isArray(parsed.quiz) ? parsed.quiz.slice(0, 4) : [],
    };
}

// ─── Cache ──────────────────────────────────────────────────────────────────
// The prompt above uses nothing user-specific, so a word's material is the
// same for everybody. Generating it once and sharing it turns "one Gemini call
// per dialog open" into "one per word, ever" — which is the whole point, since
// every open otherwise cost a call and a multi-second wait.

async function readCache(zh: string): Promise<VocabPractice | null> {
  const { db, tables } = await import("@/db");
  const rows = await db
    .select()
    .from(tables.vocab_practice_cache)
    .where(eq(tables.vocab_practice_cache.zh, zh))
    .limit(1);
  return (rows[0]?.practice as VocabPractice | undefined) ?? null;
}

async function writeCache(
  zh: string,
  practice: VocabPractice,
  userId: string | null,
): Promise<void> {
  const { db, tables } = await import("@/db");
  await db
    .insert(tables.vocab_practice_cache)
    .values({
      zh,
      practice: practice as unknown as Json,
      generated_by: userId,
    })
    .onConflictDoUpdate({
      target: tables.vocab_practice_cache.zh,
      set: {
        practice: practice as unknown as Json,
        generated_by: userId,
        updated_at: new Date().toISOString(),
      },
    });
}

/** Serve a word's study material, generating it only on a cache miss.
 *
 * Reading the shared cache stays open to everyone — it costs nothing and a
 * guest browsing a lesson should still see the words. Populating it is a model
 * call, so that part needs a session: otherwise any visitor could spend our
 * quota just by opening words nobody had looked at yet. */
export const generateVocabPractice = createServerFn({ method: "POST" })
  .middleware([optionalAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<VocabPractice> => {
    const cached = await readCache(data.zh).catch((e) => {
      console.warn("[vocab-practice] cache read failed:", e);
      return null;
    });
    if (cached) return cached;

    if (!context.userId) throw new Error(GUEST_GENERATION_BLOCKED);

    const practice = await buildVocabPractice(data);
    // A failed write only costs a regeneration next time, so never fail the
    // request over it.
    await writeCache(data.zh, practice, null).catch((e) =>
      console.warn("[vocab-practice] cache write failed:", e),
    );
    return practice;
  });

/** Force a fresh generation, replacing the shared entry. Editors only — the
 * cache is shared, so a student regenerating would change what everyone sees. */
export const regenerateVocabPractice = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<VocabPractice> => {
    await assertEditor(context.userId);
    const practice = await buildVocabPractice(data);
    await writeCache(data.zh, practice, context.userId);
    return practice;
  });
