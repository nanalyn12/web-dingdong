import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertEditor } from "./courses.functions";

const InputSchema = z.object({
  lessonId: z.string().uuid(),
});

const STYLE_SUFFIX =
  ", warm pastel watercolor illustration, cute friendly chibi style, soft lighting, no text, no characters, no captions, no letters, no words, no logos, no signs";

// Lovable AI Gateway image endpoint. Returns base64 in JSON response.
async function generateImageBase64(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image-preview",
      messages: [{ role: "user", content: prompt + STYLE_SUFFIX }],
      modalities: ["image", "text"],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`이미지 생성 실패 (${res.status}): ${text.slice(0, 300)}`);
  }
  const payload = (await res.json()) as {
    choices?: Array<{
      message?: {
        images?: Array<{ image_url?: { url?: string } }>;
      };
    }>;
  };
  const imgUrl = payload.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (imgUrl) {
    if (imgUrl.startsWith("data:")) {
      const comma = imgUrl.indexOf(",");
      if (comma > 0) return imgUrl.slice(comma + 1);
    }
    const r = await fetch(imgUrl);
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return btoa(bin);
  }
  throw new Error(`이미지 응답 형식을 인식할 수 없습니다: ${JSON.stringify(payload).slice(0, 300)}`);
}


export const generateLessonComicImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY 미설정");

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { data: row, error } = await supabaseAdmin
      .from("lessons")
      .select("id, comic_panels")
      .eq("id", data.lessonId)
      .single();
    if (error) throw new Error(error.message);

    const panels = Array.isArray(row.comic_panels)
      ? (row.comic_panels as Array<Record<string, unknown>>)
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
      const b64 = await generateImageBase64(prompt, apiKey);
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);

      const path = `${data.lessonId}/panel-${i}-${Date.now()}.png`;
      const { error: upErr } = await supabaseAdmin.storage
        .from("lesson-images")
        .upload(path, bytes, { contentType: "image/png", upsert: true });
      if (upErr) throw new Error(`업로드 실패: ${upErr.message}`);

      const { data: signed, error: signErr } = await supabaseAdmin.storage
        .from("lesson-images")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (signErr || !signed?.signedUrl) {
        throw new Error(`Signed URL 실패: ${signErr?.message ?? "unknown"}`);
      }
      updated.push({ ...p, image_url: signed.signedUrl });
    }

    const { error: updErr } = await supabaseAdmin
      .from("lessons")
      .update({ comic_panels: updated as unknown as never })
      .eq("id", data.lessonId);
    if (updErr) throw new Error(updErr.message);

    return { ok: true as const, count: updated.length };
  });
