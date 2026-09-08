/**
 * ASSURE 교수설계 모형 — 커리큘럼 산출물 위에 얹는 6단계 레이어.
 *
 * 이 모듈은 순수하다. 상세 화면·PDF·인쇄·백업 네 경로가 모두 여기를 거치기
 * 때문에 `@/db` · `drizzle-orm` · `ai` · `*.server` 를 하나라도 끌어오면 라우트가
 * import 하는 순간 서버 경계가 클라이언트 번들로 샌다. 정규화 규칙을 화면마다
 * 다시 쓰지 않게 하는 것이 이 파일의 두 번째 목적이다 — 규칙이 셋이 되면
 * 언젠가 갈라진다.
 */

export const ASSURE_STEP_KEYS = [
  "analyze",
  "state",
  "select",
  "utilize",
  "require",
  "evaluate",
] as const;

export type AssureStepKey = (typeof ASSURE_STEP_KEYS)[number];

export type AssureStepMeta = {
  key: AssureStepKey;
  letter: string;
  label: string;
  summary: string;
};

/** 화면·PDF·프롬프트·테스트가 공유하는 단일 출처. 라벨은 기준서 원문 그대로다. */
export const ASSURE_STEPS: readonly AssureStepMeta[] = [
  {
    key: "analyze",
    letter: "A",
    label: "학습자 분석",
    summary: "일반적 특성 · 출발점 능력 · 학습 양식",
  },
  {
    key: "state",
    letter: "S",
    label: "목표 진술",
    summary: "ABCD — 학습자 · 행동 · 조건 · 준거",
  },
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
];

/** 리더 결정 3 — 폼의 «학습 양식» 칩. 라우트에 다시 적으면 상수와 화면이 갈라진다. */
export const LEARNING_STYLE_PRESETS = ["시각형", "청각형", "운동감각형", "읽기·쓰기형"] as const;

export type AssureObjective = {
  audience: string;
  behavior: string;
  condition: string;
  degree: string;
};

export type AssurePlan = {
  analyze: { general_traits: string[]; entry_competencies: string[]; learning_styles: string[] };
  state: { objectives: AssureObjective[] };
  select: { methods: string[]; media: string[]; materials: string[]; rationale: string };
  utilize: {
    preview: string;
    prepare_materials: string;
    prepare_environment: string;
    prepare_learners: string;
    provide_experience: string;
  };
  require: { participation_activities: string[]; practice: string; feedback: string };
  evaluate: { learner_assessment: string; media_method_evaluation: string; revision_plan: string };
};

/* ── 정규화 ──────────────────────────────────────────────────────────── */

/** 배열은 «단계 객체» 가 아니다 — `typeof [] === "object"` 에 걸려 통과하면 안 된다. */
function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * AI 응답에서 배열 자리에 문자열 하나가 오는 일이 잦다. 버리는 대신 길이 1
 * 배열로 올린다 — 내용이 있는데 화면에서 사라지는 편이 더 나쁘다.
 */
function strList(value: unknown): string[] {
  if (typeof value === "string") {
    const one = value.trim();
    return one ? [one] : [];
  }
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const text = item.trim();
    if (text) out.push(text);
  }
  return out;
}

function objectiveList(value: unknown): AssureObjective[] {
  if (!Array.isArray(value)) return [];
  return (
    value
      .map((raw) => {
        const o = asRecord(raw);
        return {
          audience: str(o.audience),
          behavior: str(o.behavior),
          condition: str(o.condition),
          degree: str(o.degree),
        };
      })
      // 네 칸이 모두 빈 목표는 화면에서 빈 카드가 된다.
      .filter((o) => o.audience || o.behavior || o.condition || o.degree)
  );
}

/**
 * jsonb 에 무엇이 들어 있든 계약 표면 그대로의 shape 을 돌려준다.
 *
 * 계획으로 볼 수 없는 값(레거시 행의 NULL 포함)은 `null`. 객체이기만 하면
 * 비어 있어도 «빈 계획» 을 만들어 준다 — 그래야 화면이 `?.` 없이 읽는다.
 * 키 순서는 계약이다(최상위 = ASSURE 순서, utilize = 5P 순서).
 */
export function normalizeAssure(raw: unknown): AssurePlan | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const analyze = asRecord(src.analyze);
  const state = asRecord(src.state);
  const select = asRecord(src.select);
  const utilize = asRecord(src.utilize);
  const required = asRecord(src.require);
  const evaluate = asRecord(src.evaluate);

  return {
    analyze: {
      general_traits: strList(analyze.general_traits),
      entry_competencies: strList(analyze.entry_competencies),
      learning_styles: strList(analyze.learning_styles),
    },
    state: {
      objectives: objectiveList(state.objectives),
    },
    select: {
      methods: strList(select.methods),
      media: strList(select.media),
      materials: strList(select.materials),
      rationale: str(select.rationale),
    },
    utilize: {
      preview: str(utilize.preview),
      prepare_materials: str(utilize.prepare_materials),
      prepare_environment: str(utilize.prepare_environment),
      prepare_learners: str(utilize.prepare_learners),
      provide_experience: str(utilize.provide_experience),
    },
    require: {
      participation_activities: strList(required.participation_activities),
      practice: str(required.practice),
      feedback: str(required.feedback),
    },
    evaluate: {
      learner_assessment: str(evaluate.learner_assessment),
      media_method_evaluation: str(evaluate.media_method_evaluation),
      revision_plan: str(evaluate.revision_plan),
    },
  };
}

/* ── 충족 여부 ───────────────────────────────────────────────────────── */

type FieldMeta = { key: string; label: string };

/** `missing` 이 지목하는 대상. 교사가 읽는 문구이므로 필드 키가 아니라 한국어다. */
const STEP_FIELDS: Record<AssureStepKey, readonly FieldMeta[]> = {
  analyze: [
    { key: "general_traits", label: "일반적 특성" },
    { key: "entry_competencies", label: "출발점 능력" },
    { key: "learning_styles", label: "학습 양식" },
  ],
  state: [{ key: "objectives", label: "ABCD 목표" }],
  select: [
    { key: "methods", label: "교수방법" },
    { key: "media", label: "매체" },
    { key: "materials", label: "자료" },
    { key: "rationale", label: "선정 근거" },
  ],
  utilize: [
    { key: "preview", label: "사전검토" },
    { key: "prepare_materials", label: "자료 준비" },
    { key: "prepare_environment", label: "환경 준비" },
    { key: "prepare_learners", label: "학습자 준비" },
    { key: "provide_experience", label: "학습경험 제공" },
  ],
  require: [
    { key: "participation_activities", label: "참여 유도 활동" },
    { key: "practice", label: "연습" },
    { key: "feedback", label: "피드백" },
  ],
  evaluate: [
    { key: "learner_assessment", label: "학습자 성취 평가" },
    { key: "media_method_evaluation", label: "매체·방법 평가" },
    { key: "revision_plan", label: "수정 계획" },
  ],
};

export type AssureStepStatus = { filled: boolean; missing: string[] };

function isBlank(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === "string" ? value.trim().length === 0 : true;
}

/**
 * 단계별로 «무엇이 비었는지» 를 돌려준다. 점수가 아니라 지목이다 — 화면은
 * 이걸로 «보완하면 좋은 항목» 을 말하지, 미완성 몇 개라고 세지 않는다.
 */
export function assureStepStatus(plan: AssurePlan | null): Record<AssureStepKey, AssureStepStatus> {
  const out = {} as Record<AssureStepKey, AssureStepStatus>;
  for (const key of ASSURE_STEP_KEYS) {
    const step = plan ? (plan[key] as unknown as Record<string, unknown>) : {};
    const missing = STEP_FIELDS[key].filter((f) => isBlank(step[f.key])).map((f) => f.label);
    out[key] = { filled: missing.length === 0, missing };
  }
  return out;
}

/**
 * 「객체이긴 한데 6단계가 전부 비었다」 — AI 가 `"assure": {}` 만 돌려준 경우다.
 *
 * 그대로 저장하면 컬럼이 non-null 이 되어 화면은 빈 카드 6장을 띄우고 PDF 는
 * 섹션을 통째로 빼, 같은 계획서가 두 표면에서 달라진다. 저장 직전에 한 번
 * 걸러 레거시 행과 같은 취급(= null)으로 모은다. 키 순서가 계약이므로
 * 정규화 결과끼리는 문자열 비교로 판정할 수 있다.
 */
export function isAssureEmpty(plan: AssurePlan | null): boolean {
  if (!plan) return true;
  return JSON.stringify(plan) === JSON.stringify(normalizeAssure({}));
}

/** 빠짐없이 채워진 단계의 수 (0~6). */
export function assureCompletion(plan: AssurePlan | null): number {
  const status = assureStepStatus(plan);
  return ASSURE_STEP_KEYS.filter((key) => status[key].filled).length;
}

/* ── 프롬프트 ────────────────────────────────────────────────────────── */

const NOT_GIVEN = "(교사 입력 없음 — 학년과 지도안 내용에서 추론할 것)";

/** 빈 값이 그대로 템플릿에 박히면 화면과 AI 양쪽에 흔적이 남는다. */
function given(value: string | undefined, fallback = NOT_GIVEN): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

/** `null` / `undefined` 를 문자열로 흘리지 않는 JSON 요약. */
function compactJson(value: unknown): string {
  if (value === undefined || value === null) return "";
  try {
    const text = JSON.stringify(value, (_key, v: unknown) => (v === null ? "" : v));
    return typeof text === "string" ? text : "";
  } catch {
    return "";
  }
}

/** 단계 머리글 6줄 — 라벨·문자·JSON 키·요약이 한 줄에 붙어 있어야 갈라지지 않는다. */
function stepOutline(): string {
  return ASSURE_STEPS.map((s) => `- "${s.key}" (${s.letter} · ${s.label}) — ${s.summary}`).join(
    "\n",
  );
}

const ABCD_RULES = `  · audience  = Audience(학습자): 누가. 예 "중학교 2학년 학습자는"
  · condition = Condition(조건): 어떤 조건·상황에서. 예 "상점 역할극 상황에서"
  · behavior  = Behavior(행동): 무엇을 할 수 있는지, 관찰 가능한 동사로. 예 "물건 값을 묻고 답할 수 있다"
  · degree    = Degree(준거): 어느 수준까지. 횟수·정확도·시간 중 하나로 측정 가능하게. 예 "3회 중 2회 이상 정확하게"
  네 요소를 한 문장에 뭉치지 말고 각각 다른 필드에 나눠 담을 것.
  degree 에 "정확하게" · "잘" · "능숙하게" 처럼 재어 볼 수 없는 말만 쓰지 말 것.
  원래 목표 문장에 준거가 없으면 수업 시간과 난이도에 맞는 측정 가능한 준거를
  직접 제안할 것 (예 "5개 중 4개 이상", "10초 안에", "80% 이상").`;

const FIVE_P_RULES = `  · preview             = 사전검토: 교사가 수업 전 매체·자료를 어디까지 확인해 두는지
  · prepare_materials   = 자료 준비: 인쇄 부수·분량·배치까지 숫자로
  · prepare_environment = 환경 준비: 좌석·기기·음향 등 교실 배치
  · prepare_learners    = 학습자 준비: 목표와 평가 기준을 어떻게 미리 안내하는지
  · provide_experience  = 학습경험 제공: 수업을 어떤 순서로 굴리는지
  다섯 항목 모두 교사가 수업 전에 체크리스트로 쓸 수 있는 문장이어야 한다.
  한 항목은 1~2문장. 여러 할 일을 한 문장에 이어 붙이지 말고 짧게 끊을 것.`;

const JSON_SHAPE = `"assure": {
    "analyze": { "general_traits": [""], "entry_competencies": [""], "learning_styles": [""] },
    "state": { "objectives": [{ "audience": "", "behavior": "", "condition": "", "degree": "" }] },
    "select": { "methods": [""], "media": [""], "materials": [""], "rationale": "" },
    "utilize": { "preview": "", "prepare_materials": "", "prepare_environment": "", "prepare_learners": "", "provide_experience": "" },
    "require": { "participation_activities": [""], "practice": "", "feedback": "" },
    "evaluate": { "learner_assessment": "", "media_method_evaluation": "", "revision_plan": "" }
  }`;

/**
 * 생성 프롬프트에 끼워 넣는 ASSURE 지시문.
 *
 * 기존 산출물과 «모순되지 않게» 가 핵심이다. ASSURE 가 별도 문서로 따로 놀면
 * 교사는 서로 다른 두 지도안을 손에 쥐게 된다.
 */
export function buildAssurePromptSection(input: {
  priorKnowledge: string;
  learningStyle: string;
  studentGrade: string;
}): string {
  return `[ASSURE 교수설계 모형 — 같은 수업을 6단계로 분석해 "assure" 키에 함께 담을 것]
${stepOutline()}

[학습자 분석(A)에 쓸 교사 입력]
- 대상 학년/연령: ${given(input.studentGrade, "(지정 없음 — 지도안 내용에서 추론할 것)")}
- 선수학습 수준: ${given(input.priorKnowledge)}
- 학습 양식: ${given(input.learningStyle)}

[단계별 작성 규칙]
1) "analyze" — general_traits 는 학년·인원·정서적 특성 같은 일반적 특성 2~4개.
   entry_competencies 는 이미 갖춘 출발점 능력, learning_styles 는 학습 양식.
   위 교사 입력이 있으면 그 내용을 반드시 반영할 것.
2) "state" — objectives 는 위 "objectives" 항목을 ABCD 형식으로 분해한 것이다.
   개수와 내용이 "objectives" 와 일치해야 하며 새 목표를 만들어 내지 말 것.
${ABCD_RULES}
3) "select" — methods 는 교수방법, media 는 매체, materials 는 위 "materials" 와 일치하는 자료.
   rationale 은 "왜 이 학습자에게 이 방법·매체인지" 를 학습 양식·선수학습과 연결한 2~3문장.
4) "utilize" — 5P.
${FIVE_P_RULES}
5) "require" — participation_activities 는 위 "activities" 와 같은 활동을 가리켜야 한다.
   practice 는 반복 연습 방식, feedback 은 교사가 언제 어떻게 교정하는지.
6) "evaluate" — learner_assessment 는 위 "assessment" 와 일치하는 성취 확인 방법,
   media_method_evaluation 은 이번에 쓴 매체와 방법이 통했는지 확인하는 방법,
   revision_plan 은 "다음 차시에 무엇을 바꿀지" 를 조건과 함께 구체적으로.
   예: "발음 오류가 3명 이상이면 다음 차시 도입 5분을 성조 청취로 바꾼다".

[assure 출력 shape — 키 이름을 그대로 쓸 것]
  ${JSON_SHAPE}
비어 있는 값은 빈 문자열 "" 또는 빈 배열 [] 로 둘 것.`;
}

/**
 * 이미 저장된 지도안에 ASSURE 만 나중에 채우는 보강용 프롬프트 (리더 결정 4).
 * 본문을 다시 만들지 않는다 — 기존 산출물은 사실로 두고 6단계만 뽑는다.
 */
export function buildAssureBackfillPrompt(input: {
  title: string;
  studentGrade: string;
  durationMinutes: number;
  objectives: string[];
  materials: string[];
  timeBlocks: unknown[];
  activities: unknown[];
  assessment: unknown;
  priorKnowledge: string;
  learningStyle: string;
}): string {
  const list = (items: string[]) =>
    items
      .map((v) => String(v ?? "").trim())
      .filter(Boolean)
      .map((v) => `  - ${v}`)
      .join("\n");
  const blank = "  - (내용 없음)";

  return `당신은 한국 학생을 위한 중국어 수업 설계 전문가입니다.
아래는 이미 확정된 수업 지도안입니다. 지도안 본문은 그대로 두고, 이 수업을
ASSURE 교수설계 모형 6단계로 분석해 JSON 으로만 답하세요.

[지도안]
- 제목: ${given(input.title, "(제목 없음)")}
- 대상: ${given(input.studentGrade, "(지정 없음)")}
- 총 수업 시간: ${Number.isFinite(input.durationMinutes) ? input.durationMinutes : 0}분
- 학습 목표:
${list(input.objectives) || blank}
- 준비물:
${list(input.materials) || blank}
- 시간 블록: ${compactJson(input.timeBlocks) || "(내용 없음)"}
- 활동: ${compactJson(input.activities) || "(내용 없음)"}
- 평가: ${compactJson(input.assessment) || "(내용 없음)"}
- 선수학습 수준: ${given(input.priorKnowledge)}
- 학습 양식: ${given(input.learningStyle)}

[ASSURE 6단계]
${stepOutline()}

[단계별 작성 규칙]
1) "analyze" — general_traits · entry_competencies · learning_styles.
   위 대상·선수학습 수준·학습 양식을 반영할 것.
2) "state" — objectives 를 ABCD 로 분해. 위 학습 목표와 개수·내용이 일치해야 하고
   새 목표를 만들어 내지 말 것.
${ABCD_RULES}
3) "select" — methods · media · materials 는 위 준비물·활동에서 실제로 쓰인 것만.
   rationale 은 이 학습자에게 왜 이 선택인지 2~3문장.
4) "utilize" — 5P.
${FIVE_P_RULES}
5) "require" — participation_activities 는 위 활동을 가리키고,
   practice 와 feedback 은 연습 방식과 교정 시점을 적을 것.
6) "evaluate" — learner_assessment 는 위 평가와 일치하게,
   media_method_evaluation 은 매체·방법이 통했는지 확인하는 방법,
   revision_plan 은 "다음 차시에 무엇을 바꿀지" 를 조건과 함께 구체적으로.

[출력 JSON — 이 키만, 이 이름 그대로]
{
  ${JSON_SHAPE}
}
비어 있는 값은 빈 문자열 "" 또는 빈 배열 [] 로 둘 것. JSON 외의 텍스트, 코드펜스 금지.`;
}
