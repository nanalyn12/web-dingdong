/** 학습송을 좁혀 보는 두 축 — 장르(어떤 음악인지)와 주제(무슨 이야기인지).
 *
 * ── 장르 ──
 *
 * Suno로 만든 곡은 `style`에 프롬프트 문구가 들어가고("upbeat city pop,
 * mandarin vocals"), 실제 노래(curated)는 style이 아예 없다. 두 종류를 같은
 * 필터로 좁히려면 사람이 읽는 장르 값이 따로 필요해서 `songs.genre` 컬럼을
 * 둔다. 스타일 프리셋은 각자 자기 장르를 들고 있으므로, AI 생성 경로에서는
 * 편집자가 장르를 따로 고를 필요가 없다.
 */

export const SONG_GENRES = [
  { value: "kpop", label: "🎀 K-POP풍" },
  { value: "ballad", label: "🌙 발라드" },
  { value: "citypop", label: "🌆 시티팝" },
  { value: "hiphop", label: "🎧 힙합·로파이" },
  { value: "folk", label: "🌿 어쿠스틱·포크" },
  { value: "edm", label: "💃 EDM·댄스" },
  { value: "kids", label: "🧸 동요" },
  { value: "traditional", label: "🏮 전통 퓨전" },
  // 아래는 실제 노래(curated) 등록용 — Suno 프리셋에는 대응하는 항목이 없다.
  { value: "cpop", label: "🎤 중화권 팝" },
  { value: "rock", label: "🎸 록" },
  { value: "ost", label: "🎬 드라마·영화 OST" },
] as const;

export type SongGenre = (typeof SONG_GENRES)[number]["value"];

export const GENRE_LABEL: Record<string, string> = Object.fromEntries(
  SONG_GENRES.map((g) => [g.value, g.label]),
);

/** Suno에 그대로 넘어가는 스타일 프롬프트. `genre`는 이 프리셋으로 만든 곡이
 * 목록에서 어느 장르로 묶일지 결정한다. */
export const STYLE_PRESETS: {
  value: string;
  label: string;
  genre: SongGenre;
}[] = [
  { value: "cute k-pop, mandarin pop, bright", label: "🎀 큐트 K-POP", genre: "kpop" },
  { value: "soft mandarin ballad, warm piano", label: "🌙 만다린 발라드", genre: "ballad" },
  { value: "upbeat city pop, mandarin vocals", label: "🌆 시티팝", genre: "citypop" },
  { value: "lo-fi hip hop, chill mandarin rap", label: "🎧 로파이 힙합", genre: "hiphop" },
  { value: "acoustic folk, gentle guitar, mandarin", label: "🌿 어쿠스틱 포크", genre: "folk" },
  { value: "edm dance pop, energetic mandarin", label: "💃 EDM 댄스", genre: "edm" },
  { value: "children song, playful mandarin, simple melody", label: "🧸 동요풍", genre: "kids" },
  {
    value: "traditional chinese, guzheng, modern fusion",
    label: "🏮 전통 퓨전",
    genre: "traditional",
  },
];

/** 프리셋을 벗어난 스타일 문구(재생성 시 편집자가 직접 적은 값)를 위한 보정.
 * 좁은 규칙이 먼저 와야 한다 — "dance pop"은 pop이 아니라 EDM, "city pop"도
 * 마찬가지다. */
const STYLE_HINTS: [RegExp, SongGenre][] = [
  [/children|kids|nursery|lullab/i, "kids"],
  [/guzheng|erhu|traditional|oriental/i, "traditional"],
  [/lo-?fi|hip.?hop|rap|trap/i, "hiphop"],
  [/edm|dance|electro|techno|house|club/i, "edm"],
  [/folk|acoustic|guitar|country/i, "folk"],
  [/city.?pop|funk|disco|jazz/i, "citypop"],
  [/ballad|piano|slow|orchestral/i, "ballad"],
  [/rock|punk|metal|band/i, "rock"],
  [/k-?pop|pop|idol/i, "kpop"],
];

/** 스타일 문구에서 장르를 유추한다. `genre` 컬럼이 생기기 전에 만들어진 곡은
 * 이 함수로 읽는 시점에 장르가 채워지므로 별도 백필이 필요 없다. */
export function genreFromStyle(style: string | null | undefined): SongGenre | null {
  const s = style?.trim();
  if (!s) return null;
  const preset = STYLE_PRESETS.find((p) => p.value === s);
  if (preset) return preset.genre;
  for (const [re, genre] of STYLE_HINTS) {
    if (re.test(s)) return genre;
  }
  return null;
}

/* ── 주제 ────────────────────────────────────────────────────────────────
 * 곡의 `topic`은 작사에 쓴 자유 키워드("登机牌", "고된 하루")라 곡마다 거의
 * 다르다. 그대로 필터에 걸면 곡 목록을 한 번 더 보여주는 꼴이라, 몇 개의
 * 주제 묶음으로 분류해 `songs.theme`에 담는다. */

export const SONG_THEMES = [
  { value: "daily", label: "☕ 일상·생활" },
  { value: "love", label: "💗 사랑·감정" },
  { value: "friend", label: "🧑‍🤝‍🧑 친구·관계" },
  { value: "travel", label: "✈️ 여행·이동" },
  { value: "food", label: "🍜 음식" },
  { value: "city", label: "🌃 도시·야경" },
  { value: "season", label: "🌸 계절·자연" },
  { value: "study", label: "📚 학교·공부" },
  { value: "work", label: "💪 일·응원" },
  { value: "culture", label: "🏮 문화·명절" },
] as const;

export type SongTheme = (typeof SONG_THEMES)[number]["value"];

export const THEME_LABEL: Record<string, string> = Object.fromEntries(
  SONG_THEMES.map((t) => [t.value, t.label]),
);

/** 키워드/제목에서 주제를 유추한다. 키워드는 대개 한국어지만 중국어 제목만
 * 남은 곡도 있어 양쪽 표기를 함께 본다. 순서가 곧 우선순위 — 좁은 주제를
 * 먼저 두고, 무엇에나 걸리기 쉬운 "일상"을 마지막 그물로 남긴다. */
const THEME_HINTS: [RegExp, SongTheme][] = [
  [/여행|출국|공항|탑승|비행|기차|旅行|机场|登机|火车|飞/i, "travel"],
  [/음식|먹|맛집|요리|식사|밥|吃|美食|饭|菜|茶/i, "food"],
  [/명절|전통|문화|축제|설날|중추|春节|中秋|传统|文化/i, "culture"],
  [/공부|학교|수업|시험|배우|학습|学习|学校|考试|汉语/i, "study"],
  [
    /사랑|연애|고백|이별|그리|마음|설레|위로|위안|운명|숙명|愛|爱|恋|喜欢|心|温柔|慰藉|宿命/i,
    "love",
  ],
  [/친구|우정|동료|같이|함께|朋友|友情|一起/i, "friend"],
  [/야경|도시|거리|네온|지하철|밤거리|城市|夜景|霓虹|街/i, "city"],
  [/봄|여름|가을|겨울|계절|날씨|비|눈|바람|꽃|하늘|春|夏|秋|冬|雨|雪|花|风/i, "season"],
  [/응원|힘내|하루|퇴근|일터|시합|경기|도전|加油|工作|比赛|努力/i, "work"],
  [
    /일상|생활|카페|아침|점심|오후|저녁|주말|수다|산책|나른|집|日常|生活|咖啡|散步|聊天|下午|慵懒/i,
    "daily",
  ],
];

/** 작사 키워드와 제목을 합쳐 주제를 고른다. `theme` 컬럼이 비어 있는 옛 곡도
 * 읽는 시점에 채워지므로 백필이 필요 없다. */
export function themeFromKeywords(...parts: (string | null | undefined)[]): SongTheme | null {
  const text = parts.filter(Boolean).join(" ").trim();
  if (!text) return null;
  for (const [re, theme] of THEME_HINTS) {
    if (re.test(text)) return theme;
  }
  return null;
}
