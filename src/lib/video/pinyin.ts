// Pinyin for arbitrary Chinese text. Client-safe (pure), no server deps.
//
// The script generator only returns pinyin for the one short teaching line per
// scene (`zh`), so every other Chinese string we surface — the narration
// sentences that become drama key lines, vocab the model left blank — had no
// pinyin to show, and the drama player hides an empty pinyin field entirely.
// That is why pinyin appeared on some lines and not others.
//
// Deriving it locally is deterministic and free, and pinyin-pro resolves 多音字
// from surrounding context, which a per-character table cannot.

import { customPinyin, pinyin } from "pinyin-pro";

// Neutral tone (輕聲). pinyin-pro's dictionary already handles most of these
// (我们 wǒ men, 认识 rèn shi, 喜欢 xǐ huan), but it prints the citation tone for
// the ones below — "xiè xiè" instead of "xiè xie". Beginners meet these words
// constantly, and a wrong tone mark is exactly the kind of thing they memorise,
// so correct them at the dictionary level: the override applies inside longer
// sentences too, not just when the word stands alone.
//
// Deliberately excludes readings that change with meaning — 地方 (dìfang "place"
// vs dìfāng "regional") and 知道 (both readings are taught) stay as the library
// has them rather than being forced one way.
customPinyin({
  谢谢: "xiè xie",
  对不起: "duì bu qǐ",
  没关系: "méi guān xi",
  早上: "zǎo shang",
  麻烦: "má fan",
  时候: "shí hou",
  朋友: "péng you",
  东西: "dōng xi",
  客气: "kè qi",
  明白: "míng bai",
  意思: "yì si",
  舒服: "shū fu",
  先生: "xiān sheng",
  太太: "tài tai",
  名字: "míng zi",
  学生: "xué sheng",
  关系: "guān xi",
  事情: "shì qing",
  干净: "gān jing",
  热闹: "rè nao",
  商量: "shāng liang",
  消息: "xiāo xi",
  告诉: "gào su",
  生意: "shēng yi",
  打扮: "dǎ ban",
});

const HAS_HAN = /[㐀-鿿]/;

// pinyin-pro separates every syllable with a space, including across
// punctuation, so a raw conversion reads "nǐ hǎo ， hěn gāo xìng". Tighten it
// the way a textbook prints it: no space before punctuation, one after.
const PUNCT_BEFORE = /\s+([，。！？；：、,.!?;:）)】」』》])/g;
const PUNCT_AFTER = /([（(【「『《])\s+/g;

function tidy(s: string): string {
  return s
    .replace(PUNCT_BEFORE, "$1")
    .replace(PUNCT_AFTER, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Tone-marked pinyin for `text`, or "" when there is nothing Chinese in it.
 * Non-Han characters (punctuation, digits, Korean) are passed through, so a
 * mixed Korean narration sentence keeps its shape. */
export function toPinyin(text: string | null | undefined): string {
  const t = (text ?? "").trim();
  if (!t || !HAS_HAN.test(t)) return "";
  try {
    return tidy(pinyin(t, { toneType: "symbol", nonZh: "consecutive", type: "string" }));
  } catch {
    return "";
  }
}

/** Prefer the pinyin the script already carries, fall back to deriving it.
 * A model-written reading of the featured line is usually the better one — it
 * saw the sentence in context — but it is routinely missing or blank. */
export function pinyinFor(han: string | null | undefined, provided?: string | null): string {
  const p = (provided ?? "").trim();
  if (p) return p;
  return toPinyin(han);
}
