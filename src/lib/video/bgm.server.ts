// Background music for rendered videos. SERVER-ONLY.
// Focus-matched royalty-free tracks by Kevin MacLeod (incompetech.com),
// CC BY 4.0 — attribution is appended to the YouTube description.
// Files are downloaded once into MEDIA_DIR/bgm/ (the persistent volume).
import type { VideoFocus, VideoJobConfig } from "./config";

export type BgmTrack = {
  title: string;
  artist: string;
  url: string;
  file: string; // file name under MEDIA_DIR/bgm/
};

const MACLEOD = "Kevin MacLeod (incompetech.com)";
const BASE = "https://incompetech.com/music/royalty-free/mp3-royaltyfree/";

const TRACKS: Record<VideoFocus, BgmTrack> = {
  culture: {
    title: "Ishikari Lore",
    artist: MACLEOD,
    url: `${BASE}Ishikari%20Lore.mp3`,
    file: "ishikari-lore.mp3",
  },
  daily: {
    title: "Carefree",
    artist: MACLEOD,
    url: `${BASE}Carefree.mp3`,
    file: "carefree.mp3",
  },
  entertainment: {
    title: "Monkeys Spinning Monkeys",
    artist: MACLEOD,
    url: `${BASE}Monkeys%20Spinning%20Monkeys.mp3`,
    file: "monkeys-spinning-monkeys.mp3",
  },
  grammar: {
    title: "Airport Lounge",
    artist: MACLEOD,
    url: `${BASE}Airport%20Lounge.mp3`,
    file: "airport-lounge.mp3",
  },
};

export function bgmTrackFor(focus: VideoFocus): BgmTrack {
  return TRACKS[focus] ?? TRACKS.culture;
}

export function bgmEnabled(cfg: VideoJobConfig): boolean {
  return cfg.bgm !== false;
}

/** CC BY 4.0 attribution line for the YouTube description ("" when bgm off). */
export function bgmAttribution(cfg: VideoJobConfig): string {
  if (!bgmEnabled(cfg)) return "";
  const t = bgmTrackFor(cfg.focus);
  return `\n\n🎵 BGM: "${t.title}" by ${t.artist}\nLicensed under Creative Commons: By Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/)`;
}

/** Full path of the focus track, downloading it once if missing.
 * Returns null on any failure — the render then proceeds without BGM. */
export async function ensureBgmFile(focus: VideoFocus): Promise<string | null> {
  const { mkdir, access, writeFile, rename } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { getMediaDir } = await import("@/lib/suno.server");

  const track = bgmTrackFor(focus);
  const dir = join(getMediaDir(), "bgm");
  const full = join(dir, track.file);
  try {
    await access(full);
    return full;
  } catch {
    /* download below */
  }
  try {
    await mkdir(dir, { recursive: true });
    const res = await fetch(track.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 100_000) throw new Error(`too small (${buf.length}B)`);
    const tmp = full + ".tmp";
    await writeFile(tmp, buf);
    await rename(tmp, full);
    console.log(`[bgm] downloaded "${track.title}" (${(buf.length / 1e6).toFixed(1)}MB)`);
    return full;
  } catch (e) {
    console.warn(`[bgm] "${track.title}" 다운로드 실패 (BGM 없이 진행):`, e);
    return null;
  }
}
