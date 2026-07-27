// Enrich a video-generated lesson with 실전대화 / 슬라이드 / 퀴즈. SERVER-ONLY.
//
// createLessonFromScript fills content_md, key_expressions and video — the rest
// of the lesson tabs stay empty, so a video lesson has none of the practice
// material a manually generated one gets.
//
// generateLesson() already produces those fields, but its only inputs are the
// course name and lesson title: reusing it here would write dialogues and
// slides about the *topic in general*, unrelated to what the learner just
// watched. So this asks for the same field shapes, grounded in the actual
// script — the narration, the teaching lines and the per-scene vocab.
//
// Field rules are kept verbatim from generate-lesson.functions.ts so both paths
// render identically in the lesson UI.
import { generateText } from "ai";
import { z } from "zod";

import { createTextProvider } from "@/lib/ai-gateway.server";
import { extractJsonObject } from "@/lib/generate-lesson.functions";
import { normalizeQuiz, normalizeQuizForStorage, QUIZ_PROMPT_SPEC } from "@/lib/quiz-normalize";
import { pinyinFor } from "./pinyin";
import { levelFromAudience } from "./config";
import type { VideoJobConfig, VideoScript } from "./config";

// Shallow on purpose, like the lesson generator: Gemini satisfies this
// reliably and JSONB stores the richer nesting without local validation
// failures. The detailed rules live in the prompt.
const JsonObject = z.looseObject({});

const EnrichSchema = z.object({
  dialogues: z.array(JsonObject).default([]),
  slides: z.array(JsonObject).default([]),
  quiz: z.array(JsonObject).default([]),
});

export type LessonEnrichment = {
  dialogues: unknown[];
  slides: unknown[];
  quiz: unknown[];
};

/** Compact rendering of the script — what was said, what was taught, in order.
 * Trimmed because a 20-scene script would otherwise dominate the context. */
function scriptDigest(script: VideoScript): string {
  return script.scenes
    .map((sc, i) => {
      const line = sc.zh
        ? `\n   핵심문장: ${sc.zh} (${pinyinFor(sc.zh, sc.pinyin)}) — ${sc.ko}`
        : "";
      const vocab = (sc.vocab ?? [])
        .filter((v) => v?.zh)
        .map((v) => `${v.zh}(${pinyinFor(v.zh, v.pinyin)}) ${v.ko}`)
        .join(", ");
      const vocabLine = vocab ? `\n   단어: ${vocab}` : "";
      const narration = (sc.narration_ko || sc.narration || "").slice(0, 200);
      return `${i + 1}. ${narration}${line}${vocabLine}`;
    })
    .join("\n");
}

function buildPrompt(cfg: VideoJobConfig, script: VideoScript): string {
  const level = levelFromAudience(cfg.audience);
  const levelKo =
    level === "beginner"
      ? "입문 (HSK 1~3급)"
      : level === "intermediate"
        ? "중급 (HSK 4~6급)"
        : "고급 (HSK 7~9급)";

  // Same rule as the lesson generator: beginners see pinyin everywhere,
  // higher levels only in structured vocab/example fields.
  const pinyinRule =
    level === "beginner"
      ? "실전대화(dialogues)의 모든 중국어 문장에 pinyin 표기를 포함하세요."
      : "실전대화(dialogues)의 중국어 문장에는 pinyin을 절대 포함하지 마세요 (한자와 한국어 번역만). 단 slides.vocab/examples 등 구조화된 어휘·예문 필드의 pinyin 필드는 채워주세요.";

  return `아래는 학습자가 방금 시청한 중국어 학습 영상의 대본입니다.
이 영상 내용을 복습·확장하는 학습 자료를 JSON으로 생성하세요. JSON 외의 텍스트는 출력 금지.

영상 제목: ${script.title}
난이도: ${levelKo}
주제: ${cfg.topic || cfg.keyword}

[영상 대본 — 장면 순서대로]
${scriptDigest(script)}

최상위 JSON 키는 반드시 dialogues, slides, quiz 만 사용하세요.

[전역 필수 규칙]
- 모든 중국어는 반드시 简体中文(간체) 한자로만 작성. 번체/병음으로 zh 필드를 채우지 말 것.
- zh 필드에는 한자만, 한국어는 ko 필드에만. zh 필드에 한글이 들어가면 오류.
- image_prompt 는 영어로 작성하고 반드시 "No text, no characters" 문구 포함.
- AI 친구 캐릭터 이름은 반드시 "叮叮" (다른 이름 금지).
- 어휘/문법 난이도는 ${levelKo} 수준에 맞출 것.
- ${pinyinRule}
- **가장 중요**: 위 대본에 나온 표현·단어·상황을 반드시 활용하세요. 영상과 무관한 일반적인 내용을 지어내지 마세요.

[dialogues] 8-10개. 영상에서 배운 표현을 실제로 써먹는 하나의 이어지는 대화. 등장인물은 지수(한국인 학습자)와 叮叮(중국인 친구). 각 항목 speaker/zh(한자)/pinyin/ko 필수.
[slides] 정확히 5장. 각 슬라이드는 반드시 다음 필드를 모두 포함하세요: title(한국어 제목, 12자 이내), subtitle(한 줄 한국어 부제), key_point(핵심 한 문장), content(마크다운 본문 — ###, **, - 사용, 중국어는 반드시 한자로, 예문엔 한국어 번역 병기, 최소 120자), tip(학습 팁 한 문장), image_prompt(영어 + "No text, no characters"). 가능하면 vocab(zh/pinyin/ko 3~5개) 또는 examples(zh/pinyin/ko 2~3개) 중 주제에 맞는 쪽을 추가하세요. 주제 순서: ① 영상 내용 요약 ② 핵심 표현 ③ 문법 포인트 ④ 실전 활용 ⑤ 정리/복습.
${QUIZ_PROMPT_SPEC}
  · 6문항 모두 위 영상에 나온 표현을 묻도록 출제하세요.`;
}

/** Generate the practice material for one video lesson.
 * Throws on failure — callers decide whether that is fatal. */
export async function buildLessonEnrichment(
  cfg: VideoJobConfig,
  script: VideoScript,
): Promise<LessonEnrichment> {
  const gateway = createTextProvider();
  const model = gateway("google/gemini-2.5-flash");

  const result = await generateText({
    model,
    system:
      "You are an expert Chinese-language curriculum designer creating lessons for Korean adult learners. Always respect the user's formatting and language rules. Output simplified Chinese (简体) only.",
    prompt: buildPrompt(cfg, script),
    maxOutputTokens: 32000,
    temperature: 0.4,
  });

  const parsed = EnrichSchema.parse(extractJsonObject(result.text));
  return {
    dialogues: Array.isArray(parsed.dialogues) ? parsed.dialogues : [],
    slides: Array.isArray(parsed.slides) ? parsed.slides : [],
    // Canonical shape on write — the lesson quiz UI only renders one shape.
    quiz: normalizeQuizForStorage(parsed.quiz),
  };
}

/** The script already carries per-scene quiz questions, which until now only
 * reached the drama player. Free fallback when the AI call fails — a lesson
 * with quizzes beats a lesson with nothing.
 *
 * Those are written for the drama player's looser reader ({question, options,
 * answer}), so they go through the same normalizer as everything else. */
export function quizFromScript(script: VideoScript): unknown[] {
  return normalizeQuiz(
    script.scenes.flatMap((sc) => sc.quiz ?? []).filter((q) => q?.question && q?.answer),
  );
}
