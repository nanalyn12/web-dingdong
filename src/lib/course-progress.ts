// 강의 카드의 진도 링이 무엇을 세는지 한 곳에서 정한다.
//
// 링은 읽는 사람이 끝낸 세부 강의 수를 센다 — 강의 상세 화면
// (_app.courses.$id.tsx)이 이미 쓰는 정의와 같다.
//
// 분모로 courses.weeks 를 쓰면 안 된다. weeks 는 독립적인 계획값이 아니라
// `GREATEST(weeks, count(lessons))` 래칫이 걸린 값이어서(courses.functions.ts,
// generate-lesson.functions.ts, video/pipeline.server.ts) 언제나 세부 강의 수와
//같거나 크다. 실제로 운영 DB 14개 강의는 전부 weeks === lesson_count 이고,
// 그래서 링이 구조적으로 100% 밖의 값을 가질 수 없었다. 이 모듈은 weeks 를
// 인자로 받지 않는다.

export type CourseRingState = {
  /** 링을 그릴지. 셀 진도가 없을 때는 접는다. */
  show: boolean;
  /** 0~1. 링의 채움 비율. */
  ratio: number;
  /** 링 가운데 분자. */
  done: number;
  /** 링 가운데 분모. */
  total: number;
  /** 카드 아래 설명. 진도보다 콘텐츠 분량을 먼저 말한다. */
  caption: string;
};

export function courseRingState(args: {
  lessonCount: number;
  completedLessons: number;
  signedIn: boolean;
}): CourseRingState {
  const total = Math.max(0, Math.trunc(args.lessonCount));

  if (total === 0) {
    return {
      show: false,
      ratio: 0,
      done: 0,
      total: 0,
      caption: "아직 세부 강의가 준비되지 않았어요",
    };
  }

  // 진도는 사람마다 다르다. 로그인 전에는 셀 것이 없으므로 0%를 들이미는 대신
  // 분량만 알려 준다.
  if (!args.signedIn) {
    return { show: false, ratio: 0, done: 0, total, caption: `세부 강의 ${total}개` };
  }

  // 진도 캐시가 강의 목록보다 앞서거나(삭제된 세부 강의) 뒤틀린 값이 와도
  // 링이 넘치거나 음수가 되지 않게 양쪽을 막는다.
  const done = Math.min(total, Math.max(0, Math.trunc(args.completedLessons)));

  const caption =
    done === 0
      ? `세부 강의 ${total}개 · 아직 시작하지 않았어요`
      : done === total
        ? `세부 강의 ${total}개 모두 완료`
        : `세부 강의 ${total}개 중 ${done}개 완료`;

  return { show: true, ratio: done / total, done, total, caption };
}
