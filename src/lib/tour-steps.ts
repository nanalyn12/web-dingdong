import type { DriveStep } from "driver.js";

export function landingTourSteps(): DriveStep[] {
  return [
    {
      element: '[data-tour="hero"]',
      popover: {
        title: "DingDong에 오신 걸 환영해요! 🎉",
        description:
          "한국인 학습자를 위한 AI 중국어 학습 플랫폼이에요. 매일 한 입씩 가볍게 배워봐요!",
      },
    },
    {
      element: '[data-tour="hero-cta"]',
      popover: {
        title: "여기서 시작하세요",
        description: "「강의 둘러보기」로 바로 학습을 시작할 수 있어요.",
      },
    },
    {
      element: '[data-tour="categories"]',
      popover: {
        title: "🍽️ 카테고리 메뉴판",
        description: "관심사로 시작해 보세요. 일상 회화, 여행, 비즈니스, HSK까지!",
      },
    },
    {
      element: '[data-tour="featured"]',
      popover: {
        title: "🔥 새로 나온 강의",
        description: "叮叮이 막 구워낸 따끈한 강의들이에요. 카드를 클릭하면 학습이 시작돼요.",
      },
    },
    {
      element: '[data-tour="level-path"]',
      popover: {
        title: "🗺️ 단계별 학습 지도",
        description: "초급 → 중급 → 고급 단계로 HSK 1~9급까지 함께 가요.",
      },
    },
  ];
}

export function sidebarTourSteps(): DriveStep[] {
  return [
    {
      element: '[data-tour="sidebar-logo"]',
      popover: {
        title: "사이드바 둘러보기 🐼",
        description: "여기는 메인 메뉴예요. 모든 페이지로 빠르게 이동할 수 있어요.",
      },
    },
    {
      element: '[data-tour="sidebar-nav"]',
      popover: {
        title: "주요 학습 메뉴",
        description: "강의, 영상 학습, 학습송, 단어장에 한 번에 접근할 수 있어요.",
      },
    },
    {
      element: '[data-tour="sidebar-lessons"]',
      popover: {
        title: "📖 세부 강의 목록",
        description: "강의별 주차 레슨이 트리로 보여요. 클릭해서 바로 이동하세요.",
      },
    },
    {
      element: '[data-tour="help-button"]',
      popover: {
        title: "도움말 버튼",
        description: "언제든 이 버튼으로 코치마크를 다시 볼 수 있어요!",
      },
    },
  ];
}

export function coursesTourSteps(): DriveStep[] {
  return [
    {
      element: '[data-tour="course-create"]',
      popover: {
        title: "강의 만들기 (교수자/관리자)",
        description: "제목, 설명, 난이도, 주차 수를 입력하면 AI가 주차별 강의를 한 번에 생성해요.",
      },
    },
    {
      element: '[data-tour="course-list"]',
      popover: {
        title: "강의 목록",
        description: "여기서 강의 카드를 클릭하면 세부 강의로 이동할 수 있어요.",
      },
    },
  ];
}

export function dingdongTourSteps(): DriveStep[] {
  return [
    {
      element: '[data-tour="bot-fab"]',
      popover: {
        title: "안녕! 나는 叮叮(딩딩)이야 🐼",
        description: "여기를 누르면 언제든 도움을 받을 수 있어요. 음성으로도 대화 가능해요!",
      },
    },
  ];
}
