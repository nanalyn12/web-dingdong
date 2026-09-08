import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import type { AssurePlan, AssureStepKey } from "./assure";

/*
 * ASSURE 교수설계 레이어 — L1 (Red).
 *
 * 기준서: _workspace/01_spec-analyst_criteria.md (L1-1 ~ L1-19, L1-27, L1-28
 * + 소스 가드 L1-20, L1-22, L1-23, L1-29). L1-21 은 tenant-backup.test.ts 의
 * 기존 "허용 컬럼 목록이 실제 drizzle 스키마 컬럼과 정확히 일치한다" 가
 * 그대로 게이트라서 여기서 다시 쓰지 않는다.
 *
 * ── 모듈을 왜 lazy 로 부르는가 ────────────────────────────────────────────
 * 이 파일이 쓰인 시점에 `./assure` 는 존재하지 않는다. 최상단에서 값 import 를
 * 하면 vitest 가 파일을 collect 하다가 죽고, 그러면 기준 40여 개가 «실패» 가
 * 아니라 «실행조차 안 됨» 이 된다. 그 상태로는 각 기준이 정말로 무언가를
 * 주장하고 있는지 Red 단계에서 확인할 수 없고, 특히 아래 소스 가드
 * (L1-20/22/23/29) 는 assure.ts 와 무관한데도 함께 침묵한다.
 *
 * 그래서 모듈 로드를 테스트 안으로 미룬다. 구현이 생긴 뒤 동작은 정적 import
 * 와 동일하고(vitest 가 모듈을 캐시한다), 타입은 `import type` 으로 그대로
 * 검사된다 — `import type` 은 트랜스파일 단계에서 지워지므로 런타임 해석을
 * 유발하지 않는다.
 */
type AssureModule = typeof import("./assure");
const assure = (): Promise<AssureModule> => import("./assure");

/* ── 라벨 원문 (기준서 «계약 표면» 표) ─────────────────────────────────── */

const STEP_TABLE = [
  {
    key: "analyze",
    letter: "A",
    label: "학습자 분석",
    summary: "일반적 특성 · 출발점 능력 · 학습 양식",
  },
  { key: "state", letter: "S", label: "목표 진술", summary: "ABCD — 학습자 · 행동 · 조건 · 준거" },
  {
    key: "select",
    letter: "S",
    label: "방법·매체·자료 선정",
    summary: "교수방법 · 매체 · 자료와 선정 근거",
  },
  {
    key: "utilize",
    letter: "U",
    label: "매체와 자료 활용",
    summary: "5P — 사전검토 · 자료 준비 · 환경 준비 · 학습자 준비 · 학습경험 제공",
  },
  {
    key: "require",
    letter: "R",
    label: "학습자 참여 요구",
    summary: "참여 유도 활동 · 연습과 피드백",
  },
  {
    key: "evaluate",
    letter: "E",
    label: "평가와 수정",
    summary: "학습자 성취 · 매체와 방법 · 수정 계획",
  },
] as const;

const STEP_KEYS = ["analyze", "state", "select", "utilize", "require", "evaluate"] as const;

/** 각 단계 객체가 가져야 하는 키 집합 — 계약 표면 그대로. L1-8 이 이것과 «정확히» 일치를 요구한다. */
const STEP_FIELDS: Record<AssureStepKey, readonly string[]> = {
  analyze: ["general_traits", "entry_competencies", "learning_styles"],
  state: ["objectives"],
  select: ["methods", "media", "materials", "rationale"],
  utilize: [
    "preview",
    "prepare_materials",
    "prepare_environment",
    "prepare_learners",
    "provide_experience",
  ],
  require: ["participation_activities", "practice", "feedback"],
  evaluate: ["learner_assessment", "media_method_evaluation", "revision_plan"],
};

/* ── 픽스처 ───────────────────────────────────────────────────────────── */

/** 6단계가 모두 채워진 계획. L1-14 의 기준점이자 L1-11 멱등 픽스처. */
function fullPlan(): AssurePlan {
  return {
    analyze: {
      general_traits: ["중학교 2학년 30명", "K-POP 관심 높음"],
      entry_competencies: ["HSK 1급 어휘 150개 학습 완료"],
      learning_styles: ["시각형", "운동감각형"],
    },
    state: {
      objectives: [
        {
          audience: "학습자는",
          behavior: "물건 값을 묻고 답할 수 있다",
          condition: "상점 역할극 상황에서",
          degree: "3회 중 2회 이상 정확하게",
        },
      ],
    },
    select: {
      methods: ["역할극", "짝 활동"],
      media: ["PPT", "실물 가격표 카드"],
      materials: ["가격 흥정 워크시트"],
      rationale: "실물 조작이 시각형·운동감각형 학습자의 어휘 정착을 돕는다",
    },
    utilize: {
      preview: "영상 자료를 수업 전 끝까지 확인한다",
      prepare_materials: "카드 30장을 인쇄해 6조로 나눈다",
      prepare_environment: "책상을 5인 1조로 마주 보게 배치한다",
      prepare_learners: "학습 목표와 평가 기준을 먼저 안내한다",
      provide_experience: "교사 시범 뒤 조별 역할극을 진행한다",
    },
    require: {
      participation_activities: ["짝 활동 가격 흥정", "조별 발표"],
      practice: "조별로 3회 반복 발화",
      feedback: "교사가 순회하며 즉시 교정",
    },
    evaluate: {
      learner_assessment: "역할극 체크리스트로 성취 확인",
      media_method_evaluation: "카드 활용도를 관찰 기록",
      revision_plan: "발음 오류가 잦으면 다음 차시에 청취 활동을 넣는다",
    },
  };
}

/** analyze / select / evaluate 세 단계만 채운 계획. L1-15. */
function threeStepPlan(): AssurePlan {
  const full = fullPlan();
  return {
    analyze: full.analyze,
    state: { objectives: [] },
    select: full.select,
    utilize: {
      preview: "",
      prepare_materials: "",
      prepare_environment: "",
      prepare_learners: "",
      provide_experience: "",
    },
    require: { participation_activities: [], practice: "", feedback: "" },
    evaluate: full.evaluate,
  };
}

/** `Object.values` 재귀 순회 — L1-5 가 «undefined 0개» 를 세는 방법. */
function deepValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(deepValues);
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(deepValues);
  }
  return [value];
}

/* ══ 메타데이터 상수 ═══════════════════════════════════════════════════ */

describe("ASSURE 단계 메타데이터", () => {
  it("L1-1 ASSURE_STEP_KEYS 는 6개이고 순서가 analyze→state→select→utilize→require→evaluate 이다", async () => {
    const { ASSURE_STEP_KEYS } = await assure();
    expect([...ASSURE_STEP_KEYS]).toEqual([...STEP_KEYS]);
  });

  it("L1-1 ASSURE_STEPS 의 key 순서가 ASSURE_STEP_KEYS 와 정확히 일치한다", async () => {
    const { ASSURE_STEPS } = await assure();
    expect(ASSURE_STEPS.map((s) => s.key)).toEqual([...STEP_KEYS]);
  });

  it("L1-2 단계 문자를 이어 붙이면 ASSURE 가 된다", async () => {
    const { ASSURE_STEPS } = await assure();
    expect(ASSURE_STEPS.map((s) => s.letter).join("")).toBe("ASSURE");
  });

  it.each(STEP_TABLE)("L1-3 $key 의 라벨과 요약이 기준서 원문과 문자 단위로 같다", async (row) => {
    const { ASSURE_STEPS } = await assure();
    const step = ASSURE_STEPS.find((s) => s.key === row.key);
    expect(step).toBeDefined();
    expect(step?.label).toBe(row.label);
    expect(step?.summary).toBe(row.summary);
    expect(step?.letter).toBe(row.letter);
  });

  it("L1-3 어느 단계도 빈 문자열 필드를 갖지 않는다", async () => {
    const { ASSURE_STEPS } = await assure();
    const blanks = ASSURE_STEPS.filter(
      (s) => !s.letter.trim() || !s.label.trim() || !s.summary.trim(),
    ).map((s) => s.key);
    expect(blanks).toEqual([]);
  });

  it("L1-3 라벨 6개는 서로 다르다 — state 와 select 가 둘 다 S 라서 문자로는 구분되지 않는다", async () => {
    const { ASSURE_STEPS } = await assure();
    expect(new Set(ASSURE_STEPS.map((s) => s.label)).size).toBe(6);
  });
});

/* ══ 정규화 — 경계 케이스 ═════════════════════════════════════════════ */

describe("normalizeAssure — 값이 아닌 입력 (L1-4)", () => {
  // 기존 행의 assure 컬럼은 NULL 이다. 여기서 throw 하면 상세 화면·PDF·인쇄·
  // 백업 네 경로가 한꺼번에 죽는다.
  const NOT_A_PLAN: [string, unknown][] = [
    ["null", null],
    ["undefined", undefined],
    ["빈 문자열", ""],
    ["숫자 0", 0],
    ["false", false],
    ["빈 배열", []],
    ["문자열", "문자열"],
    ["NaN", Number.NaN],
  ];

  it.each(NOT_A_PLAN)("L1-4 %s 입력은 null 을 반환한다", async (_name, input) => {
    const { normalizeAssure } = await assure();
    expect(normalizeAssure(input)).toBeNull();
  });

  it.each(NOT_A_PLAN)("L1-4 %s 입력에서 throw 하지 않는다", async (_name, input) => {
    const { normalizeAssure } = await assure();
    expect(() => normalizeAssure(input)).not.toThrow();
  });
});

describe("normalizeAssure — 빈 객체 (L1-5)", () => {
  it("L1-5 빈 객체는 null 이 아니라 6단계 키를 모두 가진 객체가 된다", async () => {
    const { normalizeAssure } = await assure();
    const plan = normalizeAssure({});
    expect(plan).not.toBeNull();
    expect(Object.keys(plan ?? {})).toEqual([...STEP_KEYS]);
  });

  it("L1-5 빈 객체 정규화 결과에 undefined 가 하나도 없다", async () => {
    const { normalizeAssure } = await assure();
    const values = deepValues(normalizeAssure({}));
    expect(values.filter((v) => v === undefined)).toEqual([]);
  });

  it("L1-5 빈 객체 정규화 결과는 계약 표면의 빈 형태와 deep-equal 이다", async () => {
    const { normalizeAssure } = await assure();
    expect(normalizeAssure({})).toEqual({
      analyze: { general_traits: [], entry_competencies: [], learning_styles: [] },
      state: { objectives: [] },
      select: { methods: [], media: [], materials: [], rationale: "" },
      utilize: {
        preview: "",
        prepare_materials: "",
        prepare_environment: "",
        prepare_learners: "",
        provide_experience: "",
      },
      require: { participation_activities: [], practice: "", feedback: "" },
      evaluate: { learner_assessment: "", media_method_evaluation: "", revision_plan: "" },
    });
  });
});

describe("normalizeAssure — 누락 키 (L1-6)", () => {
  const PARTIAL = { analyze: { general_traits: ["중학생", "K-POP 관심"] } };

  it("L1-6 주어진 필드는 그대로 보존된다", async () => {
    const { normalizeAssure } = await assure();
    expect(normalizeAssure(PARTIAL)?.analyze.general_traits).toEqual(["중학생", "K-POP 관심"]);
  });

  it("L1-6 같은 단계의 빠진 배열 필드는 빈 배열로 채워진다", async () => {
    const { normalizeAssure } = await assure();
    const analyze = normalizeAssure(PARTIAL)?.analyze;
    expect(analyze?.entry_competencies).toEqual([]);
    expect(analyze?.learning_styles).toEqual([]);
  });

  it("L1-6 나머지 5단계는 빈 객체를 정규화한 것과 동일한 형태가 된다", async () => {
    const { normalizeAssure } = await assure();
    const empty = normalizeAssure({});
    const partial = normalizeAssure(PARTIAL);
    for (const key of STEP_KEYS.filter((k) => k !== "analyze")) {
      expect(partial?.[key], `${key} 단계가 빈 형태가 아님`).toEqual(empty?.[key]);
    }
  });
});

describe("normalizeAssure — 오타입 데이터 (L1-7)", () => {
  it("L1-7 배열 자리에 온 비어 있지 않은 문자열은 길이 1 배열로 승격된다", async () => {
    const { normalizeAssure } = await assure();
    expect(normalizeAssure({ select: { media: "PPT" } })?.select.media).toEqual(["PPT"]);
  });

  it("L1-7 배열 자리에 온 공백뿐인 문자열은 빈 배열이 된다", async () => {
    const { normalizeAssure } = await assure();
    expect(normalizeAssure({ select: { media: "   " } })?.select.media).toEqual([]);
  });

  it("L1-7 배열 자리에 온 숫자·객체는 빈 배열이 된다", async () => {
    const { normalizeAssure } = await assure();
    expect(normalizeAssure({ select: { media: 42 } })?.select.media).toEqual([]);
    expect(normalizeAssure({ select: { media: { a: 1 } } })?.select.media).toEqual([]);
  });

  it.each([
    ["숫자", 7],
    ["객체", { a: 1 }],
    ["배열", ["근거"]],
    ["null", null],
  ])("L1-7 문자열 자리에 온 %s 는 빈 문자열이 된다", async (_name, value) => {
    const { normalizeAssure } = await assure();
    expect(normalizeAssure({ select: { rationale: value } })?.select.rationale).toBe("");
  });

  it("L1-7 배열 원소 중 비문자열·공백 문자열은 제거되고 남은 값은 trim 된다", async () => {
    const { normalizeAssure } = await assure();
    const raw = { select: { materials: ["  카드  ", 3, null, "", "영상"] } };
    expect(normalizeAssure(raw)?.select.materials).toEqual(["카드", "영상"]);
  });

  it("L1-7 오타입 데이터에서 throw 하지 않는다", async () => {
    const { normalizeAssure } = await assure();
    const junk = {
      analyze: 1,
      state: "x",
      select: [],
      utilize: null,
      require: { practice: [1, 2] },
      evaluate: { revision_plan: { nested: true } },
    };
    expect(() => normalizeAssure(junk)).not.toThrow();
  });
});

describe("normalizeAssure — 모르는 키 제거 (L1-8)", () => {
  const RAW = { analyze: { general_traits: [], hacked: "x" }, extra: 1 };

  it("L1-8 최상위의 모르는 키는 반환값에 남지 않는다", async () => {
    const { normalizeAssure } = await assure();
    expect(Object.keys(normalizeAssure(RAW) ?? {})).not.toContain("extra");
  });

  it("L1-8 단계 객체 안의 모르는 키는 반환값에 남지 않는다", async () => {
    const { normalizeAssure } = await assure();
    expect(Object.keys(normalizeAssure(RAW)?.analyze ?? {})).not.toContain("hacked");
  });

  it.each(STEP_KEYS)("L1-8 %s 단계의 키 집합이 계약 표면과 정확히 일치한다", async (key) => {
    const { normalizeAssure } = await assure();
    const plan = normalizeAssure(RAW);
    const actual = Object.keys((plan?.[key] ?? {}) as Record<string, unknown>).sort();
    expect(actual).toEqual([...STEP_FIELDS[key]].sort());
  });
});

describe("normalizeAssure — ABCD 목표 (L1-9)", () => {
  it("L1-9 목표 원소는 audience/behavior/condition/degree 4개 키만 갖는다", async () => {
    const { normalizeAssure } = await assure();
    const raw = {
      state: { objectives: [{ audience: "학습자는", behavior: "말한다", bogus: "x" }] },
    };
    const objective = normalizeAssure(raw)?.state.objectives[0];
    expect(Object.keys(objective ?? {}).sort()).toEqual([
      "audience",
      "behavior",
      "condition",
      "degree",
    ]);
  });

  it("L1-9 네 필드가 모두 빈 목표 원소는 배열에서 제거된다", async () => {
    const { normalizeAssure } = await assure();
    const raw = {
      state: {
        objectives: [
          { audience: "", behavior: "", condition: "", degree: "" },
          { audience: "학습자는", behavior: "가격을 묻는다", condition: "", degree: "" },
          {},
          null,
        ],
      },
    };
    expect(normalizeAssure(raw)?.state.objectives).toHaveLength(1);
  });

  it("L1-9 배열이 아닌 objectives 입력은 빈 배열이 된다", async () => {
    const { normalizeAssure } = await assure();
    expect(normalizeAssure({ state: { objectives: "목표" } })?.state.objectives).toEqual([]);
    expect(normalizeAssure({ state: { objectives: { a: 1 } } })?.state.objectives).toEqual([]);
  });
});

describe("normalizeAssure — 5P 순서 (L1-10)", () => {
  it("L1-10 utilize 의 키가 5P 순서 그대로 5개다", async () => {
    const { normalizeAssure } = await assure();
    expect(Object.keys(normalizeAssure({})?.utilize ?? {})).toEqual([
      "preview",
      "prepare_materials",
      "prepare_environment",
      "prepare_learners",
      "provide_experience",
    ]);
  });
});

describe("normalizeAssure — 멱등 (L1-11)", () => {
  // DB 왕복: 정규화된 값이 jsonb 로 저장됐다가 다시 읽혀 또 정규화된다.
  // 두 번째 통과에서 값이 흔들리면 백업·복원 왕복에서 조용히 달라진다.
  const FIXTURES: [string, unknown][] = [
    ["빈 객체", {}],
    ["완전한 계획", fullPlan()],
    ["3단계만 채운 계획", threeStepPlan()],
    ["누락 키", { analyze: { general_traits: ["중학생"] } }],
    ["오타입 섞임", { select: { media: "PPT", materials: ["  카드  ", 3, ""], rationale: 9 } }],
    ["모르는 키", { analyze: { hacked: "x" }, extra: 1 }],
    ["빈 목표 포함", { state: { objectives: [{}, { audience: "학습자는" }] } }],
  ];

  it.each(FIXTURES)("L1-11 %s 은 두 번 정규화해도 같은 값이다", async (_name, raw) => {
    const { normalizeAssure } = await assure();
    const once = normalizeAssure(raw);
    expect(normalizeAssure(once)).toEqual(once);
  });
});

/* ══ 충족 여부 / 완성도 ════════════════════════════════════════════════ */

describe("assureStepStatus / assureCompletion (L1-12 ~ L1-15)", () => {
  it("L1-12 null 계획에서 assureStepStatus 가 throw 하지 않는다", async () => {
    const { assureStepStatus } = await assure();
    expect(() => assureStepStatus(null)).not.toThrow();
  });

  it("L1-12 null 계획의 상태는 6단계 모두 filled === false 다", async () => {
    const { assureStepStatus } = await assure();
    const status = assureStepStatus(null);
    expect(STEP_KEYS.map((k) => status[k].filled)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("L1-12 null 계획의 완성도는 0 이다", async () => {
    const { assureCompletion } = await assure();
    expect(assureCompletion(null)).toBe(0);
  });

  it("L1-13 빈 계획은 6단계 모두 filled === false 다", async () => {
    const { normalizeAssure, assureStepStatus } = await assure();
    const status = assureStepStatus(normalizeAssure({}));
    expect(STEP_KEYS.filter((k) => status[k].filled)).toEqual([]);
  });

  it.each(STEP_KEYS)(
    "L1-13 빈 계획의 %s 단계는 무엇이 비었는지 missing 으로 지목한다",
    async (key) => {
      const { normalizeAssure, assureStepStatus } = await assure();
      const status = assureStepStatus(normalizeAssure({}));
      expect(status[key].missing.length).toBeGreaterThan(0);
    },
  );

  it("L1-13 빈 계획의 완성도는 0 이다", async () => {
    const { normalizeAssure, assureCompletion } = await assure();
    expect(assureCompletion(normalizeAssure({}))).toBe(0);
  });

  it("L1-14 6단계를 모두 채운 계획은 6단계 모두 filled === true 다", async () => {
    const { normalizeAssure, assureStepStatus } = await assure();
    const status = assureStepStatus(normalizeAssure(fullPlan()));
    expect(STEP_KEYS.filter((k) => !status[k].filled)).toEqual([]);
  });

  it("L1-14 6단계를 모두 채운 계획은 어느 단계에도 missing 이 없다", async () => {
    const { normalizeAssure, assureStepStatus } = await assure();
    const status = assureStepStatus(normalizeAssure(fullPlan()));
    const leftovers = STEP_KEYS.filter((k) => status[k].missing.length > 0);
    expect(leftovers).toEqual([]);
  });

  it("L1-14 6단계를 모두 채운 계획의 완성도는 6 이다", async () => {
    const { normalizeAssure, assureCompletion } = await assure();
    expect(assureCompletion(normalizeAssure(fullPlan()))).toBe(6);
  });

  it("L1-15 3단계만 채운 계획의 완성도는 3 이다", async () => {
    const { normalizeAssure, assureCompletion } = await assure();
    expect(assureCompletion(normalizeAssure(threeStepPlan()))).toBe(3);
  });

  it("L1-15 3단계만 채운 계획에서 filled 인 단계는 analyze·select·evaluate 뿐이다", async () => {
    const { normalizeAssure, assureStepStatus } = await assure();
    const status = assureStepStatus(normalizeAssure(threeStepPlan()));
    expect(STEP_KEYS.filter((k) => status[k].filled)).toEqual(["analyze", "select", "evaluate"]);
  });

  it.each([
    ["null", null],
    ["빈 계획", {}],
    ["3단계", threeStepPlan()],
    ["완전한 계획", fullPlan()],
  ])("L1-15 %s 의 완성도는 0 이상 6 이하의 정수다", async (_name, raw) => {
    const { normalizeAssure, assureCompletion } = await assure();
    const n = assureCompletion(raw === null ? null : normalizeAssure(raw));
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThanOrEqual(6);
  });
});

/* ══ 프롬프트 빌더 ═════════════════════════════════════════════════════ */

const PROMPT_INPUT = {
  priorKnowledge: "HSK 1급 어휘 150개",
  learningStyle: "시각형, 운동감각형",
  studentGrade: "중학교 2학년",
};

const ABCD_KEYWORDS = [
  "Audience",
  "학습자",
  "Behavior",
  "행동",
  "Condition",
  "조건",
  "Degree",
  "준거",
];

const FIVE_P_KEYWORDS = ["사전검토", "자료 준비", "환경 준비", "학습자 준비", "학습경험 제공"];

/** 빈 입력에서 템플릿이 흘리는 세 가지 흔적. 화면·AI 양쪽에 그대로 새어 나간다. */
const LEAKS = ["undefined", "null", "[object Object]"];

describe("buildAssurePromptSection (L1-16 ~ L1-19)", () => {
  it.each(STEP_TABLE.map((s) => s.label))(
    "L1-16 프롬프트가 라벨 «%s» 를 포함한다",
    async (label) => {
      const { buildAssurePromptSection } = await assure();
      expect(buildAssurePromptSection(PROMPT_INPUT)).toContain(label);
    },
  );

  it.each(ABCD_KEYWORDS)("L1-17 프롬프트가 ABCD 키워드 «%s» 를 포함한다", async (keyword) => {
    const { buildAssurePromptSection } = await assure();
    expect(buildAssurePromptSection(PROMPT_INPUT)).toContain(keyword);
  });

  it.each(FIVE_P_KEYWORDS)("L1-17 프롬프트가 5P 키워드 «%s» 를 포함한다", async (keyword) => {
    const { buildAssurePromptSection } = await assure();
    expect(buildAssurePromptSection(PROMPT_INPUT)).toContain(keyword);
  });

  it.each(STEP_KEYS)(
    "L1-18 프롬프트가 JSON 키 «%s» 를 포함한다 — 생성 키와 정규화 키가 갈라지지 않게",
    async (key) => {
      const { buildAssurePromptSection } = await assure();
      expect(buildAssurePromptSection(PROMPT_INPUT)).toContain(key);
    },
  );

  it.each(LEAKS)("L1-19 입력이 빈 문자열이어도 프롬프트에 «%s» 가 새지 않는다", async (leak) => {
    const { buildAssurePromptSection } = await assure();
    const text = buildAssurePromptSection({
      priorKnowledge: "",
      learningStyle: "",
      studentGrade: "",
    });
    expect(text).not.toContain(leak);
  });

  it("L1-19 입력이 주어지면 그 원문이 프롬프트에 들어간다", async () => {
    const { buildAssurePromptSection } = await assure();
    const text = buildAssurePromptSection(PROMPT_INPUT);
    expect(text).toContain(PROMPT_INPUT.priorKnowledge);
    expect(text).toContain(PROMPT_INPUT.learningStyle);
    expect(text).toContain(PROMPT_INPUT.studentGrade);
  });
});

/* ══ 리더 결정 3·4 — 프리셋과 보강 프롬프트 ═══════════════════════════ */

describe("LEARNING_STYLE_PRESETS (L1-27)", () => {
  it("L1-27 프리셋은 4개이며 순서까지 기준서와 일치한다", async () => {
    const { LEARNING_STYLE_PRESETS } = await assure();
    expect([...LEARNING_STYLE_PRESETS]).toEqual(["시각형", "청각형", "운동감각형", "읽기·쓰기형"]);
  });

  it("L1-27 프리셋에 중복이 없다", async () => {
    const { LEARNING_STYLE_PRESETS } = await assure();
    expect(new Set(LEARNING_STYLE_PRESETS).size).toBe(LEARNING_STYLE_PRESETS.length);
  });
});

const BACKFILL_INPUT = {
  title: "시장에서 물건 값 묻기",
  studentGrade: "중학교 2학년",
  durationMinutes: 45,
  objectives: ["가격을 묻는 표현을 말할 수 있다", "숫자 100까지 듣고 쓸 수 있다"],
  materials: ["가격표 카드"],
  timeBlocks: [{ start_min: 0, end_min: 10, title: "도입" }],
  activities: [{ name: "역할극" }],
  assessment: { type: "체크리스트" },
  priorKnowledge: "HSK 1급 어휘 150개",
  learningStyle: "시각형",
};

const EMPTY_BACKFILL_INPUT = {
  title: "",
  studentGrade: "",
  durationMinutes: 0,
  objectives: [],
  materials: [],
  timeBlocks: [],
  activities: [],
  assessment: null,
  priorKnowledge: "",
  learningStyle: "",
};

describe("buildAssureBackfillPrompt (L1-28)", () => {
  it.each(STEP_TABLE.map((s) => s.label))(
    "L1-28 보강 프롬프트가 라벨 «%s» 를 포함한다",
    async (label) => {
      const { buildAssureBackfillPrompt } = await assure();
      expect(buildAssureBackfillPrompt(BACKFILL_INPUT)).toContain(label);
    },
  );

  it.each(STEP_KEYS)("L1-28 보강 프롬프트가 JSON 키 «%s» 를 포함한다", async (key) => {
    const { buildAssureBackfillPrompt } = await assure();
    expect(buildAssureBackfillPrompt(BACKFILL_INPUT)).toContain(key);
  });

  it("L1-28 보강 프롬프트가 넘긴 제목과 목표 원문을 담는다", async () => {
    const { buildAssureBackfillPrompt } = await assure();
    const text = buildAssureBackfillPrompt(BACKFILL_INPUT);
    expect(text).toContain(BACKFILL_INPUT.title);
    for (const objective of BACKFILL_INPUT.objectives) expect(text).toContain(objective);
  });

  it.each(LEAKS)("L1-28 빈 입력에서도 보강 프롬프트에 «%s» 가 새지 않는다", async (leak) => {
    const { buildAssureBackfillPrompt } = await assure();
    expect(buildAssureBackfillPrompt(EMPTY_BACKFILL_INPUT)).not.toContain(leak);
  });

  it("L1-28 빈 입력에서 throw 하지 않는다", async () => {
    const { buildAssureBackfillPrompt } = await assure();
    expect(() => buildAssureBackfillPrompt(EMPTY_BACKFILL_INPUT)).not.toThrow();
  });
});

/* ══ 소스 가드 ═════════════════════════════════════════════════════════
 *
 * `.tsx` 는 vitest 환경(node, include `src/**\/*.test.ts`)에서 렌더할 수 없고
 * 마이그레이션은 실행할 수 없다. 저장소 선례(roles-usage.test.ts,
 * surface-tokens.test.ts)대로 소스 텍스트로 판정한다. 경로 해석도 그 파일들과
 * 같은 방식 — import.meta.url 기준 상대 URL.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const REPO = fileURLToPath(new URL("../..", import.meta.url));

/** 주석 안의 예시가 가드를 물지 않도록 코드만 남긴다. 줄 번호는 보존. */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

/** `import … from "x"`, `import "x"`, `import("x")` 의 x 를 모두 모은다. */
function importSpecifiers(source: string): string[] {
  const code = codeOnly(source);
  const out: string[] = [];
  for (const m of code.matchAll(/\bfrom\s*["']([^"']+)["']/g)) out.push(m[1]);
  for (const m of code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g)) out.push(m[1]);
  for (const m of code.matchAll(/\bimport\s+["']([^"']+)["']/g)) out.push(m[1]);
  for (const m of code.matchAll(/\brequire\s*\(\s*["']([^"']+)["']/g)) out.push(m[1]);
  return out;
}

/**
 * 순수 모듈이 끌어오면 안 되는 것들. `ai` 는 정확히 그 이름이거나 `ai/…` 일
 * 때만 잡는다 — `@/lib/ai-quota` 같은 순수 모듈까지 잡으면 가드가 옳은 코드를
 * 실패시키고, 그러면 가드가 지워진다.
 */
function serverOnlyImports(source: string): string[] {
  return importSpecifiers(source).filter(
    (spec) =>
      spec === "ai" ||
      spec.startsWith("ai/") ||
      spec === "@/db" ||
      spec.startsWith("@/db/") ||
      spec === "drizzle-orm" ||
      spec.startsWith("drizzle-orm/") ||
      /\.server(\.[jt]sx?)?$/.test(spec) ||
      spec.includes(".server/"),
  );
}

const ASSURE_PATH = join(SRC, "lib", "assure.ts");

describe("L1-20 assure.ts 는 순수 모듈이다", () => {
  it("L1-20 src/lib/assure.ts 가 존재한다", () => {
    expect(existsSync(ASSURE_PATH), "src/lib/assure.ts 없음").toBe(true);
  });

  it("L1-20 서버 전용 모듈을 import 하지 않는다 (@/db, drizzle-orm, ai, *.server)", () => {
    expect(existsSync(ASSURE_PATH), "src/lib/assure.ts 없음").toBe(true);
    expect(serverOnlyImports(readFileSync(ASSURE_PATH, "utf8"))).toEqual([]);
  });

  it("L1-20 createServerFn 을 쓰지 않는다", () => {
    expect(existsSync(ASSURE_PATH), "src/lib/assure.ts 없음").toBe(true);
    const code = codeOnly(readFileSync(ASSURE_PATH, "utf8"));
    expect(code).not.toMatch(/\bcreateServerFn\b/);
  });
});

describe("L1-20 가드 자체의 검출력", () => {
  // 정규식 가드는 아무것도 매치하지 않으면 영원히 통과한다. 위반을 주입해
  // 아직 물리는지 확인한다. 이 두 그룹은 assure.ts 와 무관하므로 Red 단계에서도
  // 통과하는 것이 정상이다 — 가드가 살아 있다는 유일한 증거다.
  it.each([
    `import { db } from "@/db";`,
    `import { eq } from "drizzle-orm";`,
    `import { generateText } from "ai";`,
    `import { getEnv } from "./env.server";`,
    `import { callGemini } from "@/lib/ai-gateway.server";`,
  ])("주입한 서버 import 를 잡는다: %s", (line) => {
    expect(serverOnlyImports(line)).toHaveLength(1);
  });

  it.each([
    `import { aiQuotaFor } from "./ai-quota";`,
    `import { z } from "zod";`,
    `import type { AssurePlan } from "./assure";`,
    `// import { db } from "@/db";`,
  ])("순수 import 는 잡지 않는다: %s", (line) => {
    expect(serverOnlyImports(line)).toEqual([]);
  });
});

describe("L1-22 마이그레이션 0020", () => {
  const migrationFile = (): string | undefined => {
    const dir = join(REPO, "drizzle");
    if (!existsSync(dir)) return undefined;
    return readdirSync(dir).find((name) => name.startsWith("0020_") && name.endsWith(".sql"));
  };

  it("L1-22 drizzle/ 아래에 0020_ 로 시작하는 .sql 이 있다", () => {
    expect(migrationFile(), "drizzle/0020_*.sql 없음").toBeDefined();
  });

  it("L1-22 0020 마이그레이션이 curriculum_plans 의 assure jsonb 컬럼을 추가한다", () => {
    const name = migrationFile();
    expect(name, "drizzle/0020_*.sql 없음").toBeDefined();
    const sql = readFileSync(join(REPO, "drizzle", name as string), "utf8");
    expect(sql).toContain("curriculum_plans");
    expect(sql).toContain("assure");
    expect(sql.toLowerCase()).toContain("jsonb");
  });

  it("L1-22 (리더 결정 2) 0020 마이그레이션이 prior_knowledge·learning_style 컬럼도 추가한다", () => {
    const name = migrationFile();
    expect(name, "drizzle/0020_*.sql 없음").toBeDefined();
    const sql = readFileSync(join(REPO, "drizzle", name as string), "utf8");
    expect(sql).toContain("prior_knowledge");
    expect(sql).toContain("learning_style");
  });

  it("L1-22 _journal.json 의 마지막 엔트리 idx 가 20 이다", () => {
    const journal = JSON.parse(
      readFileSync(join(REPO, "drizzle", "meta", "_journal.json"), "utf8"),
    ) as { entries: { idx: number }[] };
    expect(journal.entries.at(-1)?.idx).toBe(20);
  });
});

/**
 * 정규화 규칙이 화면마다 다시 쓰이면 규칙이 셋이 되고, 셋은 언젠가 갈라진다.
 * raw jsonb 를 화면이 직접 해석하지 않게, 두 표면이 normalizeAssure 를 통과하도록 고정한다.
 */
const NORMALIZE_CONSUMERS = [
  {
    file: "src/routes/_app.curriculum.$id.tsx",
    why: "상세 화면이 raw jsonb 를 직접 해석하면 null 행에서 .map 크래시",
  },
  {
    file: "src/components/curriculum-pdf-button.tsx",
    why: "buildHtml 이 throw 하면 PDF·인쇄 두 버튼이 함께 죽는다",
  },
] as const;

function importsFromAssure(source: string, named: string): boolean {
  const code = codeOnly(source);
  const pattern = new RegExp(
    String.raw`import\s+(?:type\s+)?\{[^}]*\b${named}\b[^}]*\}\s*from\s*["'][^"']*\bassure["']`,
  );
  return pattern.test(code);
}

describe("L1-23 정규화 규칙의 단일 출처", () => {
  it.each(NORMALIZE_CONSUMERS)(
    "L1-23 $file 이 normalizeAssure 를 import 한다 ($why)",
    ({ file }) => {
      const path = join(REPO, ...file.split("/"));
      expect(existsSync(path), `${file} 없음`).toBe(true);
      expect(importsFromAssure(readFileSync(path, "utf8"), "normalizeAssure")).toBe(true);
    },
  );
});

describe("L1-29 학습 양식 프리셋의 단일 출처", () => {
  it("L1-29 _app.curriculum.index.tsx 가 LEARNING_STYLE_PRESETS 를 import 한다", () => {
    const path = join(REPO, "src", "routes", "_app.curriculum.index.tsx");
    expect(existsSync(path), "_app.curriculum.index.tsx 없음").toBe(true);
    expect(importsFromAssure(readFileSync(path, "utf8"), "LEARNING_STYLE_PRESETS")).toBe(true);
  });
});

describe("L1-23·L1-29 가드 자체의 검출력", () => {
  // 위와 같은 이유로 Red 단계에서도 통과하는 것이 정상이다.
  it.each([
    [`import { normalizeAssure } from "@/lib/assure";`, "normalizeAssure"],
    [`import { normalizeAssure, ASSURE_STEPS } from "./assure";`, "normalizeAssure"],
    [`import { LEARNING_STYLE_PRESETS } from "@/lib/assure";`, "LEARNING_STYLE_PRESETS"],
  ])("주입한 import 를 인정한다: %s", (line, named) => {
    expect(importsFromAssure(line, named)).toBe(true);
  });

  it.each([
    [`import { normalizeQuiz } from "@/lib/quiz-normalize";`, "normalizeAssure"],
    [`const normalizeAssure = (x) => x;`, "normalizeAssure"],
    [`// import { normalizeAssure } from "@/lib/assure";`, "normalizeAssure"],
    [`import { ASSURE_STEPS } from "@/lib/assure";`, "LEARNING_STYLE_PRESETS"],
  ])("import 이 아닌 것은 인정하지 않는다: %s", (line, named) => {
    expect(importsFromAssure(line, named)).toBe(false);
  });
});
