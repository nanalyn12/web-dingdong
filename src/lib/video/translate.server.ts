// Korean rendering of video narration. SERVER-ONLY.
//
// Two callers:
//   - the pipeline, via ensureSceneKorean(), which guarantees every scene has a
//     Korean narration aligned sentence-for-sentence with the TTS segments
//   - backfill-video-ko.ts, via translateNarrations(), for scripts written
//     before `narration_ko` existed
//
// Why the alignment matters: the drama player pairs key line #n of a scene with
// Korean sentence #n. Splitting a whole-paragraph translation and indexing into
// it only works when the model happened to produce the same number of sentences
// as the source — when it merged two, every later line showed the wrong
// translation. Translating one sentence per array element makes 1:1 structural,
// not a hope.

import { splitSentences } from "./subtitles";
import type { ScriptScene, VideoJobConfig } from "./config";

// The model the rest of the pipeline (script generation, lesson enrichment)
// runs on. Kept in one place so translation quality tracks the rest.
const TRANSLATE_MODEL = "google/gemini-2.5-flash";

// One request per this many strings. A 20-scene script is ~60 sentences, which
// fits in one call, but a long script split across calls degrades gracefully
// instead of failing whole.
const BATCH = 40;

function extractJson(text: string): unknown {
  const t = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const s = t.indexOf("[");
  const e = t.lastIndexOf("]");
  if (s < 0 || e <= s) throw new Error("JSON 배열을 찾지 못했습니다.");
  return JSON.parse(t.slice(s, e + 1));
}

type Usage = { inputTokens: number; outputTokens: number };

/** One translation request. `unit` describes what each array element is, so the
 * prompt can demand the right shape back. */
async function translateBatch(
  items: string[],
  unit: "sentence" | "passage",
  userId: string | null,
): Promise<{ translations: string[] } & Usage> {
  const { createTextProviderFor } = await import("@/lib/ai-gateway.server");
  const { generateText } = await import("ai");
  const gateway = await createTextProviderFor(userId);

  const system = [
    "당신은 중국어–한국어 번역가입니다.",
    "오직 유효한 JSON 배열만 반환하세요. 마크다운/설명 금지.",
  ].join("\n");

  const shapeRules =
    unit === "sentence"
      ? [
          "- 각 항목은 문장 1개입니다. 번역도 반드시 문장 1개로 만들 것.",
          "- 두 항목을 합치거나 한 항목을 두 문장으로 쪼개지 말 것.",
        ]
      : ["- 원문의 문장 수를 그대로 유지할 것 (원문이 3문장이면 번역도 3문장)."];

  const prompt = [
    "아래 각 항목을 한국어로 번역하세요.",
    "",
    "규칙:",
    "- 요약하거나 생략하지 말 것. 모든 문장을 빠짐없이 옮길 것.",
    ...shapeRules,
    "- 각 문장은 마침표/물음표/느낌표로 끝낼 것.",
    '- 한자를 한글 독음으로 옮기지 말고 뜻으로 번역할 것 (你好 → "안녕하세요", "니하오" 아님).',
    "- 고유명사는 한국에서 통용되는 표기를 쓸 것.",
    "- 학습자가 읽기 쉬운 자연스러운 한국어로.",
    "",
    "입력 (JSON 배열):",
    JSON.stringify(items),
    "",
    `출력: 같은 길이(${items.length}개)의 한국어 문자열 JSON 배열만.`,
  ].join("\n");

  const res = await generateText({
    model: gateway(TRANSLATE_MODEL),
    system,
    prompt,
    temperature: 0.2,
    maxOutputTokens: 8000,
  });

  const parsed = extractJson(res.text);
  if (!Array.isArray(parsed)) throw new Error("번역 결과가 배열이 아닙니다.");
  if (parsed.length !== items.length) {
    throw new Error(`번역 개수 불일치 (요청 ${items.length} / 응답 ${parsed.length})`);
  }

  return {
    translations: parsed.map((v) => String(v ?? "").trim()),
    inputTokens: res.usage?.inputTokens ?? 0,
    outputTokens: res.usage?.outputTokens ?? 0,
  };
}

/** Translate a list in batches, retrying a failed batch once. Returns "" for
 * any element whose batch could not be translated, so one bad batch never
 * discards the rest. */
async function translateList(
  items: string[],
  unit: "sentence" | "passage",
  userId: string | null,
): Promise<{ translations: string[] } & Usage> {
  const out = new Array<string>(items.length).fill("");
  let inputTokens = 0;
  let outputTokens = 0;

  for (let off = 0; off < items.length; off += BATCH) {
    const slice = items.slice(off, off + BATCH);
    if (slice.every((s) => !s.trim())) continue;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await translateBatch(slice, unit, userId);
        r.translations.forEach((t, i) => (out[off + i] = t));
        inputTokens += r.inputTokens;
        outputTokens += r.outputTokens;
        break;
      } catch (e) {
        if (attempt === 1) {
          console.warn(
            `[video] 번역 실패 (${off}~${off + slice.length}):`,
            e instanceof Error ? e.message : e,
          );
        }
      }
    }
  }

  return { translations: out, inputTokens, outputTokens };
}

/** Translate every narration in one pass, one Korean string per input, in
 * order. Used by the backfill, which has no TTS segments to align to. */
export async function translateNarrations(
  narrations: string[],
  /** 이 작업의 소유자. 개인 Gemini 키가 있으면 그 키로 돈다. 백필 스크립트처럼
   *  소유자를 특정할 수 없는 호출은 생략하고 공용 키를 쓴다. */
  userId: string | null = null,
): Promise<{ translations: string[]; inputTokens: number; outputTokens: number }> {
  const usable = narrations.map((n) => (n ?? "").trim());
  if (usable.every((n) => !n)) {
    return { translations: narrations.map(() => ""), inputTokens: 0, outputTokens: 0 };
  }
  return translateList(usable, "passage", userId);
}

/** The sentences the TTS step will synthesise for a scene. Must stay identical
 * to the pipeline's own split, or the Korean lines shift against the audio. */
export function narrationSentences(scene: ScriptScene): string[] {
  return splitSentences(scene.narration || scene.zh || "…");
}

/** Guarantee `narration_ko` and `ko_sentences` on every scene.
 *
 * The script generator is asked for narration_ko, but on a long script it
 * routinely drops the field, truncates it, or returns a one-clause gloss — and
 * nothing downstream checked, so the lesson body lost its translation block and
 * the drama showed Chinese where Korean belonged. This repairs the script
 * before any of that is derived from it.
 *
 * Korean-narration jobs cost nothing: the narration is already Korean. */
export async function ensureSceneKorean(
  cfg: VideoJobConfig,
  scenes: ScriptScene[],
  /** 영상 작업의 소유자(video_jobs.created_by). */
  userId: string | null = null,
): Promise<{ scenes: ScriptScene[]; repaired: number; inputTokens: number; outputTokens: number }> {
  if (cfg.language === "ko") {
    return {
      scenes: scenes.map((sc) => ({
        ...sc,
        narration_ko: sc.narration,
        ko_sentences: narrationSentences(sc),
      })),
      repaired: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  // Flatten to sentences so the translator returns exactly one Korean sentence
  // per TTS segment. Scenes whose model-written narration_ko already splits
  // into the right number of sentences are kept as-is and cost nothing.
  const perScene = scenes.map(narrationSentences);
  const needsWork = scenes.map((sc, i) => {
    const ko = (sc.narration_ko ?? "").trim();
    if (!ko) return true;
    // A "translation" that is still Chinese, or far too short to cover the
    // narration, is worse than no translation — it silently ships.
    if (!/[가-힣]/.test(ko)) return true;
    if (ko.length < Math.max(6, (sc.narration ?? "").length * 0.4)) return true;
    // ko_sentences is the authoritative alignment when present. Re-splitting the
    // joined paragraph is only a fallback, and it under-counts whenever a
    // sentence ends inside quotes — 예를 들어, "저는 중국어를 말할 수 있습니다."
    // swallows its own full stop — which would re-translate a correct scene.
    if (sc.ko_sentences?.length === perScene[i].length) return false;
    return splitSentences(ko).length !== perScene[i].length;
  });

  const flat: string[] = [];
  const owner: number[] = []; // flat index → scene index
  scenes.forEach((_, i) => {
    if (!needsWork[i]) return;
    perScene[i].forEach((s) => {
      flat.push(s);
      owner.push(i);
    });
  });

  let translations: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  if (flat.length) {
    const r = await translateList(flat, "sentence", userId);
    translations = r.translations;
    inputTokens = r.inputTokens;
    outputTokens = r.outputTokens;
  }

  const bySceneKo = new Map<number, string[]>();
  translations.forEach((t, i) => {
    const s = owner[i];
    const list = bySceneKo.get(s) ?? [];
    list.push(t);
    bySceneKo.set(s, list);
  });

  let repaired = 0;
  const next = scenes.map((sc, i) => {
    if (!needsWork[i]) {
      return { ...sc, ko_sentences: splitSentences(sc.narration_ko ?? "") };
    }
    const fresh = bySceneKo.get(i) ?? [];
    // A batch that failed outright leaves empty strings; keep whatever the
    // script already had rather than blanking the scene.
    if (!fresh.length || fresh.every((t) => !t)) {
      return { ...sc, ko_sentences: splitSentences(sc.narration_ko ?? "") };
    }
    repaired++;
    const filled = fresh.map((t, si) => t || perScene[i][si] || "");
    return { ...sc, narration_ko: filled.join(" ").trim(), ko_sentences: filled };
  });

  return { scenes: next, repaired, inputTokens, outputTokens };
}
