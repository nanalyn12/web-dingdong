// Pure subtitle helpers — no server dependencies, so they can be unit tested
// directly. Used by the video pipeline for TTS chunking and SRT rendering.

/** Split narration into sentences (ko/zh punctuation).
 *
 * Requiring whitespace after the punctuation silently disabled splitting for
 * Chinese, which does not put spaces after 。！？. A three-sentence Chinese
 * narration stayed one chunk, so TTS synthesised it in a single breath and the
 * subtitle became one 60-character cue running a dozen seconds.
 * Full-width punctuation therefore splits with or without trailing space;
 * ASCII punctuation still needs it, so "3.5초" and "Dr. Wang" stay intact.
 *
 * A closing quote right after the punctuation means the sentence has not ended
 * — it is a quotation inside one. Korean narration quotes Chinese constantly
 * ("你吃饭了吗？"라고 인사해요), and splitting there produced a fragment ending
 * in a bare quote plus an orphan clause, in the subtitles and in the TTS
 * chunking alike. */
const CLOSING_QUOTE = `"'”’」』）)`;

export function splitSentences(text: string): string[] {
  return text
    .split(
      new RegExp(`(?<=[。！？…])(?![${CLOSING_QUOTE}])\\s*|(?<=[.!?])(?![${CLOSING_QUOTE}])\\s+`),
    )
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Re-wrap the cue text of an existing SRT without touching its timings.
 *
 * Lets already-published videos get readable two-line captions without a
 * re-render. Timing granularity is whatever the original run produced — this
 * cannot split a cue that was synthesised as one block. */
export function rewrapSrt(srt: string): string {
  return srt
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const lines = block.split(/\r?\n/).filter((l) => l.length > 0);
      if (lines.length < 3) return block.trim();
      const [index, timing, ...text] = lines;
      if (!/-->/.test(timing)) return block.trim();
      return `${index}\n${timing}\n${wrapSubtitle(text.join(" "))}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

const SUB_MAX_LINES = 2;

function isCjkHeavy(s: string): boolean {
  const cjk = (s.match(/[㐀-鿿]/g) ?? []).length;
  return cjk > s.replace(/\s/g, "").length * 0.3;
}

/** Wrap one cue onto at most two lines, breaking on a space when the text has
 * them (Korean/Latin) and purely by width when it does not (Chinese). CJK
 * glyphs are full-width, so a readable line holds far fewer of them. */
export function wrapSubtitle(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  const perLine = isCjkHeavy(t) ? 18 : 30;
  if (t.length <= perLine) return t;

  if (t.includes(" ")) {
    const words = t.split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      if (cur && (cur + " " + w).length > perLine && lines.length < SUB_MAX_LINES - 1) {
        lines.push(cur);
        cur = w;
      } else {
        cur = cur ? `${cur} ${w}` : w;
      }
    }
    if (cur) lines.push(cur);
    return lines.slice(0, SUB_MAX_LINES).join("\n");
  }

  // No spaces to break on — split by width, preferring a spot just after a
  // comma so the break lands at a natural pause.
  const half = Math.ceil(t.length / 2);
  const commaNear = [...t].reduce((best, ch, i) => {
    if (!"，,、；;".includes(ch)) return best;
    return Math.abs(i + 1 - half) < Math.abs(best - half) ? i + 1 : best;
  }, -1);
  const cut = commaNear > 0 && Math.abs(commaNear - half) <= 6 ? commaNear : half;
  return `${t.slice(0, cut).trim()}\n${t.slice(cut).trim()}`;
}
