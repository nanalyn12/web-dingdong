// Shared vocab types + guest localStorage helpers + emoji heuristics.
import { applyGrade, initialSrs, type SrsGrade, type SrsState } from "@/lib/vocab-srs";

export type VocabSource = "lesson" | "song" | "drama" | "manual";

export type VocabItem = {
  id: string;
  zh: string;
  pinyin?: string | null;
  ko?: string | null;
  hsk?: number | null;
  emoji?: string | null;
  lesson_id?: string | null;
  created_at: string;
  tags?: string[];
  source?: VocabSource | null;
  srs?: SrsState;
};

const GUEST_KEY_V2 = "dingdong:vocab:v2";
const GUEST_KEY_V1 = "dingdong:vocab:v1";

function readRaw(key: string): VocabItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw) as VocabItem[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function ensureFullItem(item: VocabItem): VocabItem {
  return {
    ...item,
    tags: item.tags ?? [],
    source: item.source ?? "manual",
    srs: item.srs ?? initialSrs(new Date(item.created_at || Date.now())),
  };
}

export function loadGuestVocab(): VocabItem[] {
  if (typeof window === "undefined") return [];
  // Migrate v1 → v2 once.
  const v2raw = window.localStorage.getItem(GUEST_KEY_V2);
  if (!v2raw) {
    const v1 = readRaw(GUEST_KEY_V1);
    if (v1.length) {
      const migrated = v1.map(ensureFullItem);
      window.localStorage.setItem(GUEST_KEY_V2, JSON.stringify(migrated));
      return migrated;
    }
    return [];
  }
  return readRaw(GUEST_KEY_V2).map(ensureFullItem);
}

export function saveGuestVocab(items: VocabItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GUEST_KEY_V2, JSON.stringify(items));
}

export function addGuestVocab(
  input: Omit<VocabItem, "id" | "created_at" | "srs">,
): VocabItem[] {
  const items = loadGuestVocab();
  if (items.some((x) => x.zh === input.zh)) return items;
  const now = new Date();
  const next: VocabItem = {
    ...input,
    tags: input.tags ?? [],
    source: input.source ?? "manual",
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    created_at: now.toISOString(),
    srs: initialSrs(now),
  };
  const merged = [next, ...items];
  saveGuestVocab(merged);
  return merged;
}

export function removeGuestVocab(zh: string): VocabItem[] {
  const items = loadGuestVocab().filter((x) => x.zh !== zh);
  saveGuestVocab(items);
  return items;
}

export function updateGuestVocabTags(id: string, tags: string[]): VocabItem[] {
  const items = loadGuestVocab().map((v) => (v.id === id ? { ...v, tags } : v));
  saveGuestVocab(items);
  return items;
}

export function gradeGuestVocab(id: string, grade: SrsGrade): VocabItem[] {
  const now = new Date();
  const items = loadGuestVocab().map((v) => {
    if (v.id !== id) return v;
    const nextSrs = applyGrade(v.srs ?? initialSrs(now), grade, now);
    return { ...v, srs: nextSrs };
  });
  saveGuestVocab(items);
  return items;
}

export function listGuestVocabTags(): string[] {
  const set = new Set<string>();
  for (const v of loadGuestVocab()) for (const t of v.tags ?? []) set.add(t);
  return [...set].sort();
}

/* ---------- Emoji heuristic ---------- */
const EMOJI_MAP: Array<[RegExp, string]> = [
  [/你好|您好|hi|hello|안녕/i, "👋"],
  [/谢谢|감사|thank/i, "🙏"],
  [/对不起|미안|sorry/i, "🙇"],
  [/再见|bye|잘가/i, "👋"],
  [/爱|喜欢|love|좋아/i, "❤️"],
  [/家|집|home/i, "🏠"],
  [/学校|학교|school/i, "🏫"],
  [/老师|선생/i, "👩‍🏫"],
  [/学生|学习|공부|학생|study/i, "📚"],
  [/书|책|book/i, "📖"],
  [/朋友|친구|friend/i, "🧑‍🤝‍🧑"],
  [/吃|먹|eat|food|饭|菜/i, "🍚"],
  [/喝|마시|drink|水|차|茶/i, "🍵"],
  [/咖啡|coffee/i, "☕"],
  [/苹果|사과|apple/i, "🍎"],
  [/钱|돈|money/i, "💰"],
  [/工作|일|job|work/i, "💼"],
  [/电话|전화|phone/i, "📞"],
  [/电脑|컴퓨터|computer/i, "💻"],
  [/手机|핸드폰|mobile/i, "📱"],
  [/时间|시간|time/i, "⏰"],
  [/今天|오늘|today/i, "📅"],
  [/明天|내일|tomorrow/i, "🌅"],
  [/天气|날씨|weather/i, "☀️"],
  [/雨|비|rain/i, "🌧️"],
  [/雪|눈|snow/i, "❄️"],
  [/走|걷|walk|去|가/i, "🚶"],
  [/跑|run|뛰/i, "🏃"],
  [/车|차|car/i, "🚗"],
  [/飞机|비행기|plane/i, "✈️"],
  [/旅행|여행|travel/i, "🧳"],
  [/医院|병원|hospital/i, "🏥"],
  [/医生|의사|doctor/i, "🩺"],
  [/水果|과일|fruit/i, "🍓"],
  [/音乐|음악|music/i, "🎵"],
  [/电影|영화|movie/i, "🎬"],
  [/睡|자|sleep/i, "😴"],
  [/笑|웃|smile|happy|开心|高兴/i, "😊"],
  [/哭|울|cry|sad|难过/i, "😢"],
  [/生气|화|angry/i, "😠"],
  [/问|质问|묻|ask|问题/i, "❓"],
  [/是|不是|是吗/i, "✅"],
  [/没|不|아니|no/i, "🚫"],
];

export function guessEmoji(zh: string, ko?: string | null): string {
  const hay = `${zh} ${ko ?? ""}`;
  for (const [re, e] of EMOJI_MAP) if (re.test(hay)) return e;
  if (zh.length <= 2) return "✨";
  if (zh.length <= 4) return "💬";
  return "📝";
}

/* ---------- Pronunciation scoring ---------- */
export function normalizeZh(s: string) {
  return s.replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();
}

export function scorePronunciation(target: string, heard: string): number {
  const a = normalizeZh(target);
  const b = normalizeZh(heard);
  if (!a || !b) return 0;
  const setA = new Set(a);
  let hit = 0;
  for (const ch of b) if (setA.has(ch)) hit++;
  const denom = Math.max(a.length, b.length);
  return Math.min(1, hit / denom);
}
