// Server-only helper: fetch YouTube caption tracks for a video.
// Returns a normalized list of { start, dur, text } segments or null when
// no captions are available.

export type CaptionSegment = { start: number; dur: number; text: string };

type CaptionTrack = {
  baseUrl: string;
  languageCode: string;
  name?: { simpleText?: string };
  kind?: string; // "asr" for auto-generated
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\n/g, " ")
    .trim();
}

function parseTimedTextXml(xml: string): CaptionSegment[] {
  const out: CaptionSegment[] = [];
  const re = /<text[^>]*start="([\d.]+)"[^>]*(?:dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const start = parseFloat(m[1]);
    const dur = m[2] ? parseFloat(m[2]) : 2;
    const text = decodeEntities(m[3].replace(/<[^>]+>/g, ""));
    if (text) out.push({ start, dur, text });
  }
  return out;
}

async function fetchTracksFromWatchPage(videoId: string): Promise<CaptionTrack[]> {
  const html = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  }).then((r) => (r.ok ? r.text() : ""));
  if (!html) return [];
  const m = html.match(/"captionTracks":(\[[^\]]*\])/);
  if (!m) return [];
  try {
    return JSON.parse(m[1]) as CaptionTrack[];
  } catch {
    return [];
  }
}

export type PreferredLang = "auto" | "zh-CN" | "zh-TW" | "en";

// Expand a UI-level preference to the actual YouTube languageCode aliases.
function langAliases(pref: PreferredLang): string[] {
  switch (pref) {
    case "zh-CN":
      return ["zh-Hans", "zh-CN", "zh"];
    case "zh-TW":
      return ["zh-Hant", "zh-TW"];
    case "en":
      return ["en", "en-US", "en-GB"];
    case "auto":
    default:
      return [];
  }
}

function pickBestTrack(tracks: CaptionTrack[], pref: PreferredLang = "auto"): CaptionTrack | null {
  if (tracks.length === 0) return null;

  // 0) If the user picked a specific language, try that family first.
  const explicit = langAliases(pref);
  for (const lang of explicit) {
    const t =
      tracks.find((x) => x.languageCode === lang && x.kind !== "asr") ||
      tracks.find((x) => x.languageCode === lang);
    if (t) return t;
  }

  // 1) Native Chinese fallback
  const preferred = ["zh-Hans", "zh-CN", "zh", "zh-Hant", "zh-TW"];
  for (const lang of preferred) {
    const t =
      tracks.find((x) => x.languageCode === lang && x.kind !== "asr") ||
      tracks.find((x) => x.languageCode === lang);
    if (t) return t;
  }
  const zhLike = tracks.find((t) => (t.languageCode || "").toLowerCase().startsWith("zh"));
  if (zhLike) return zhLike;
  // 2) Fallback: English (translated tracks share the same timestamps as the
  //    original speech, so we can still anchor Chinese lines to real time codes).
  const en = tracks.find((t) => (t.languageCode || "").toLowerCase().startsWith("en"));
  if (en) return en;
  return tracks[0];
}

export type CaptionSource = "youtube" | "supadata";

// For Supadata, we try aliases in order. `auto` uses the module default.
function supadataLangCandidates(pref: PreferredLang): string[] {
  const explicit = langAliases(pref);
  return explicit.length > 0 ? explicit : [];
}

export async function fetchYouTubeCaptions(
  videoId: string,
  preferredLang: PreferredLang = "auto",
): Promise<{ segments: CaptionSegment[]; languageCode: string; source: CaptionSource } | null> {
  // 1) Direct YouTube scrape (free, fastest when it works).
  const tracks = await fetchTracksFromWatchPage(videoId);
  const track = pickBestTrack(tracks, preferredLang);
  if (track?.baseUrl) {
    const url = track.baseUrl.replace(/\\u0026/g, "&");
    const xml = await fetch(url)
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => "");
    if (xml) {
      const segments = parseTimedTextXml(xml);
      if (segments.length > 0) {
        return { segments, languageCode: track.languageCode, source: "youtube" };
      }
    }
  }

  // 2) Supadata fallback — handles PoToken-protected auto-captions, region
  //    blocks, and videos where YouTube returns empty bodies.
  try {
    const candidates = supadataLangCandidates(preferredLang);
    if (candidates.length > 0) {
      for (const lang of candidates) {
        const sup = await fetchViaSupadata(videoId, lang);
        if (sup && sup.segments.length > 0) {
          return { segments: sup.segments, languageCode: sup.languageCode, source: "supadata" };
        }
      }
    } else {
      const sup = await fetchViaSupadata(videoId);
      if (sup && sup.segments.length > 0) {
        return { segments: sup.segments, languageCode: sup.languageCode, source: "supadata" };
      }
    }
  } catch (err) {
    console.error("[youtube-captions] Supadata fallback failed:", err);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Supadata fallback (https://supadata.ai)
// Used when the direct YouTube scrape returns no tracks or empty bodies
// (PoToken-protected auto-captions, region blocks, etc.).
// ---------------------------------------------------------------------------

type SupadataSegment = {
  text: string;
  offset: number; // ms
  duration: number; // ms
  lang?: string;
};

type SupadataResponse = {
  content?: SupadataSegment[];
  lang?: string;
  availableLangs?: string[];
};

const SUPADATA_PREFERRED_LANGS = ["zh-Hans", "zh-CN", "zh", "zh-Hant", "zh-TW", "en"];

export async function fetchViaSupadata(
  videoId: string,
  lang?: string,
): Promise<{ segments: CaptionSegment[]; languageCode: string; availableLangs: string[] } | null> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    throw new Error("SUPADATA_API_KEY is not configured");
  }

  const langsToTry = lang ? [lang] : SUPADATA_PREFERRED_LANGS;
  let lastAvailable: string[] = [];

  for (const tryLang of langsToTry) {
    const url = new URL("https://api.supadata.ai/v1/youtube/transcript");
    url.searchParams.set("videoId", videoId);
    url.searchParams.set("lang", tryLang);
    url.searchParams.set("text", "false");

    const res = await fetch(url.toString(), {
      headers: { "x-api-key": apiKey },
    });

    if (!res.ok) {
      // 404 = language not available for this video, keep trying others.
      // Other errors propagate so callers can surface the reason.
      if (res.status === 404) continue;
      const body = await res.text().catch(() => "");
      throw new Error(`Supadata ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as SupadataResponse;
    if (Array.isArray(json.availableLangs)) lastAvailable = json.availableLangs;
    const content = json.content ?? [];
    if (content.length === 0) continue;

    const segments: CaptionSegment[] = content
      .map((s) => ({
        start: (s.offset ?? 0) / 1000,
        dur: (s.duration ?? 0) / 1000,
        text: decodeEntities(s.text ?? ""),
      }))
      .filter((s) => s.text);

    if (segments.length === 0) continue;

    return {
      segments,
      languageCode: json.lang || tryLang,
      availableLangs: lastAvailable,
    };
  }

  return lastAvailable.length > 0
    ? { segments: [], languageCode: "", availableLangs: lastAvailable }
    : null;
}

export type CaptionProbe =
  | {
      status: "ok";
      languageCode: string;
      trackCount: number;
      segmentCount: number;
      source: CaptionSource;
    }
  | { status: "no-tracks"; trackCount: 0 }
  | { status: "empty-response"; languageCode: string; trackCount: number };

// Diagnostic probe used by the UI to decide whether a video can be turned
// into a drama. Tries direct YouTube first, then Supadata as a fallback so
// PoToken-protected / auto-caption videos can still be validated.
export async function probeYouTubeCaptions(
  videoId: string,
  preferredLang: PreferredLang = "auto",
): Promise<CaptionProbe> {
  const tracks = await fetchTracksFromWatchPage(videoId);
  const track = tracks.length > 0 ? pickBestTrack(tracks, preferredLang) : null;

  if (track?.baseUrl) {
    const url = track.baseUrl.replace(/\\u0026/g, "&");
    const xml = await fetch(url)
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => "");
    const segments = xml ? parseTimedTextXml(xml) : [];
    if (segments.length > 0) {
      return {
        status: "ok",
        languageCode: track.languageCode,
        trackCount: tracks.length,
        segmentCount: segments.length,
        source: "youtube",
      };
    }
  }

  // Fallback: ask Supadata. Even if the direct scrape found no tracks,
  // Supadata can often surface auto-generated captions.
  try {
    const candidates = supadataLangCandidates(preferredLang);
    if (candidates.length > 0) {
      for (const lang of candidates) {
        const sup = await fetchViaSupadata(videoId, lang);
        if (sup && sup.segments.length > 0) {
          return {
            status: "ok",
            languageCode: sup.languageCode,
            trackCount: Math.max(tracks.length, sup.availableLangs.length),
            segmentCount: sup.segments.length,
            source: "supadata",
          };
        }
      }
    } else {
      const sup = await fetchViaSupadata(videoId);
      if (sup && sup.segments.length > 0) {
        return {
          status: "ok",
          languageCode: sup.languageCode,
          trackCount: Math.max(tracks.length, sup.availableLangs.length),
          segmentCount: sup.segments.length,
          source: "supadata",
        };
      }
    }
  } catch (err) {
    console.error("[youtube-captions] Supadata probe failed:", err);
  }

  if (tracks.length === 0) return { status: "no-tracks", trackCount: 0 };
  return {
    status: "empty-response",
    languageCode: track?.languageCode ?? "",
    trackCount: tracks.length,
  };
}
