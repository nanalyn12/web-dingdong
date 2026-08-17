import { describe, expect, it } from "vitest";

import {
  GENRE_LABEL,
  SONG_GENRES,
  SONG_THEMES,
  STYLE_PRESETS,
  THEME_LABEL,
  genreFromStyle,
  themeFromKeywords,
} from "./song-taxonomy";

describe("genreFromStyle", () => {
  it("프리셋 문구는 프리셋이 들고 있는 장르 그대로다", () => {
    for (const preset of STYLE_PRESETS) {
      expect(genreFromStyle(preset.value)).toBe(preset.genre);
    }
  });

  it("앞뒤 공백은 무시한다", () => {
    expect(genreFromStyle("  upbeat city pop, mandarin vocals  ")).toBe("citypop");
  });

  it("프리셋을 벗어난 문구는 힌트로 유추한다", () => {
    expect(genreFromStyle("dreamy acoustic guitar")).toBe("folk");
    expect(genreFromStyle("Lo-Fi chill beats")).toBe("hiphop");
    expect(genreFromStyle("nursery rhyme for toddlers")).toBe("kids");
  });

  it("좁은 규칙이 넓은 규칙을 이긴다", () => {
    // "dance pop"은 pop이 아니라 EDM, "city pop"도 마찬가지다.
    expect(genreFromStyle("dance pop, energetic")).toBe("edm");
    expect(genreFromStyle("city pop groove")).toBe("citypop");
  });

  it("스타일이 없으면 장르도 없다", () => {
    expect(genreFromStyle(null)).toBeNull();
    expect(genreFromStyle(undefined)).toBeNull();
    expect(genreFromStyle("   ")).toBeNull();
  });

  it("아무 힌트도 걸리지 않으면 null이다", () => {
    expect(genreFromStyle("something entirely unrelated")).toBeNull();
  });
});

describe("themeFromKeywords", () => {
  it("한국어 키워드에서 주제를 고른다", () => {
    expect(themeFromKeywords("공항에서 탑승 준비")).toBe("travel");
    expect(themeFromKeywords("맛집 탐방")).toBe("food");
  });

  it("중국어 표기만 남은 곡도 분류한다", () => {
    expect(themeFromKeywords("登机牌")).toBe("travel");
    expect(themeFromKeywords("中秋节")).toBe("culture");
  });

  it("여러 조각을 합쳐서 본다", () => {
    expect(themeFromKeywords(null, undefined, "우정에 관한 노래")).toBe("friend");
  });

  it("우선순위가 앞선 주제가 이긴다", () => {
    // "여행"이 "일상"보다 앞 규칙이라 둘 다 걸려도 travel이 된다.
    expect(themeFromKeywords("일상 속 여행")).toBe("travel");
  });

  it("빈 입력이면 주제가 없다", () => {
    expect(themeFromKeywords()).toBeNull();
    expect(themeFromKeywords(null, undefined)).toBeNull();
    expect(themeFromKeywords("  ")).toBeNull();
  });

  it("어디에도 안 걸리는 키워드는 null이다", () => {
    expect(themeFromKeywords("zzzz")).toBeNull();
  });
});

describe("분류 상수", () => {
  it("장르 값이 중복되지 않는다", () => {
    const values = SONG_GENRES.map((g) => g.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("주제 값이 중복되지 않는다", () => {
    const values = SONG_THEMES.map((t) => t.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("모든 장르·주제가 라벨을 갖는다", () => {
    for (const g of SONG_GENRES) expect(GENRE_LABEL[g.value]).toBe(g.label);
    for (const t of SONG_THEMES) expect(THEME_LABEL[t.value]).toBe(t.label);
  });

  it("프리셋이 가리키는 장르는 모두 실재하는 장르다", () => {
    const known = new Set(SONG_GENRES.map((g) => g.value));
    for (const preset of STYLE_PRESETS) expect(known.has(preset.genre)).toBe(true);
  });
});
