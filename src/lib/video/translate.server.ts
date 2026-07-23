// Fill in `narration_ko` for scripts generated before that field existed.
// SERVER-ONLY.
//
// Videos published earlier captioned each narration sentence with `ko`, which
// translates only the short `zh` teaching line — so a 60-character Chinese
// scene showed a one-clause Korean gloss. Re-deriving the learning content
// needs a real translation of the narration itself, and translating is far
// cheaper than regenerating the whole script.

import { splitSentences } from "./subtitles";

function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const s = t.indexOf("[");
  const e = t.lastIndexOf("]");
  if (s < 0 || e <= s) throw new Error("JSON 배열을 찾지 못했습니다.");
  return JSON.parse(t.slice(s, e + 1));
}

/** Translate every narration in one call. Returns one Korean string per input,
 * in order, with sentence counts preserved so the caller can align them to TTS
 * segments. */
export async function translateNarrations(
  narrations: string[],
): Promise<{ translations: string[]; inputTokens: number; outputTokens: number }> {
  const usable = narrations.map((n) => (n ?? "").trim());
  if (usable.every((n) => !n)) {
    return { translations: narrations.map(() => ""), inputTokens: 0, outputTokens: 0 };
  }

  const { createTextProvider } = await import("@/lib/ai-gateway.server");
  const { generateText } = await import("ai");
  const gateway = createTextProvider();

  const system = [
    "당신은 중국어–한국어 번역가입니다.",
    "오직 유효한 JSON 배열만 반환하세요. 마크다운/설명 금지.",
  ].join("\n");

  const prompt = [
    "아래 각 항목을 한국어로 번역하세요.",
    "",
    "규칙:",
    "- 요약하거나 생략하지 말 것. 모든 문장을 빠짐없이 옮길 것.",
    "- 원문의 문장 수를 그대로 유지할 것 (원문이 3문장이면 번역도 3문장).",
    "- 각 문장은 마침표/물음표/느낌표로 끝낼 것.",
    "- 학습자가 읽기 쉬운 자연스러운 한국어로.",
    "",
    "입력 (JSON 배열):",
    JSON.stringify(usable),
    "",
    `출력: 같은 길이(${usable.length}개)의 한국어 문자열 JSON 배열만.`,
  ].join("\n");

  const res = await generateText({
    model: gateway("google/gemini-3-flash-preview"),
    system,
    prompt,
  });

  const parsed = extractJson(res.text);
  if (!Array.isArray(parsed)) throw new Error("번역 결과가 배열이 아닙니다.");
  if (parsed.length !== usable.length) {
    throw new Error(`번역 개수 불일치 (요청 ${usable.length} / 응답 ${parsed.length})`);
  }

  return {
    translations: parsed.map((v) => String(v ?? "")),
    inputTokens: res.usage?.inputTokens ?? 0,
    outputTokens: res.usage?.outputTokens ?? 0,
  };
}

/** True when the translation looks aligned enough to caption sentence by
 * sentence. A mismatch is not fatal — the caller falls back to the whole
 * string — but it is worth reporting. */
export function sentenceCountsMatch(source: string, translated: string): boolean {
  return splitSentences(source).length === splitSentences(translated).length;
}
