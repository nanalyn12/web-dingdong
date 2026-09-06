import { navItemsFor } from "./nav-items";
import { isEditorRole } from "./roles";

import type { LucideIcon } from "lucide-react";

/**
 * 교수자·관리자 홈 콘솔의 카드 그리드.
 *
 * nav-items.ts 머리 주석의 규칙("두 표면이 같은 메뉴를 각자 나열하면 조용히
 * 갈라진다")이 한 층 위에서 그대로 적용된다. 사이드바·모바일 시트·탭바에 이어
 * 콘솔이 네 번째 소비자다. 카드가 `url: "/studio"`를 자기 문자열로 다시 적으면
 * 라우트 이름이 바뀌는 날까지는 잘 돌아가다가, 그날부터 사이드바는 멀쩡한데
 * 카드만 404를 낸다.
 *
 * 그래서 이 모듈은 "메뉴에서 무엇을 고를지"와 "고른 것에 무엇을 덧붙일지"만
 * 정한다. 제목·목적지·아이콘은 전부 `navItemsFor(role)`이 준 값을 그대로 쓴다.
 * 역할 판정도 `roles.ts` 한 곳을 거친다 — 이 파일에는 role 문자열이 없다.
 */

/** 카드에 붙는 숫자의 이름. 값은 서버가 채운다(console.functions.ts). */
export type ConsoleMetricKey =
  | "idleStudents"
  | "videoJobsWaiting"
  | "songsFailed"
  | "integrationsMissing"
  | "pendingTeachers";

export type ConsoleCard = {
  id: string;
  title: string;
  url: string;
  icon: LucideIcon;
  /** 이 카드를 눌러야 할 이유. 숫자가 0일 때도 카드가 비어 보이지 않게 한다. */
  description: string;
  /** 대기 큐 숫자의 이름. `null`이면 이 카드에는 숫자를 붙이지 않는다. */
  metric: ConsoleMetricKey | null;
  /** 숫자 옆에 붙는 단위 문구 — "3명 미활동"의 "명 미활동". */
  metricLabel: string | null;
};

/**
 * 카드가 될 메뉴 항목과, 메뉴에서 가져올 수 없는 부분.
 *
 * D-1: 숫자는 "내가 손대야 사라지는 것"의 개수여야 한다. 커리큘럼에는 실패도
 * 대기도 없어서 셀 수 있는 것이 "내가 만든 개수"뿐인데, 그건 손대도 줄지 않는
 * 재고다. 재고를 뱃지로 그리면 매일 아침 처리할 수 없는 알림이 하나 늘고,
 * 그 다음부터는 진짜 쌓인 카드도 눈에 안 들어온다. 비어 있는 것이 정답이다.
 */
type CardSpec = {
  id: string;
  url: string;
  /** 메뉴 제목을 그대로 쓰지 않는 경우에만 적는다. */
  title?: string;
  description: string;
  metric: ConsoleMetricKey | null;
  metricLabel: string | null;
};

const CARD_SPECS: CardSpec[] = [
  {
    id: "students",
    url: "/students",
    description: "일주일 넘게 안 들어온 학습자를 먼저 보여줘요.",
    metric: "idleStudents",
    metricLabel: "명 미활동",
  },
  {
    id: "curriculum",
    url: "/curriculum",
    description: "주차별 강의 계획을 AI와 함께 짜요.",
    metric: null,
    metricLabel: null,
  },
  {
    id: "studio",
    url: "/studio",
    description: "승인을 기다리거나 실패한 영상 작업을 처리해요.",
    metric: "videoJobsWaiting",
    metricLabel: "건 처리 대기",
  },
  {
    // 메뉴가 이 화면을 "학습송"이라 부르는 것은 학습자가 들으러 가기
    // 때문이고, 콘솔이 "학습송 생성"이라 부르는 것은 교수자가 만들러 가기
    // 때문이다. 의도된 차이라 여기 한 줄로 고정한다.
    id: "songs",
    url: "/songs",
    title: "학습송 생성",
    description: "가사·음원·영상을 만들고 실패한 곡을 다시 굽습니다.",
    metric: "songsFailed",
    metricLabel: "곡 생성 실패",
  },
  {
    id: "integrations",
    url: "/integrations",
    description: "키가 빠진 연동이 있으면 그 기능이 통째로 멈춰요.",
    metric: "integrationsMissing",
    metricLabel: "개 미설정",
  },
  {
    // 같은 화면, 두 청중. 관리자에게는 승인·운영 도구이고 교수자에게는
    // 자기 콘텐츠 백업·복원 도구다. 카드는 메뉴가 이미 정한 이름을 따른다.
    // 숫자(승인 대기 교사)는 관리자에게만 도착한다 — 그 판정은 화면이 아니라
    // 서버가 한다(console.functions.ts).
    id: "manage",
    url: "/admin",
    description: "콘텐츠 백업·복원과 가입 신청 처리.",
    metric: "pendingTeachers",
    metricLabel: "명 승인 대기",
  },
];

/** `role`의 콘솔 카드. 편집 권한이 없는 역할에게는 콘솔 자체가 없다. */
export function consoleCardsFor(role: string | null | undefined): ConsoleCard[] {
  if (!isEditorRole(role)) return [];
  const menu = new Map(navItemsFor(role).map((item) => [item.url, item]));
  return CARD_SPECS.flatMap((spec) => {
    const item = menu.get(spec.url);
    // 메뉴에 없는 목적지는 카드도 만들지 않는다. 카드가 메뉴보다 많은 권한을
    // 광고하는 상태를 구조적으로 막는다.
    if (!item) return [];
    return [
      {
        id: spec.id,
        title: spec.title ?? item.title,
        url: item.url,
        icon: item.icon,
        description: spec.description,
        metric: spec.metric,
        metricLabel: spec.metricLabel,
      },
    ];
  });
}
