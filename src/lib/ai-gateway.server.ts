import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Text-model provider backed by the Google Generative Language API
 * (OpenAI-compatible endpoint, GEMINI_API_KEY). Model ids are passed in the
 * legacy "google/gemini-..." form everywhere; the google/ prefix is stripped.
 */
export function createTextProvider() {
  const gemini = process.env.GEMINI_API_KEY;
  if (!gemini) {
    throw new Error("AI 키가 없습니다 — GEMINI_API_KEY 환경변수를 설정해주세요.");
  }
  const provider = createOpenAICompatible({
    name: "gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    headers: { Authorization: `Bearer ${gemini}` },
    // Without this the JSON schema of Output.object() is silently dropped
    // and the model free-forms its JSON shape.
    supportsStructuredOutputs: true,
  });
  return (modelId: string) => provider(modelId.replace(/^google\//, ""));
}
