import { createFileRoute } from "@tanstack/react-router";

const MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/** Parse a single-range `Range: bytes=…` header against a known file size.
 * Returns null when there is no range to honour (absent, malformed, or a
 * multi-range request — serving the whole file is a valid response to those),
 * or "unsatisfiable" when the range falls outside the file. */
function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null | "unsatisfiable" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null; // multi-range or junk → fall back to the full body
  const [, rawStart, rawEnd] = m;
  if (rawStart === "" && rawEnd === "") return null;

  let start: number;
  let end: number;
  if (rawStart === "") {
    // Suffix form: `bytes=-500` means the final 500 bytes.
    const len = Number(rawEnd);
    if (len <= 0) return "unsatisfiable";
    start = Math.max(0, size - len);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start >= size || start < 0) return "unsatisfiable";
  if (end >= size) end = size - 1; // clamp, per spec
  if (end < start) return "unsatisfiable";
  return { start, end };
}

// Serves files saved by downloadAndStore() from the persistent media
// directory (Railway volume). Files are immutable once written, so cache hard.
//
// Range support is not optional here: without it a browser reports an empty
// `seekable` range and silently refuses to move `currentTime`, which breaks
// every seek in the song player (click-a-lyric, prev/next line, the progress
// bar) by snapping playback back to 0.
export const Route = createFileRoute("/media/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
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

        const contentType = MIME[extname(safe).toLowerCase()] ?? "application/octet-stream";
        const baseHeaders = {
          "content-type": contentType,
          "cache-control": "public, max-age=31536000, immutable",
          "accept-ranges": "bytes",
        };

        const range = parseRange(request.headers.get("range"), info.size);
        if (range === "unsatisfiable") {
          return new Response(null, {
            status: 416,
            headers: { ...baseHeaders, "content-range": `bytes */${info.size}` },
          });
        }

        if (range) {
          const { start, end } = range;
          const partial = Readable.toWeb(
            createReadStream(fullPath, { start, end }), // `end` is inclusive
          ) as ReadableStream;
          return new Response(partial, {
            status: 206,
            headers: {
              ...baseHeaders,
              "content-length": String(end - start + 1),
              "content-range": `bytes ${start}-${end}/${info.size}`,
            },
          });
        }

        const stream = Readable.toWeb(createReadStream(fullPath)) as ReadableStream;
        return new Response(stream, {
          headers: { ...baseHeaders, "content-length": String(info.size) },
        });
      },
    },
  },
});
