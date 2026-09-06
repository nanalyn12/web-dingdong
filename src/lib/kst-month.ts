// KST 달력 위의 날짜 계산. 이 앱의 타임스탬프 컬럼은 전부 UTC ISO 문자열
// (schema.ts의 `mode: "string"`)인데 사용자가 말하는 "오늘"·"이번 달"은 서울
// 달력이다. 두 달력은 하루 24시간 중 9시간 동안 서로 다른 날짜를 가리킨다.
//
// `+ 9 * 3600_000` 관용구가 이미 세 곳에 복제돼 있었다(widgets.functions.ts의
// kstDateKey, learning-activity.server.ts의 kstToday, students.functions.ts의
// kstDateNDaysAgo). 월 경계까지 네 번째 사본으로 얹는 대신 여기로 모은다 —
// 오프셋이 하나라도 틀리면 통계가 하루씩 밀리는데, 사본이 넷이면 어느 것이
// 틀렸는지 알 수 없다.
//
// 순수 모듈이다. `Date.now()`를 안에서 부르지 않고 시각을 주입받는다 — 그래야
// 달이 갈리는 경계 시각을 테스트할 수 있다.

const KST_OFFSET_MS = 9 * 3600_000;

/** UTC 시각을 KST 벽시계로 옮긴 Date. 내부 계산용 — 그대로 저장하면 안 된다. */
function toKstClock(now: Date): Date {
  return new Date(now.getTime() + KST_OFFSET_MS);
}

/** KST 기준 날짜 키 `"YYYY-MM-DD"`. */
export function kstDateKey(now: Date): string {
  return toKstClock(now).toISOString().slice(0, 10);
}

/** 오늘로부터 KST 기준 `n`일 전의 날짜 키. `n = 0`이면 오늘. */
export function kstDateKeyNDaysAgo(n: number, now: Date = new Date()): string {
  return kstDateKey(new Date(now.getTime() - n * 86400_000));
}

/**
 * `now`가 속한 KST 달의 UTC 반열림 구간 `[start, end)`.
 *
 * 반열림인 이유: 다음 달 1일 00:00 KST에 생성된 행이 두 달에 모두 세어지면
 * 안 된다. 호출부는 `gte(start)` + `lt(end)`로 비교한다.
 *
 * 끝 경계를 `start + 30일`로 잡는 지름길은 열한 달 동안 틀린다 — 달의 길이는
 * 상수가 아니므로 `Date.UTC(y, m + 1, 1)`로 다음 달 1일을 직접 만든다.
 */
export function kstMonthRange(now: Date): { start: string; end: string } {
  const kst = toKstClock(now);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month, 1) - KST_OFFSET_MS).toISOString(),
    end: new Date(Date.UTC(year, month + 1, 1) - KST_OFFSET_MS).toISOString(),
  };
}

/** `"2026년 9월"` — 숫자 옆에 붙어 "무엇을 센 것인지"를 스스로 말하는 라벨. */
export function kstMonthLabel(now: Date): string {
  const kst = toKstClock(now);
  return `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월`;
}
