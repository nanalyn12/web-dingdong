import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Json } from "@/db/schema";
import { requireAuth } from "@/lib/auth-middleware";
import { createTextProvider } from "./ai-gateway.server";
import { assertEditor, getRole } from "./courses.functions";

const GenerateInput = z.object({
  courseId: z.string().uuid().optional().nullable(),
  lessonId: z.string().uuid().optional().nullable(),
  studentGrade: z.string().min(1),
  durationMinutes: z.number().int().min(15).max(240),
  interests: z.array(z.string()).default([]),
  preferredActivities: z.array(z.string()).default([]),
  specialNotes: z.string().optional().default(""),
  lessonObjectiveHint: z.string().optional().default(""),
});

const JsonObject = z.looseObject({});

const OutputSchema = z.object({
  title: z.string().default(""),
  objectives: z.array(z.string()).default([]),
  materials: z.array(z.string()).default([]),
  time_blocks: z.array(JsonObject).default([]),
  activities: z.array(JsonObject).default([]),
  assessment: JsonObject.default({}),
  handout_markdown: z.string().default(""),
});

const toJson = (v: unknown): Json => v as Json;

function extractJsonObject(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`JSON 없음: ${trimmed.slice(0, 300)}`);
  const jsonText = trimmed.slice(start, end + 1);
  try {
    return JSON.parse(jsonText);
  } catch (e) {
    throw new Error(`JSON 파싱 실패: ${(e as Error).message}`);
  }
}

function buildPrompt(args: {
  courseName?: string | null;
  lessonName?: string | null;
  studentGrade: string;
  durationMinutes: number;
  interests: string[];
  preferredActivities: string[];
  specialNotes: string;
  lessonObjectiveHint: string;
}) {
  return `당신은 한국 학생을 위한 중국어 수업 커리큘럼 설계 전문가입니다.
아래 입력을 바탕으로 실제 교실에서 바로 사용할 수 있는 수업 지도안을 JSON으로 생성하세요.

[입력 정보]
- 학생 학년/연령: ${args.studentGrade}
- 총 수업 시간: ${args.durationMinutes}분
- 현재 진도(코스): ${args.courseName ?? "지정 없음"}
- 현재 진도(세부 강의): ${args.lessonName ?? "지정 없음"}
- 학생 관심사: ${args.interests.join(", ") || "특별 사항 없음"}
- 선호 활동: ${args.preferredActivities.join(", ") || "특별 사항 없음"}
- 특이사항: ${args.specialNotes || "없음"}
- 수업 목표 힌트: ${args.lessonObjectiveHint || "없음"}

[출력 JSON 스키마 — 최상위 키만 사용]
{
  "title": "수업 제목 (한국어, 20자 이내)",
  "objectives": ["학생이 이 수업 후 할 수 있는 것 3~4개, 각 항목은 '~할 수 있다' 형태"],
  "materials": ["교사가 미리 준비할 준비물 5~8개, 예: '단어 카드 20장', '유튜브 영상 링크'"],
  "time_blocks": [
    {
      "start_min": 0,
      "end_min": 10,
      "phase": "도입 | 전개 | 활동 | 정리",
      "title": "이 블록 제목 (한국어, 15자 이내)",
      "teacher_action": "교사가 해야 할 일 (구체적)",
      "student_action": "학생이 하는 일",
      "materials": ["이 블록에서 쓰는 준비물"]
    }
  ],
  "activities": [
    {
      "name": "활동 이름 (한국어)",
      "type": "게임 | 역할극 | 짝활동 | 노래 | 영상 | 발표 | 쓰기",
      "duration_min": 10,
      "objective": "이 활동으로 학생이 얻는 것",
      "materials": ["필요 준비물"],
      "steps": ["1) ...", "2) ...", "3) ..."],
      "chinese_examples": [{ "zh": "간체 한자", "pinyin": "hàn zì", "ko": "한국어 번역" }],
      "why_this": "왜 이 학생의 관심사/선호에 어울리는지 한 문장"
    }
  ],
  "assessment": {
    "formative": "수업 중 확인 방법",
    "summative": "수업 끝 확인 방법",
    "rubric": ["평가 기준 3~4개"]
  },
  "handout_markdown": "학생 배포용 한 페이지 유인물의 마크다운. ## 오늘의 학습 → ## 핵심 표현 (표 형태로 zh/pinyin/의미) → ## 연습 문제 3개 → ## 오늘의 도전 과제. 중국어 문장에는 병음과 한국어 뜻을 함께."
}

[필수 규칙]
- time_blocks 는 반드시 start_min=0 부터 시작하고 마지막 end_min = ${args.durationMinutes} 이 되도록. 겹치거나 비지 않게 연속.
- time_blocks 는 4~7개.
- activities 는 3~5개, 학생 관심사(${args.interests.join(", ") || "일반"})와 선호 활동(${args.preferredActivities.join(", ") || "일반"})을 반드시 반영. why_this 필드에 관심사와 연결한 이유를 명시.
- 모든 중국어는 간체(简体) 한자만.
- ${args.studentGrade} 수준에 맞는 난이도.
- JSON 외의 텍스트, 코드펜스 금지.`;
}

export const generateCurriculum = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => GenerateInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");

    let courseName: string | null = null;
    let lessonName: string | null = null;
    if (data.courseId) {
      const c = await db
        .select({ title: tables.courses.title })
        .from(tables.courses)
        .where(eq(tables.courses.id, data.courseId))
        .limit(1);
      courseName = c[0]?.title ?? null;
    }
    if (data.lessonId) {
      const l = await db
        .select({ title: tables.lessons.title })
        .from(tables.lessons)
        .where(eq(tables.lessons.id, data.lessonId))
        .limit(1);
      lessonName = l[0]?.title ?? null;
    }

    const gateway = createTextProvider();
    const model = gateway("google/gemini-2.5-flash");

    let parsed: z.infer<typeof OutputSchema>;
    try {
      const result = await generateText({
        model,
        system:
          "You are an expert Chinese-language curriculum designer for Korean teachers. Output only valid JSON (simplified Chinese only).",
        prompt: buildPrompt({
          courseName,
          lessonName,
          studentGrade: data.studentGrade,
          durationMinutes: data.durationMinutes,
          interests: data.interests,
          preferredActivities: data.preferredActivities,
          specialNotes: data.specialNotes,
          lessonObjectiveHint: data.lessonObjectiveHint,
        }),
        maxOutputTokens: 16000,
        temperature: 0.5,
      });
      parsed = OutputSchema.parse(extractJsonObject(result.text));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const friendly = /429|rate.?limit|quota/i.test(msg)
        ? "Gemini 요청 한도를 초과했어요. 1~2분 후 다시 시도해주세요."
        : /402|credit|insufficient/i.test(msg)
          ? "AI 크레딧이 부족해요. 충전 후 다시 시도해주세요."
          : /401|unauthor|api.?key/i.test(msg)
            ? "Gemini API 키 인증 실패."
            : msg;
      throw new Error(`커리큘럼 생성 실패 — ${friendly}`);
    }

    const finalTitle =
      (parsed.title || `${data.studentGrade} · ${data.durationMinutes}분 수업`).slice(0, 100);

    const [inserted] = await db
      .insert(tables.curriculum_plans)
      .values({
        created_by: context.userId,
        course_id: data.courseId ?? null,
        lesson_id: data.lessonId ?? null,
        student_grade: data.studentGrade,
        duration_minutes: data.durationMinutes,
        interests: data.interests,
        preferred_activities: data.preferredActivities,
        special_notes: data.specialNotes || null,
        lesson_objective_hint: data.lessonObjectiveHint || null,
        title: finalTitle,
        objectives: toJson(parsed.objectives),
        materials: toJson(parsed.materials),
        time_blocks: toJson(parsed.time_blocks),
        activities: toJson(parsed.activities),
        assessment: toJson(parsed.assessment),
        handout_markdown: parsed.handout_markdown,
      })
      .returning({ id: tables.curriculum_plans.id });
    return { id: inserted.id };
  });

export type CurriculumRow = {
  id: string;
  title: string;
  student_grade: string;
  duration_minutes: number;
  interests: string[];
  preferred_activities: string[];
  special_notes: string | null;
  lesson_objective_hint: string | null;
  course_id: string | null;
  lesson_id: string | null;
  objectives: Json;
  materials: Json;
  time_blocks: Json;
  activities: Json;
  assessment: Json;
  handout_markdown: string;
  created_at: string;
  created_by: string;
};

export const listMyCurriculums = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    const isAdmin = (await getRole(context.userId)) === "admin";
    const cols = {
      id: tables.curriculum_plans.id,
      title: tables.curriculum_plans.title,
      student_grade: tables.curriculum_plans.student_grade,
      duration_minutes: tables.curriculum_plans.duration_minutes,
      created_at: tables.curriculum_plans.created_at,
    };
    const base = db.select(cols).from(tables.curriculum_plans);
    const rows = isAdmin
      ? await base.orderBy(desc(tables.curriculum_plans.created_at))
      : await base
          .where(eq(tables.curriculum_plans.created_by, context.userId))
          .orderBy(desc(tables.curriculum_plans.created_at));
    return rows;
  });

const IdInput = z.object({ id: z.string().uuid() });

export const getCurriculum = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => IdInput.parse(i))
  .handler(async ({ data, context }): Promise<CurriculumRow> => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    const rows = await db
      .select()
      .from(tables.curriculum_plans)
      .where(eq(tables.curriculum_plans.id, data.id))
      .limit(1);
    const row = rows[0];
    if (!row) throw new Error("커리큘럼을 찾을 수 없습니다.");
    const isAdmin = (await getRole(context.userId)) === "admin";
    if (!isAdmin && row.created_by !== context.userId) {
      throw new Error("접근 권한이 없습니다.");
    }
    return row as unknown as CurriculumRow;
  });

export const deleteCurriculum = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => IdInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    const isAdmin = (await getRole(context.userId)) === "admin";
    const rows = await db
      .select({ created_by: tables.curriculum_plans.created_by })
      .from(tables.curriculum_plans)
      .where(eq(tables.curriculum_plans.id, data.id))
      .limit(1);
    if (!rows[0]) throw new Error("커리큘럼을 찾을 수 없습니다.");
    if (!isAdmin && rows[0].created_by !== context.userId) {
      throw new Error("본인이 만든 커리큘럼만 삭제할 수 있어요.");
    }
    await db
      .delete(tables.curriculum_plans)
      .where(eq(tables.curriculum_plans.id, data.id));
    return { ok: true as const };
  });
