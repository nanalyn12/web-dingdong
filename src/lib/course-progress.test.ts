import { describe, it, expect } from "vitest";

import { courseRingState } from "./course-progress";

/** 운영 DB에서 가장 큰 강의 두 개의 세부 강의 수. */
const THIRTY_NINE = 39;
const FORTY = 40;

describe("what the course card's progress ring counts", () => {
  // L1-1
  it("shows no ring for a course with no lessons yet", () => {
    const s = courseRingState({ lessonCount: 0, completedLessons: 0, signedIn: true });
    expect(s.show).toBe(false);
    expect(s.caption).toBe("아직 세부 강의가 준비되지 않았어요");
  });

  // L1-2
  it("shows no ring to a reader who is not signed in", () => {
    // 진도는 사람마다 다르다. 로그인 전에는 셀 진도가 없으므로 0%를 보여 주는
    // 대신 링을 접는다.
    const s = courseRingState({
      lessonCount: THIRTY_NINE,
      completedLessons: 0,
      signedIn: false,
    });
    expect(s.show).toBe(false);
    expect(s.caption).toBe("세부 강의 39개");
  });

  // L1-3
  it("starts a signed-in reader at zero", () => {
    const s = courseRingState({
      lessonCount: THIRTY_NINE,
      completedLessons: 0,
      signedIn: true,
    });
    expect(s).toMatchObject({ show: true, ratio: 0, done: 0, total: THIRTY_NINE });
    expect(s.caption).toBe("세부 강의 39개 · 아직 시작하지 않았어요");
  });

  // L1-4
  it("counts finished lessons against the course's lessons", () => {
    const s = courseRingState({ lessonCount: FORTY, completedLessons: 10, signedIn: true });
    expect(s).toMatchObject({ show: true, ratio: 0.25, done: 10, total: FORTY });
    expect(s.caption).toBe("세부 강의 40개 중 10개 완료");
  });

  // L1-5
  it("fills the ring only when every lesson is finished", () => {
    const s = courseRingState({
      lessonCount: THIRTY_NINE,
      completedLessons: THIRTY_NINE,
      signedIn: true,
    });
    expect(s.ratio).toBe(1);
    expect(s.caption).toBe("세부 강의 39개 모두 완료");
  });

  // L1-6
  it("does not overflow when the progress cache is ahead of the lesson list", () => {
    const s = courseRingState({ lessonCount: 5, completedLessons: 9, signedIn: true });
    expect(s.ratio).toBe(1);
    expect(s.done).toBe(s.total);
  });

  // L1-7
  it("does not underflow on a negative count", () => {
    const s = courseRingState({ lessonCount: 5, completedLessons: -3, signedIn: true });
    expect(s.ratio).toBe(0);
    expect(s.done).toBe(0);
  });

  // L1-8 — 회귀 가드. weeks 래칫(weeks = GREATEST(weeks, lesson count)) 때문에
  // 운영 DB 14개 강의 전부 weeks === lesson_count 이고, 그 값을 분모로 쓰면
  // 링이 항상 100%가 된다. 진도는 weeks 와 무관해야 한다.
  it("does not read full just because the course is fully authored", () => {
    const authored = [39, 27, 17, 40, 29, 33, 31, 21, 16, 24, 28, 31, 26, 2];
    for (const lessonCount of authored) {
      const s = courseRingState({ lessonCount, completedLessons: 0, signedIn: true });
      expect(s.ratio).toBe(0);
    }
  });
});
