import { createFileRoute } from "@tanstack/react-router";

const MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// Serves files saved by downloadAndStore() from the persistent media
// directory (Railway volume). Files are immutable once written, so cache hard.
export const Route = createFileRoute("/media/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const rel = (params as { _splat?: string })._splat ?? "";
        const { normalize, join, extname } = await import("node:path");
        const { createReadStream } = await import("node:fs");
        const { stat } = await import("node:fs/promises");
        const { Readable } = await import("node:stream");
        const { getMediaDir } = await import("@/lib/suno.server");

        const safe = normalize(rel).replace(/^([./\\])+/, "");
        if (!safe || safe.includes("..")) {
          return new Response("Bad request", { status: 400 });
        }
        const fullPath = join(getMediaDir(), safe);
        let info;
        try {
          info = await stat(fullPath);
        } catch {
          return new Response("Not found", { status: 404 });
        }
        if (!info.isFile()) return new Response("Not found", { status: 404 });

        const stream = Readable.toWeb(
          createReadStream(fullPath),
        ) as ReadableStream;
        return new Response(stream, {
          headers: {
            "content-type": MIME[extname(safe).toLowerCase()] ?? "application/octet-stream",
            "content-length": String(info.size),
            "cache-control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
