import { describe, it, expect } from "vitest";

import { kstMonthLabel, kstMonthRange } from "./kst-month";

/*
 * Batch ⑬ — "this month" on the teacher console.
 *
 * The console shows two counts a teacher asked for by name: how many 영상 학습
 * and how many 학습송 they made *this month*. "This month" is the month on a
 * Korean calendar, but every timestamp column in this app is a UTC ISO string
 * (schema.ts:92 — `mode: "string"`), so the boundary has to be expressed in UTC
 * and the two calendars disagree for nine hours out of every twenty-four.
 *
 * That disagreement is the whole point of these cases. Between 15:00Z and
 * 23:59Z the KST date is already tomorrow, so on the last day of a month those
 * nine hours belong to the NEXT month even though `now.getUTCMonth()` still
 * says the old one. A range computed from UTC parts is wrong for 37.5% of the
 * clock and right the rest of the time, which is exactly the kind of bug that
 * ships: the numbers look plausible all afternoon and go wrong after midnight.
 *
 * The range is half-open — `[start, end)`, compared with `lt` — because a row
 * created at 00:00 KST on the 1st must be counted by exactly one month, not by
 * both the month that just ended and the one that just began.
 *
 * `now` is injected rather than read from `Date.now()` inside, otherwise none
 * of the instants below can be tested at all.
 */

const iso = (s: string) => new Date(s);

describe("kstMonthRange", () => {
  it("이번 달을 KST 달력 기준 UTC 반열림 구간으로 낸다", () => {
    expect(kstMonthRange(iso("2026-09-06T00:00:00Z"))).toEqual({
      start: "2026-08-31T15:00:00.000Z",
      end: "2026-09-30T15:00:00.000Z",
    });
  });

  // 16:00Z on the last day of August is 01:00 on 1 September in Seoul. UTC says
  // August, the user says September, and the user is right.
  it("UTC로는 8월이지만 KST로는 9월인 시각을 9월로 판정한다", () => {
    expect(kstMonthRange(iso("2026-08-31T16:00:00Z"))).toEqual({
      start: "2026-08-31T15:00:00.000Z",
      end: "2026-09-30T15:00:00.000Z",
    });
  });

  // One millisecond earlier is 23:59:59.999 on 31 August in Seoul — still August.
  it("KST 8월 31일 23시 59분 59.999초는 아직 8월로 판정한다", () => {
    expect(kstMonthRange(iso("2026-08-31T14:59:59.999Z"))).toEqual({
      start: "2026-07-31T15:00:00.000Z",
      end: "2026-08-31T15:00:00.000Z",
    });
  });

  it("연말 경계에서 KST 새해 첫날을 다음 해 1월로 판정한다", () => {
    expect(kstMonthRange(iso("2026-12-31T16:00:00Z"))).toEqual({
      start: "2026-12-31T15:00:00.000Z",
      end: "2027-01-31T15:00:00.000Z",
    });
  });

  it("연초에는 시작 경계가 전년도 12월 31일 15시 UTC다", () => {
    expect(kstMonthRange(iso("2026-01-15T00:00:00Z"))).toEqual({
      start: "2025-12-31T15:00:00.000Z",
      end: "2026-01-31T15:00:00.000Z",
    });
  });

  // Month length is not a constant. `start + 30 days` is a tempting shortcut
  // that is wrong eleven months a year.
  it("28일까지 있는 달의 끝 경계는 2월 28일 15시 UTC다", () => {
    expect(kstMonthRange(iso("2026-02-10T00:00:00Z")).end).toBe("2026-02-28T15:00:00.000Z");
  });

  it("윤년 2월의 끝 경계는 2월 29일 15시 UTC다", () => {
    expect(kstMonthRange(iso("2028-02-10T00:00:00Z")).end).toBe("2028-02-29T15:00:00.000Z");
  });
});

/** The instants above, reused as a self-check corpus. */
const INSTANTS = [
  "2026-09-06T00:00:00Z",
  "2026-08-31T16:00:00Z",
  "2026-08-31T14:59:59.999Z",
  "2026-12-31T16:00:00Z",
  "2026-01-15T00:00:00Z",
  "2026-02-10T00:00:00Z",
  "2028-02-10T00:00:00Z",
];

describe("반열림 구간의 자기검증", () => {
  // Stated independently of the hardcoded values above: whatever the function
  // returns, `now` has to fall inside its own month. An off-by-one-day or an
  // offset applied in the wrong direction fails here even if the literals were
  // copied from the implementation.
  it.each(INSTANTS)("%s 는 자기 자신이 낸 구간 안에 들어간다", (instant) => {
    const now = iso(instant);
    const { start, end } = kstMonthRange(now);
    expect(start <= now.toISOString()).toBe(true);
    expect(now.toISOString() < end).toBe(true);
  });

  // Adjacent months must abut exactly: a gap loses rows created in it, an
  // overlap counts them twice.
  it.each([
    ["2026-08-15T00:00:00Z", "8월→9월"],
    ["2026-12-15T00:00:00Z", "12월→1월"],
  ])("%s 의 end 를 now 로 넣으면 다음 달 start 가 그 end 와 같다 (%s)", (instant) => {
    const first = kstMonthRange(iso(instant));
    expect(kstMonthRange(iso(first.end)).start).toBe(first.end);
  });
});

describe("kstMonthLabel", () => {
  // The label answers "what did you just count?", so it has to follow the same
  // calendar the count did — otherwise a teacher reads September's number under
  // an August heading for nine hours a day.
  it("라벨도 KST 달력을 따른다", () => {
    expect(kstMonthLabel(iso("2026-08-31T16:00:00Z"))).toBe("2026년 9월");
  });
});
