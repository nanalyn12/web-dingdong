import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAuth } from "@/lib/auth-middleware";
import { assertEditor } from "./courses.functions";

const InputSchema = z.object({
  lessonId: z.string().uuid(),
});

const STYLE_SUFFIX =
  ", warm pastel watercolor illustration, cute friendly chibi style, soft lighting, no text, no characters, no captions, no letters, no words, no logos, no signs";

// Image generation via the Gemini native API. Returns base64 PNG.
//
// 이 엔드포인트는 OpenAI 호환이 아니라 ai-gateway의 provider를 쓸 수 없다.
// 그래도 키를 고르는 규칙은 같아야 하므로 resolveAiKey로 키만 받아 온다 —
// 여기서 process.env를 직접 읽으면 이 경로만 개인 키를 영원히 무시하게 된다.
async function generateImageBase64(prompt: string, userId: string | null): Promise<string> {
  const { resolveAiKey } = await import("@/lib/ai-gateway.server");
  const { key } = await resolveAiKey(userId);
  return generateImageGemini(prompt, key);
}

async function generateImageGemini(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt + STYLE_SUFFIX }] }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`이미지 생성 실패 (${res.status}): ${text.slice(0, 300)}`);
  }
  const payload = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { data?: string } }> };
    }>;
  };
  const b64 = payload.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData
    ?.data;
  if (!b64) {
    throw new Error(
      `이미지 응답 형식을 인식할 수 없습니다: ${JSON.stringify(payload).slice(0, 300)}`,
    );
  }
  return b64;
}

export const generateLessonComicImages = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { dirname, join } = await import("node:path");
    const { getMediaDir } = await import("@/lib/suno.server");

    const rows = await db
      .select({ id: tables.lessons.id, comic_panels: tables.lessons.comic_panels })
      .from(tables.lessons)
      .where(eq(tables.lessons.id, data.lessonId))
      .limit(1);
    if (!rows[0]) throw new Error("세부 강의를 찾을 수 없습니다.");

    const panels = Array.isArray(rows[0].comic_panels)
      ? (rows[0].comic_panels as Array<Record<string, unknown>>)
      : [];
    if (!panels.length) throw new Error("comic_panels가 비어 있습니다.");

    const updated: Array<Record<string, unknown>> = [];
    for (let i = 0; i < panels.length; i++) {
      const p = panels[i] ?? {};
      if (p.image_url) {
        updated.push(p);
        continue;
      }
      const prompt =
        (typeof p.image_prompt === "string" && p.image_prompt) ||
        (typeof p.narration === "string" && p.narration) ||
        "cute friendly scene of two characters chatting";
      const b64 = await generateImageBase64(prompt, context.userId);
      const bytes = Buffer.from(b64, "base64");

      const relPath = `lesson-images/${data.lessonId}/panel-${i}-${Date.now()}.png`;
      const fullPath = join(getMediaDir(), relPath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, bytes);

      updated.push({ ...p, image_url: `/media/${relPath}` });
    }

    await db
      .update(tables.lessons)
      .set({ comic_panels: updated as unknown as import("@/db/schema").Json })
      .where(eq(tables.lessons.id, data.lessonId));

    return { ok: true as const, count: updated.length };
  });
