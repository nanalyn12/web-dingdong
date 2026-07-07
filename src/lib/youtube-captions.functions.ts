import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAuth } from "@/lib/auth-middleware";

function extractVideoId(url: string): string | null {
  const m =
    url.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
    url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
    url.match(/youtube\.com\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

const LangEnum = z.enum(["auto", "zh-CN", "zh-TW", "en"]);
export type PreferredLang = z.infer<typeof LangEnum>;

export type ProbeResult =
  | {
      ok: true;
      languageCode: string;
      segmentCount: number;
      trackCount: number;
      source: "youtube" | "supadata";
    }
  | {
      ok: false;
      reason: "no-video-id" | "no-tracks" | "empty-response";
      languageCode?: string;
      trackCount?: number;
    };

export const probeCaptions = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        youtubeUrl: z.string().min(1),
        lang: LangEnum.optional().default("auto"),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ProbeResult> => {
    const videoId = extractVideoId(data.youtubeUrl);
    if (!videoId) return { ok: false, reason: "no-video-id" };
    const { probeYouTubeCaptions } = await import("./youtube-captions.server");
    const r = await probeYouTubeCaptions(videoId, data.lang);
    if (r.status === "ok") {
      return {
        ok: true,
        languageCode: r.languageCode,
        segmentCount: r.segmentCount,
        trackCount: r.trackCount,
        source: r.source,
      };
    }
    if (r.status === "no-tracks") {
      return { ok: false, reason: "no-tracks", trackCount: 0 };
    }
    return {
      ok: false,
      reason: "empty-response",
      languageCode: r.languageCode,
      trackCount: r.trackCount,
    };
  });
