// 학습송 가사에서 "부르는 줄"이 무엇인지 한 곳에서 정한다.
//
// Suno에 넘기는 가사에는 `[Verse 1]`·`[Chorus]` 같은 구간 표시가 섞여 있고,
// 그 줄도 lyrics 배열의 원소로 저장된다(운영 DB 4,412줄 중 876줄). 가사 싱크와
// 하이라이트는 이 표시를 건너뛰었지만, 순서 맞추기는 lyrics.slice(0, 6)로
// 문제를 만들어 219곡 전부 `[Verse 1]`을 정렬 대상으로 내놓았고, 목록 카드의
// "가사 N줄"도 표시까지 세었다.

export type LyricLineLike = { zh?: string | null };

/** `[Verse 1]`, `[Chorus]`처럼 줄 전체가 대괄호 하나로 된 구간 표시인가. */
export function isSectionHeader(text: string | null | undefined): boolean {
  if (!text) return false;
  return /^\s*\[[^\]]+\]\s*$/.test(text);
}

/** 구간 표시와 빈 줄을 뺀, 실제로 부르는 줄. 원래 순서를 지킨다. */
export function sungLines<T extends LyricLineLike>(lyrics: T[]): T[] {
  return lyrics.filter((l) => !isSectionHeader(l.zh) && !!l.zh?.trim());
}

/** 순서 맞추기에 쓰는 줄 수. */
const PUZZLE_LINES = 6;
/** 이보다 적으면 맞출 순서가 없다. */
const PUZZLE_MIN = 3;

/** 순서 맞추기 문제로 낼 줄들(원래 순서). 부르는 줄이 3줄 미만이면 빈 배열. */
export function orderPuzzleLines<T extends LyricLineLike>(lyrics: T[]): T[] {
  const sung = sungLines(lyrics);
  return sung.length < PUZZLE_MIN ? [] : sung.slice(0, PUZZLE_LINES);
}
