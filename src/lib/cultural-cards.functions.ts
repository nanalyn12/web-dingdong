import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { createTextProvider } from "./ai-gateway.server";
import { requireAuth } from "@/lib/auth-middleware";
import { assertEditor } from "@/lib/courses.functions";
import type { Json } from "@/db/schema";
import { LEVEL_LABEL_HSK, levelLabelHsk } from "@/lib/levels";

// Cultural cards only. Regenerating a whole lesson to fill these in would also
// redo slides, comic panels and quizzes — roughly ten times the output tokens
// for material that is already fine. This prompt asks for the two cards and
// nothing else.

export type CulturalCard = { title: string; description: string };
export type CulturalCards = {
  cultural_note: CulturalCard;
  cultural_snippet: CulturalCard;
};

export type CulturalUsage = {
  inputTokens: number;
  outputTokens: number;
};

function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error("JSON을 찾지 못했습니다.");
  return JSON.parse(t.slice(s, e + 1));
}

const CardSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
});
const CardsSchema = z.object({
  cultural_note: CardSchema,
  cultural_snippet: CardSchema,
});

/** Generate both cultural cards for one lesson. Exported (rather than inlined
 * in the server fn) so a cost/quality pilot can measure real token usage
 * against the exact prompt that production will use. */
export async function buildCulturalCards(input: {
  title: string;
  level?: string | null;
  contentExcerpt?: string | null;
}): Promise<{ cards: CulturalCards; usage: CulturalUsage }> {
  const gateway = createTextProvider();
  const levelKo = levelLabelHsk(input.level) || LEVEL_LABEL_HSK.beginner;

  const system = [
    "당신은 한국인 성인 학습자를 가르치는 중국어 선생님 '叮叮'입니다.",
    "오직 유효한 JSON 객체만 반환하세요. 마크다운/설명 금지.",
  ].join("\n");

  // A short excerpt keeps the card on-topic without paying for the whole lesson.
  const excerpt = (input.contentExcerpt ?? "").slice(0, 600);

  const prompt = [
    `강의 제목: ${input.title}`,
    `학습자 수준: ${levelKo}`,
    excerpt ? `강의 본문 발췌:\n${excerpt}` : "",
    "",
    "이 강의 주제와 이어지는 중국 문화 카드 2개를 아래 스키마로 정확히 생성하세요:",
    `{
  "cultural_note": {"title":"한국어 소제목","description":"한국어 본문 300자 이상"},
  "cultural_snippet": {"title":"한국어 소제목","description":"한국어 본문 150자 이상"}
}`,
    "",
    "규칙:",
    "- cultural_note: 주제와 관련된 중국 문화 배경을 깊이 있게 설명.",
    "- cultural_snippet: cultural_note와 겹치지 않는, 실제로 써먹는 실용 팁.",
    "- 중국어 표현을 인용할 때는 간체자 + 병음 + 한국어 뜻을 함께 적을 것.",
    "- 한국 학습자가 오해하기 쉬운 지점을 짚어주면 좋습니다.",
    "- 빈 문자열 금지.",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await generateText({
    model: gateway("google/gemini-3-flash-preview"),
    system,
    prompt,
  });

  const cards = CardsSchema.parse(extractJson(res.text));
  return {
    cards,
    usage: {
      inputTokens: res.usage?.inputTokens ?? 0,
      outputTokens: res.usage?.outputTokens ?? 0,
    },
  };
}

/** Fill in a lesson's cultural cards. Editor-only: it spends a model call and
 * overwrites what learners see. */
export const generateLessonCulturalCards = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ lessonId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CulturalCards> => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    const rows = await db
      .select()
      .from(tables.lessons)
      .where(eq(tables.lessons.id, data.lessonId))
      .limit(1);
    const lesson = rows[0];
    if (!lesson) throw new Error("강의를 찾을 수 없습니다.");

    const { cards } = await buildCulturalCards({
      title: lesson.title,
      level: lesson.level,
      contentExcerpt: lesson.content_md,
    });

    await db
      .update(tables.lessons)
      .set({
        cultural_note: cards.cultural_note as unknown as Json,
        cultural_snippet: cards.cultural_snippet as unknown as Json,
      })
      .where(eq(tables.lessons.id, data.lessonId));

    return cards;
  });
