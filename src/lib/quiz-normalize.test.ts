// AI가 만든 퀴즈는 실행마다 다른 키 이름으로 저장돼 왔다(654개 항목, 117개 형태).
// 이 테스트는 그 실제 변형들을 표본으로 삼아, 렌더 가능한 한 형태로 복구되는지와
// 복구할 수 없는 항목이 조용히 통과하지 않는지를 고정한다.
import { describe, expect, it } from "vitest";

import {
  normalizeQuiz,
  normalizeQuizForStorage,
  normalizeQuizItem,
  type QuizChoice,
  type QuizFill,
  type QuizOrder,
} from "./quiz-normalize";

function asChoice(raw: unknown): QuizChoice {
  const item = normalizeQuizItem(raw);
  expect(item?.type).toBe("choice");
  return item as QuizChoice;
}

function asFill(raw: unknown): QuizFill {
  const item = normalizeQuizItem(raw);
  expect(item?.type).toBe("fill");
  return item as QuizFill;
}

function asOrder(raw: unknown): QuizOrder {
  const item = normalizeQuizItem(raw);
  expect(item?.type).toBe("order");
  return item as QuizOrder;
}

describe("normalizeQuizItem — choice", () => {
  it("이미 규격에 맞는 항목은 그대로 통과한다", () => {
    const item = asChoice({
      type: "choice",
      question_ko: "뜻이 맞는 것은?",
      options: ["苹果", "香蕉"],
      correct: 0,
    });
    expect(item.options).toEqual(["苹果", "香蕉"]);
    expect(item.correct).toBe(0);
  });

  it("객체 보기를 문자열 라벨로 펴서 React가 렌더할 수 있게 만든다", () => {
    // 객체를 그대로 넘기면 "Objects are not valid as a React child"로
    // 퀴즈 탭 전체가 죽었다 — 이 변환이 그 사고의 재발 방지선이다.
    const item = asChoice({
      type: "choice",
      question: "她是谁？",
      ko: "그녀는 누구인가요?",
      options: [
        { zh: "老师", pinyin: "lǎoshī", ko: "선생님" },
        { zh: "学生", pinyin: "xuésheng", ko: "학생" },
      ],
      answer: "老师",
    });
    expect(item.options).toEqual(["老师 (lǎoshī) · 선생님", "学生 (xuésheng) · 학생"]);
    expect(item.correct).toBe(0);
    expect(item.question_ko).toBe("그녀는 누구인가요?");
    expect(item.question_zh).toBe("她是谁？");
  });

  it("1-based로 쓰인 정답 인덱스를 0-based로 되돌린다", () => {
    const item = asChoice({
      type: "choice",
      question_ko: "?",
      options: ["가", "나", "다"],
      correct: 3,
    });
    expect(item.correct).toBe(2);
  });

  it("정답이 보기 글자로 적혀 있으면 위치를 찾아낸다", () => {
    const item = asChoice({
      type: "choice",
      question_ko: "?",
      options: ["가", "나", "다"],
      answer: "B",
    });
    expect(item.correct).toBe(1);
  });

  it("보기 안의 is_answer 표시를 정답으로 읽는다", () => {
    const item = asChoice({
      type: "choice",
      question_ko: "?",
      options: [
        { zh: "错", is_answer: false },
        { zh: "对", is_answer: true },
      ],
    });
    expect(item.options).toEqual(["错", "对"]);
    expect(item.correct).toBe(1);
  });

  it("보기 앞에 붙은 A. B. 기호를 떼어낸다", () => {
    const item = asChoice({
      type: "choice",
      question_ko: "?",
      options: ["A. 苹果", "B) 香蕉"],
      correct: 1,
    });
    expect(item.options).toEqual(["苹果", "香蕉"]);
  });

  it("질문이 비어 있으면 기본 문구로 채운다", () => {
    const item = asChoice({ type: "choice", options: ["가", "나"], correct: 0 });
    expect(item.question_ko).toBe("다음 중 알맞은 것을 고르세요.");
  });

  it("믿을 수 있는 정답이 없으면 버린다", () => {
    // 틀린 정답을 보여주느니 문항을 빼는 편이 낫다.
    expect(
      normalizeQuizItem({
        type: "choice",
        question_ko: "?",
        options: ["가", "나"],
        answer: "존재하지 않는 보기",
      }),
    ).toBeNull();
  });

  it("보기가 둘 미만이면 버린다", () => {
    expect(normalizeQuizItem({ type: "choice", options: ["하나"], correct: 0 })).toBeNull();
  });
});

describe("normalizeQuizItem — fill", () => {
  it("fill_in_the_blank 같은 변형 타입명을 알아본다", () => {
    const item = asFill({
      type: "fill_in_the_blank",
      question: "알맞은 말을 넣으세요.\n我＿＿学生。",
      answer: "是",
    });
    expect(item.question_ko).toBe("알맞은 말을 넣으세요.");
    expect(item.sentence_zh).toBe("我___学生。");
    expect(item.answer).toBe("是");
  });

  it("여러 빈칸 표기를 한 형태로 통일한다", () => {
    expect(asFill({ type: "fill", sentence_zh: "我（）学生。", answer: "是" }).sentence_zh).toBe(
      "我___学生。",
    );
    expect(asFill({ type: "fill", sentence_zh: "我□□学生。", answer: "是" }).sentence_zh).toBe(
      "我___学生。",
    );
  });

  it("빈칸이 없는 문장에는 빈칸을 붙여준다", () => {
    const item = asFill({
      type: "fill",
      question_ko: "빈칸을 채우세요",
      sentence_zh: "我 学生",
      answer: "是",
    });
    expect(item.sentence_zh).toBe("我 学生 ___");
  });

  it("정답이 없으면 버린다", () => {
    expect(normalizeQuizItem({ type: "fill", question_ko: "빈칸을 채우세요" })).toBeNull();
  });
});

describe("normalizeQuizItem — order", () => {
  it("1-based 순서 배열을 0-based로 되돌린다", () => {
    const item = asOrder({
      type: "order",
      question_ko: "배열하세요",
      words: ["学生", "我", "是"],
      correct_order: [2, 3, 1],
    });
    expect(item.words).toEqual(["学生", "我", "是"]);
    expect(item.correct_order).toEqual([1, 2, 0]);
    expect(item.answer_text).toBe("我是学生");
  });

  it("정답 문장만 있으면 순서를 문장에서 역산한다", () => {
    const item = asOrder({
      type: "order",
      question_ko: "배열",
      words: ["朋友", "我", "的"],
      answer: "我的朋友",
    });
    expect(item.correct_order.map((i) => item.words[i]).join("")).toBe("我的朋友");
    expect(item.answer_text).toBe("我的朋友");
  });

  it("섞인 단어가 없으면 정답에서 타일을 만들어낸다", () => {
    const raw = { type: "order", question_ko: "배열", correct_words_zh: ["我", "喜欢", "中文"] };
    const item = asOrder(raw);
    expect([...item.words].sort()).toEqual(["中文", "喜欢", "我"]);
    expect(item.correct_order.map((i) => item.words[i]).join("")).toBe("我喜欢中文");
  });

  it("타일 순서는 매번 같다 — 다시 열어도 풀던 답이 흐트러지지 않는다", () => {
    const raw = { type: "order", question_ko: "배열", correct_words_zh: ["我", "喜欢", "中文"] };
    expect(asOrder(raw).words).toEqual(asOrder(raw).words);
  });

  it("순서를 정할 근거가 없으면 버린다", () => {
    expect(normalizeQuizItem({ type: "order", words: ["我"] })).toBeNull();
  });
});

describe("normalizeQuizItem — 타입 추론", () => {
  it("type이 없어도 보기 배열이 있으면 객관식으로 본다", () => {
    expect(normalizeQuizItem({ options: ["가", "나"], correct: 0 })?.type).toBe("choice");
  });

  it("type이 없어도 단어 배열이 있으면 배열 문제로 본다", () => {
    expect(normalizeQuizItem({ words: ["学生", "我", "是"], correct_order: [2, 3, 1] })?.type).toBe(
      "order",
    );
  });

  it("type이 없고 정답만 있으면 빈칸 문제로 본다", () => {
    expect(normalizeQuizItem({ question: "我＿＿学生。", answer: "是" })?.type).toBe("fill");
  });

  it("객체가 아니거나 비어 있으면 버린다", () => {
    expect(normalizeQuizItem({})).toBeNull();
    expect(normalizeQuizItem(null)).toBeNull();
    expect(normalizeQuizItem("문자열")).toBeNull();
    expect(normalizeQuizItem([1, 2, 3])).toBeNull();
  });
});

describe("normalizeQuiz", () => {
  it("배열이 아니면 빈 배열이다", () => {
    expect(normalizeQuiz(null)).toEqual([]);
    expect(normalizeQuiz({ quiz: [] })).toEqual([]);
  });

  it("렌더할 수 없는 항목만 걸러내고 나머지는 살린다", () => {
    const items = normalizeQuiz([
      { type: "choice", question_ko: "?", options: ["가", "나"], correct: 0 },
      { type: "choice", options: ["하나"] },
      { type: "fill", sentence_zh: "我＿＿学生。", answer: "是" },
    ]);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.type)).toEqual(["choice", "fill"]);
  });
});

describe("normalizeQuizForStorage", () => {
  it("정규화된 항목이 있으면 그것을 저장한다", () => {
    const stored = normalizeQuizForStorage([
      { type: "choice", question_ko: "?", options: ["가", "나"], correct: 0 },
    ]);
    expect(stored).toHaveLength(1);
    expect((stored[0] as QuizChoice).type).toBe("choice");
  });

  it("하나도 살리지 못하면 원본을 그대로 둔다", () => {
    // 읽는 쪽도 정규화하므로, 지금 못 살린 생성물을 나중 개선안이 복구할 수 있다.
    const raw = [{ 알수없는키: "값" }];
    expect(normalizeQuizForStorage(raw)).toBe(raw);
  });

  it("배열이 아니면 빈 배열이다", () => {
    expect(normalizeQuizForStorage("not an array")).toEqual([]);
  });
});
