import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const LOVABLE_AIG_RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

/**
 * Text-model provider with two backends:
 * - GEMINI_API_KEY  → Google Generative Language API (OpenAI-compatible endpoint)
 * - LOVABLE_API_KEY → Lovable AI Gateway (legacy, also proxies Gemini)
 * GEMINI_API_KEY wins when both are set. Model ids are passed in the
 * "google/gemini-..." form everywhere; the google/ prefix is stripped for
 * the direct Gemini backend.
 */
export function createTextProvider() {
  const gemini = process.env.GEMINI_API_KEY;
  if (gemini) {
    const provider = createOpenAICompatible({
      name: "gemini",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      headers: { Authorization: `Bearer ${gemini}` },
    });
    return (modelId: string) => provider(modelId.replace(/^google\//, ""));
  }
  const lovable = process.env.LOVABLE_API_KEY;
  if (lovable) {
    const provider = createLovableAiGatewayProvider(lovable);
    return (modelId: string) => provider(modelId);
  }
  throw new Error(
    "AI 키가 없습니다 — GEMINI_API_KEY (권장) 또는 LOVABLE_API_KEY 환경변수를 설정해주세요.",
  );
}

export function createLovableAiGatewayProvider(
  lovableApiKey: string,
  initialRunId?: string,
) {
  let runId = initialRunId?.trim() || undefined;

  const provider = createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      if (runId && !headers.has(LOVABLE_AIG_RUN_ID_HEADER)) {
        headers.set(LOVABLE_AIG_RUN_ID_HEADER, runId);
      }
      const response = await fetch(input, { ...init, headers });
      const next = response.headers.get(LOVABLE_AIG_RUN_ID_HEADER)?.trim();
      if (!runId && next) runId = next;
      return response;
    },
  });

  return provider;
}
