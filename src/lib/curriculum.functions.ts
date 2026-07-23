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

// ── 연계 학습 (커리큘럼 ↔ 강의 · 영상 학습) ────────────────────────────────
// The generated plan is prose — it names activities, not app content. To make
// it teachable inside DingDong, the plan is matched once against the real
// lesson/drama catalog by AI and the picks are cached on the row, same as
// songs.related_content (content-links.functions.ts).

const AiLinkedSchema = z.object({
  summary: z.string().default(""),
  lessons: z
    .array(
      z.object({
        number: z.number().int().min(1),
        reason: z.string().default(""),
        block_hint: z.string().default(""),
      }),
    )
    .default([]),
  dramas: z
    .array(
      z.object({
        number: z.number().int().min(1),
        reason: z.string().default(""),
        block_hint: z.string().default(""),
      }),
    )
    .default([]),
});

export type CurriculumLink = {
  id: string;
  title: string;
  subtitle: string; // 코스명 (강의) / 장르·길이 (영상)
  reason: string;
  block_hint: string;
};
export type CurriculumLinkedContent = {
  summary: string;
  lessons: CurriculumLink[];
  dramas: CurriculumLink[];
  generated_at: string;
};

function fmtDuration(seconds: number | null) {
  if (!seconds) return "";
  const m = Math.round(seconds / 60);
  return `${m}분`;
}

async function generateAndCacheLinks(
  planId: string,
): Promise<CurriculumLinkedContent | null> {
  const { db, tables } = await import("@/db");

  const plans = await db
    .select()
    .from(tables.curriculum_plans)
    .where(eq(tables.curriculum_plans.id, planId))
    .limit(1);
  const plan = plans[0];
  if (!plan) throw new Error("커리큘럼을 찾을 수 없습니다.");

  const lessonRows = await db
    .select({
      id: tables.lessons.id,
      title: tables.lessons.title,
      level: tables.lessons.level,
      lesson_type: tables.lessons.lesson_type,
      key_expressions: tables.lessons.key_expressions,
      course_title: tables.courses.title,
    })
    .from(tables.lessons)
    .leftJoin(tables.courses, eq(tables.lessons.course_id, tables.courses.id))
    .orderBy(tables.lessons.created_at);

  const dramaRows = await db
    .select({
      id: tables.dramas.id,
      title: tables.dramas.title,
      title_zh: tables.dramas.title_zh,
      description: tables.dramas.description,
      genre: tables.dramas.genre,
      level: tables.dramas.level,
      duration_seconds: tables.dramas.duration_seconds,
    })
    .from(tables.dramas)
    .orderBy(tables.dramas.created_at);

  if (lessonRows.length === 0 && dramaRows.length === 0) return null;

  const lessonCatalog = lessonRows
    .map((l, i) => {
      const exprs = (Array.isArray(l.key_expressions) ? l.key_expressions : [])
        .map((e) => (e as { zh?: string })?.zh)
        .filter(Boolean)
        .slice(0, 6)
        .join(" / ");
      return `${i + 1}. "${l.title}" (코스: ${l.course_title ?? "?"}, 레벨: ${l.level ?? "?"}) 핵심표현: ${exprs || "(없음)"}`;
    })
    .join("\n");

  const dramaCatalog = dramaRows
    .map(
      (d, i) =>
        `${i + 1}. "${d.title}"${d.title_zh ? ` (${d.title_zh})` : ""} — 장르 ${d.genre ?? "?"}, 레벨 ${d.level}, ${fmtDuration(d.duration_seconds) || "길이 미상"} / ${(d.description ?? "").slice(0, 80)}`,
    )
    .join("\n");

  const objectives = (Array.isArray(plan.objectives) ? plan.objectives : [])
    .map((o) => String(o))
    .join(" / ");
  const blockTitles = (Array.isArray(plan.time_blocks) ? plan.time_blocks : [])
    .map((b) => {
      const t = b as { start_min?: number; end_min?: number; title?: string; phase?: string };
      return `${t.start_min ?? 0}~${t.end_min ?? 0}분 ${t.phase ?? ""} ${t.title ?? ""}`.trim();
    })
    .join(" | ");

  const { generateText, Output } = await import("ai");
  const gateway = createTextProvider();

  const { experimental_output: parsed } = await generateText({
    model: gateway("google/gemini-3-flash-preview"),
    system:
      "당신은 한국인 학습자를 위한 중국어 교육과정 설계 전문가입니다. 반드시 지정된 JSON 스키마로만 응답하세요.",
    prompt: [
      `[수업 지도안] "${plan.title}"`,
      `- 대상: ${plan.student_grade} / 총 ${plan.duration_minutes}분`,
      `- 학습 목표: ${objectives || "(없음)"}`,
      `- 학생 관심사: ${plan.interests.join(", ") || "(없음)"}`,
      `- 선호 활동: ${plan.preferred_activities.join(", ") || "(없음)"}`,
      `- 시간 블록: ${blockTitles || "(없음)"}`,
      "",
      `[강의(레슨) 목록]\n${lessonCatalog || "(없음)"}`,
      "",
      `[영상 학습 목록]\n${dramaCatalog || "(없음)"}`,
      "",
      "이 지도안을 실제 수업에서 진행할 때 함께 쓰면 좋은 콘텐츠를 골라주세요.",
      "- lessons: 강의 목록에서 1~3개 (목표·난이도가 맞는 것만. 없으면 빈 배열)",
      "- dramas: 영상 학습 목록에서 1~2개 (없으면 빈 배열)",
      "- reason: 이 지도안과 어떻게 연결되는지 한국어 1~2문장",
      "- block_hint: 어느 시간 블록/활동에서 쓰면 좋은지 한 문장 (예: '20~30분 전개 단계에서 핵심표현 도입용')",
      "- summary: 이 지도안을 앱 콘텐츠와 함께 운영하는 방법 2~3문장",
      "number 는 반드시 위 목록의 번호를 사용하세요. 억지로 채우지 말고 정말 맞는 것만 고르세요.",
    ].join("\n"),
    experimental_output: Output.object({ schema: AiLinkedSchema }),
  });

  const lessons: CurriculumLink[] = parsed.lessons
    .filter((l) => l.number >= 1 && l.number <= lessonRows.length)
    .map((l) => {
      const row = lessonRows[l.number - 1];
      return {
        id: row.id,
        title: row.title,
        subtitle: row.course_title ?? "",
        reason: l.reason,
        block_hint: l.block_hint,
      };
    });
  const dramas: CurriculumLink[] = parsed.dramas
    .filter((d) => d.number >= 1 && d.number <= dramaRows.length)
    .map((d) => {
      const row = dramaRows[d.number - 1];
      return {
        id: row.id,
        title: row.title,
        subtitle: [row.genre, fmtDuration(row.duration_seconds)]
          .filter(Boolean)
          .join(" · "),
        reason: d.reason,
        block_hint: d.block_hint,
      };
    });
  if (lessons.length === 0 && dramas.length === 0) return null;

  const result: CurriculumLinkedContent = {
    summary: parsed.summary,
    lessons,
    dramas,
    generated_at: new Date().toISOString(),
  };
  await db
    .update(tables.curriculum_plans)
    .set({ linked_content: result as unknown as Json })
    .where(eq(tables.curriculum_plans.id, planId));
  return result;
}

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
  linked_content: Json | null;
  created_at: string;
  created_by: string;
  // Joined for display — the course/lesson the teacher picked as 현재 진도.
  course_title: string | null;
  lesson_title: string | null;
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
      .select({
        plan: tables.curriculum_plans,
        course_title: tables.courses.title,
        lesson_title: tables.lessons.title,
      })
      .from(tables.curriculum_plans)
      .leftJoin(tables.courses, eq(tables.curriculum_plans.course_id, tables.courses.id))
      .leftJoin(tables.lessons, eq(tables.curriculum_plans.lesson_id, tables.lessons.id))
      .where(eq(tables.curriculum_plans.id, data.id))
      .limit(1);
    const row = rows[0];
    if (!row) throw new Error("커리큘럼을 찾을 수 없습니다.");
    const isAdmin = (await getRole(context.userId)) === "admin";
    if (!isAdmin && row.plan.created_by !== context.userId) {
      throw new Error("접근 권한이 없습니다.");
    }
    return {
      ...row.plan,
      course_title: row.course_title,
      lesson_title: row.lesson_title,
    } as unknown as CurriculumRow;
  });

/** 커리큘럼의 연계 학습 콘텐츠 — 캐시가 없으면 최초 1회 AI로 생성. */
export const getCurriculumLinks = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => IdInput.parse(i))
  .handler(async ({ data, context }): Promise<CurriculumLinkedContent | null> => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    const rows = await db
      .select({
        created_by: tables.curriculum_plans.created_by,
        linked_content: tables.curriculum_plans.linked_content,
      })
      .from(tables.curriculum_plans)
      .where(eq(tables.curriculum_plans.id, data.id))
      .limit(1);
    if (!rows[0]) throw new Error("커리큘럼을 찾을 수 없습니다.");
    const isAdmin = (await getRole(context.userId)) === "admin";
    if (!isAdmin && rows[0].created_by !== context.userId) {
      throw new Error("접근 권한이 없습니다.");
    }
    const cached = rows[0].linked_content as CurriculumLinkedContent | null;
    if (cached?.lessons?.length || cached?.dramas?.length) return cached;
    try {
      return await generateAndCacheLinks(data.id);
    } catch (e) {
      console.warn("[curriculum-links] 생성 실패:", e);
      return null;
    }
  });

/** 연계 학습 콘텐츠를 다시 고른다 (콘텐츠가 추가된 뒤 등). */
export const regenerateCurriculumLinks = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => IdInput.parse(i))
  .handler(async ({ data, context }): Promise<CurriculumLinkedContent | null> => {
    await assertEditor(context.userId);
    const { db, tables } = await import("@/db");
    const rows = await db
      .select({ created_by: tables.curriculum_plans.created_by })
      .from(tables.curriculum_plans)
      .where(eq(tables.curriculum_plans.id, data.id))
      .limit(1);
    if (!rows[0]) throw new Error("커리큘럼을 찾을 수 없습니다.");
    const isAdmin = (await getRole(context.userId)) === "admin";
    if (!isAdmin && rows[0].created_by !== context.userId) {
      throw new Error("접근 권한이 없습니다.");
    }
    return generateAndCacheLinks(data.id);
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
