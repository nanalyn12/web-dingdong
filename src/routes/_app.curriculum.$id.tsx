import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  BookOpen,
  Film,
  GraduationCap,
  Loader2,
  Music,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CurriculumPdfButton } from "@/components/curriculum-pdf-button";
import {
  ASSURE_STEPS,
  assureStepStatus,
  normalizeAssure,
  type AssurePlan,
  type AssureStepKey,
} from "@/lib/assure";
import {
  deleteCurriculum,
  generateAssureForPlan,
  getCurriculum,
  getCurriculumLinks,
  regenerateCurriculumLinks,
  type CurriculumLink,
  type CurriculumLinkedContent,
  type CurriculumRow,
} from "@/lib/curriculum.functions";

export const Route = createFileRoute("/_app/curriculum/$id")({
  head: () => ({
    meta: [
      { title: "커리큘럼 상세 — DingDong" },
      { name: "description", content: "AI가 생성한 수업 커리큘럼 상세 보기." },
    ],
  }),
  component: CurriculumDetail,
});

const PHASE_STYLE: Record<string, string> = {
  도입: "bg-pink/25 text-foreground",
  전개: "bg-sky/25 text-foreground",
  활동: "bg-mint/25 text-foreground",
  정리: "bg-lavender/25 text-foreground",
};

function CurriculumDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getCurriculum);
  const delFn = useServerFn(deleteCurriculum);

  const { data, isLoading, error } = useQuery({
    queryKey: ["curriculum", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const delM = useMutation({
    mutationFn: async () => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("삭제되었어요");
      qc.invalidateQueries({ queryKey: ["my-curriculums"] });
      navigate({ to: "/curriculum" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="glass rounded-3xl p-10 text-center">
        <Loader2 className="size-6 animate-spin mx-auto" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass rounded-3xl p-10 text-center space-y-3">
        <h1 className="text-2xl font-bold">불러올 수 없어요</h1>
        <p className="text-muted-foreground">{(error as Error)?.message}</p>
        <Link to="/curriculum" className="underline">
          목록으로
        </Link>
      </div>
    );
  }

  const row = data as CurriculumRow;
  const objectives = (row.objectives as string[]) ?? [];
  const materials = (row.materials as string[]) ?? [];
  const timeBlocks =
    (row.time_blocks as {
      start_min?: number;
      end_min?: number;
      phase?: string;
      title?: string;
      teacher_action?: string;
      student_action?: string;
      materials?: string[];
    }[]) ?? [];
  const activities =
    (row.activities as {
      name?: string;
      type?: string;
      duration_min?: number;
      objective?: string;
      materials?: string[];
      steps?: string[];
      chinese_examples?: { zh?: string; pinyin?: string; ko?: string }[];
      why_this?: string;
    }[]) ?? [];
  const assessment =
    (row.assessment as {
      formative?: string;
      summative?: string;
      rubric?: string[];
    }) ?? {};
  // ASSURE 이전에 만들어진 행은 여기서 null 이 되고, 아래 섹션·배지가 통째로
  // 빠진다. raw jsonb 를 직접 읽으면 그 행에서 .map 이 터진다.
  const assure = normalizeAssure(row.assure);

  return (
    <div className="space-y-6">
      <div className="glass rounded-3xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 min-w-0">
          <Link
            to="/curriculum"
            className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:underline"
          >
            <ArrowLeft className="size-3.5" /> 목록으로
          </Link>
          <h1 className="text-2xl lg:text-3xl font-bold mt-1 break-words">{row.title}</h1>
          <div className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {assure && <AssureBadge step="analyze" />}
            <span>대상: {row.student_grade}</span>
            <span>총 {row.duration_minutes}분</span>
            {row.interests.length > 0 && <span>관심사: {row.interests.join(", ")}</span>}
            {row.preferred_activities.length > 0 && (
              <span>선호: {row.preferred_activities.join(", ")}</span>
            )}
            {row.prior_knowledge && <span>선수학습: {row.prior_knowledge}</span>}
            {row.learning_style && <span>학습 양식: {row.learning_style}</span>}
          </div>
          {(row.course_title || row.lesson_title) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {row.course_title && (
                <Link
                  to="/courses"
                  className="inline-flex items-center gap-1 text-xs bg-sky/25 text-foreground px-2.5 py-1 rounded-full hover:bg-sky/40"
                >
                  <GraduationCap className="size-3.5" /> {row.course_title}
                </Link>
              )}
              {row.lesson_title && row.lesson_id && (
                <Link
                  to="/lessons/$id"
                  params={{ id: row.lesson_id }}
                  className="inline-flex items-center gap-1 text-xs bg-mint/25 text-foreground px-2.5 py-1 rounded-full hover:bg-mint/40"
                >
                  <BookOpen className="size-3.5" /> {row.lesson_title}
                </Link>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <CurriculumPdfButton
            title={row.title}
            studentGrade={row.student_grade}
            durationMinutes={row.duration_minutes}
            objectives={objectives}
            materials={materials}
            timeBlocks={timeBlocks}
            activities={activities}
            assessment={assessment}
            handoutMarkdown={row.handout_markdown}
            assure={assure}
          />
          <Button
            variant="outline"
            onClick={() => {
              if (confirm("삭제할까요?")) delM.mutate();
            }}
            className="text-danger hover:text-danger/80"
          >
            <Trash2 className="size-4" /> 삭제
          </Button>
        </div>
      </div>

      {assure ? <AssureSection plan={assure} /> : <AssureBackfillCard id={id} />}

      <LinkedContentSection id={id} hasAssure={!!assure} />

      <section className="glass rounded-3xl p-4 sm:p-6">
        <h2 className="text-xl font-bold mb-3 flex flex-wrap items-center gap-2">
          🎯 수업 목표 {assure && <AssureBadge step="state" />}
        </h2>
        <ul className="space-y-2">
          {objectives.map((o, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="mt-1 size-1.5 rounded-full bg-primary shrink-0" />
              <span>{o}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="glass rounded-3xl p-4 sm:p-6">
        <h2 className="text-xl font-bold mb-3 flex flex-wrap items-center gap-2">
          🧰 준비물 {assure && <AssureBadge step="select" />}
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {materials.map((m, i) => (
            <label
              key={i}
              className="flex items-center gap-2 rounded-xl bg-surface/50 px-3 py-2 text-sm"
            >
              <input type="checkbox" className="rounded" />
              <span>{m}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="glass rounded-3xl p-4 sm:p-6">
        <h2 className="text-xl font-bold mb-3 flex flex-wrap items-center gap-2">
          ⏱️ 시간 블록별 계획 {assure && <AssureBadge step="utilize" />}
        </h2>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">시간</TableHead>
                <TableHead className="w-40">단계</TableHead>
                <TableHead>교사 활동</TableHead>
                <TableHead>학생 활동</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {timeBlocks.map((b, i) => (
                <TableRow key={i}>
                  <TableCell className="font-semibold whitespace-nowrap">
                    {b.start_min ?? 0}~{b.end_min ?? 0}분
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${PHASE_STYLE[b.phase ?? ""] ?? "bg-slate-100 text-foreground"}`}
                    >
                      {b.phase}
                    </span>
                    <div className="font-medium text-sm mt-1">{b.title}</div>
                  </TableCell>
                  <TableCell className="text-sm">{b.teacher_action}</TableCell>
                  <TableCell className="text-sm">{b.student_action}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="glass rounded-3xl p-4 sm:p-6">
        <h2 className="text-xl font-bold mb-3 flex flex-wrap items-center gap-2">
          🎲 인터랙티브 활동 추천 {assure && <AssureBadge step="require" />}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {activities.map((a, i) => (
            <div
              key={i}
              className="rounded-2xl bg-surface/60 p-4 space-y-2 border border-surface/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold">{a.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.type} · {a.duration_min}분
                  </div>
                </div>
              </div>
              {a.objective && <div className="text-sm">🎯 {a.objective}</div>}
              {(a.materials ?? []).length > 0 && (
                <div className="text-xs text-muted-foreground">
                  준비물: {a.materials!.join(", ")}
                </div>
              )}
              {(a.steps ?? []).length > 0 && (
                <ol className="text-sm space-y-1 list-decimal list-inside">
                  {a.steps!.map((s, j) => (
                    <li key={j}>{s}</li>
                  ))}
                </ol>
              )}
              {(a.chinese_examples ?? []).length > 0 && (
                <div className="rounded-xl bg-pink-50/70 p-2 text-sm space-y-0.5">
                  {a.chinese_examples!.map((c, k) => (
                    <div key={k}>
                      <span className="font-bold">{c.zh}</span>{" "}
                      <span className="text-muted-foreground">{c.pinyin}</span>
                      {" — "}
                      <span>{c.ko}</span>
                    </div>
                  ))}
                </div>
              )}
              {a.why_this && (
                <div className="text-xs text-foreground bg-pink/20 rounded-lg p-2">
                  💡 {a.why_this}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="glass rounded-3xl p-4 sm:p-6">
        <h2 className="text-xl font-bold mb-3 flex flex-wrap items-center gap-2">
          📝 평가 방법 {assure && <AssureBadge step="evaluate" />}
        </h2>
        <div className="space-y-2 text-sm">
          {assessment.formative && (
            <div>
              <b>수업 중:</b> {assessment.formative}
            </div>
          )}
          {assessment.summative && (
            <div>
              <b>수업 후:</b> {assessment.summative}
            </div>
          )}
          {(assessment.rubric ?? []).length > 0 && (
            <div>
              <b>평가 기준:</b>
              <ul className="list-disc list-inside mt-1">
                {assessment.rubric!.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section className="glass rounded-3xl p-4 sm:p-6">
        <h2 className="text-xl font-bold mb-3">📄 학생 배포용 유인물</h2>
        <pre className="whitespace-pre-wrap text-sm font-sans bg-surface/50 rounded-2xl p-4">
          {row.handout_markdown}
        </pre>
      </section>
    </div>
  );
}

/* ── ASSURE 교수설계 레이어 ──────────────────────────────────────────── */

const STEP_META = new Map(ASSURE_STEPS.map((s) => [s.key, s]));

/**
 * 기존 섹션이 ASSURE 의 어느 단계인지 알려주는 배지.
 *
 * 문자만 붙이면 장식이 된다 — state 와 select 가 둘 다 S 라서 문자로는 아예
 * 구분되지 않는다. 라벨을 함께 보여야 배지가 설명이 된다.
 */
function AssureBadge({ step }: { step: AssureStepKey }) {
  const meta = STEP_META.get(step);
  if (!meta) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-lavender/30 px-2 py-0.5 text-xs font-medium align-middle"
      title={meta.summary}
    >
      <span className="font-bold">{meta.letter}</span>
      {meta.label}
    </span>
  );
}

function AssureList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <ul className="mt-1 space-y-1">
        {items.map((v, i) => (
          <li key={i} className="flex gap-2 text-sm">
            <span className="mt-1.5 size-1 rounded-full bg-primary shrink-0" />
            <span>{v}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AssureText({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <p className="text-sm mt-0.5">{value}</p>
    </div>
  );
}

/** ABCD 한 요소. 네 요소가 각각 보여야 «분해했다» 는 것이 화면에서 드러난다. */
function AbcdRow({ letter, label, value }: { letter: string; label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="shrink-0 font-mono text-xs font-bold w-4 pt-0.5">{letter}</span>
      <span className="shrink-0 text-xs text-muted-foreground w-12 pt-0.5">{label}</span>
      <span className="min-w-0">{value}</span>
    </div>
  );
}

function AssureStepCard({
  stepKey,
  missing,
  children,
}: {
  stepKey: AssureStepKey;
  missing: string[];
  children: ReactNode;
}) {
  const meta = STEP_META.get(stepKey);
  if (!meta) return null;
  return (
    <div className="rounded-2xl bg-surface/60 border border-surface/40 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-lavender/40 text-sm font-bold">
          {meta.letter}
        </span>
        <div className="min-w-0">
          <div className="font-bold">{meta.label}</div>
          <div className="text-xs text-muted-foreground">{meta.summary}</div>
        </div>
      </div>
      {children}
      {missing.length > 0 && (
        // 점수를 매기지 않는다 — 무엇을 더 적으면 좋을지만 말한다.
        <p className="text-xs text-muted-foreground">보완하면 좋은 항목: {missing.join(" · ")}</p>
      )}
    </div>
  );
}

/** ASSURE 6단계 — 기준서의 순서(A·S·S·U·R·E) 그대로 렌더한다. */
function AssureSection({ plan }: { plan: AssurePlan }) {
  const status = assureStepStatus(plan);

  const bodies: Record<AssureStepKey, ReactNode> = {
    analyze: (
      <div className="space-y-3">
        <AssureList label="일반적 특성" items={plan.analyze.general_traits} />
        <AssureList label="출발점 능력 (선수학습)" items={plan.analyze.entry_competencies} />
        <AssureList label="학습 양식" items={plan.analyze.learning_styles} />
      </div>
    ),
    state: (
      <div className="space-y-2">
        {plan.state.objectives.map((o, i) => (
          <div key={i} className="rounded-xl bg-surface/50 p-3 space-y-1">
            <AbcdRow letter="A" label="학습자" value={o.audience} />
            <AbcdRow letter="C" label="조건" value={o.condition} />
            <AbcdRow letter="B" label="행동" value={o.behavior} />
            <AbcdRow letter="D" label="준거" value={o.degree} />
          </div>
        ))}
      </div>
    ),
    select: (
      <div className="space-y-3">
        <AssureList label="교수방법" items={plan.select.methods} />
        <AssureList label="매체" items={plan.select.media} />
        <AssureList label="자료" items={plan.select.materials} />
        <AssureText label="선정 근거" value={plan.select.rationale} />
      </div>
    ),
    utilize: (
      <div className="space-y-3">
        <AssureText label="사전검토" value={plan.utilize.preview} />
        <AssureText label="자료 준비" value={plan.utilize.prepare_materials} />
        <AssureText label="환경 준비" value={plan.utilize.prepare_environment} />
        <AssureText label="학습자 준비" value={plan.utilize.prepare_learners} />
        <AssureText label="학습경험 제공" value={plan.utilize.provide_experience} />
      </div>
    ),
    require: (
      <div className="space-y-3">
        <AssureList label="참여 유도 활동" items={plan.require.participation_activities} />
        <AssureText label="연습" value={plan.require.practice} />
        <AssureText label="피드백" value={plan.require.feedback} />
      </div>
    ),
    evaluate: (
      <div className="space-y-3">
        <AssureText label="학습자 성취 평가" value={plan.evaluate.learner_assessment} />
        <AssureText label="매체·방법 평가" value={plan.evaluate.media_method_evaluation} />
        <AssureText label="수정 계획" value={plan.evaluate.revision_plan} />
      </div>
    ),
  };

  return (
    <section className="glass rounded-3xl p-4 sm:p-6">
      <h2 className="text-xl font-bold">🧭 ASSURE 교수설계 분석</h2>
      <p className="text-sm text-muted-foreground mt-0.5">
        위 지도안을 ASSURE 모형 6단계로 정리했어요. 같은 수업을 설계 관점에서 본 것입니다.
      </p>

      {/* 스크롤 중에도 «지금 어느 단계» 를 잃지 않게 하는 목차. 채워진 단계만 강조한다. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {ASSURE_STEPS.map((s) => (
          <span
            key={s.key}
            title={s.summary}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
              status[s.key].filled
                ? "gradient-primary text-primary-foreground"
                : "bg-surface/50 text-muted-foreground"
            }`}
          >
            <span className="font-bold">{s.letter}</span>
            {s.label}
          </span>
        ))}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {ASSURE_STEPS.map((s) => (
          <AssureStepCard key={s.key} stepKey={s.key} missing={status[s.key].missing}>
            {bodies[s.key]}
          </AssureStepCard>
        ))}
      </div>
    </section>
  );
}

/**
 * ASSURE 이전에 만들어진 계획서를 위한 보강 경로 (리더 결정 4).
 * 빈 섹션 껍데기를 두는 대신, 원하면 채울 수 있다는 제안 한 줄만 둔다.
 */
function AssureBackfillCard({ id }: { id: string }) {
  const qc = useQueryClient();
  const genFn = useServerFn(generateAssureForPlan);

  const m = useMutation({
    mutationFn: async () => genFn({ data: { id } }),
    onSuccess: () => {
      toast.success("ASSURE 6단계를 만들었어요");
      qc.invalidateQueries({ queryKey: ["curriculum", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="glass rounded-3xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-bold">🧭 ASSURE 교수설계 분석을 추가할 수 있어요</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          지도안 본문은 그대로 두고, 학습자 분석 · ABCD 목표 · 5P 활용 계획 · 평가와 수정 계획만
          새로 만들어 붙입니다.
        </p>
      </div>
      <Button onClick={() => m.mutate()} disabled={m.isPending}>
        {m.isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" /> 분석하는 중… (20~40초)
          </>
        ) : (
          <>
            <Sparkles className="size-4" /> ASSURE 분석 추가
          </>
        )}
      </Button>
    </section>
  );
}

/**
 * 이 지도안으로 수업할 때 함께 쓸 앱 콘텐츠 — 첫 조회 때 AI가 고르고 캐시된다
 * (curriculum.functions.ts). 30초 정도 걸릴 수 있어 페이지 본문과 분리해 로드.
 */
function LinkedContentSection({ id, hasAssure }: { id: string; hasAssure: boolean }) {
  const qc = useQueryClient();
  const linksFn = useServerFn(getCurriculumLinks);
  const regenFn = useServerFn(regenerateCurriculumLinks);

  const { data, isLoading } = useQuery({
    queryKey: ["curriculum-links", id],
    queryFn: () => linksFn({ data: { id } }),
    staleTime: Infinity,
  });

  const regen = useMutation({
    mutationFn: async () => regenFn({ data: { id } }),
    onSuccess: (r: CurriculumLinkedContent | null) => {
      qc.setQueryData(["curriculum-links", id], r);
      toast.success(r ? "연계 콘텐츠를 다시 골랐어요" : "연결할 만한 콘텐츠가 없어요");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = isLoading || regen.isPending;

  return (
    <section className="glass rounded-3xl p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-xl font-bold flex flex-wrap items-center gap-2">
            🔗 이 수업에 쓸 콘텐츠 {hasAssure && <AssureBadge step="select" />}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            지도안에 맞는 앱 안의 강의 · 영상 학습 · 학습송을 AI가 골라줍니다.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => regen.mutate()} disabled={busy}>
          <RefreshCw className={`size-4 ${regen.isPending ? "animate-spin" : ""}`} />
          다시 찾기
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="size-4 animate-spin" /> 연계 콘텐츠를 찾는 중… (최대 30초)
        </div>
      )}

      {!isLoading && !data && (
        <p className="text-sm text-muted-foreground py-2">
          아직 연결할 만한 강의 · 영상 · 학습송이 없어요. 콘텐츠를 추가한 뒤 «다시 찾기»를
          눌러보세요.
        </p>
      )}

      {data && (
        <div className="space-y-4">
          {data.summary && <p className="text-sm bg-surface/60 rounded-2xl p-3">{data.summary}</p>}
          <LinkGroup label="강의" icon={GraduationCap} links={data.lessons} to="lesson" />
          <LinkGroup label="영상 학습" icon={Film} links={data.dramas} to="drama" />
          <LinkGroup label="학습송" icon={Music} links={data.songs} to="song" />
        </div>
      )}
    </section>
  );
}

type LinkTarget = "lesson" | "drama" | "song";

function LinkGroup({
  label,
  icon: Icon,
  links,
  to,
}: {
  label: string;
  icon: typeof GraduationCap;
  links: CurriculumLink[] | undefined;
  to: LinkTarget;
}) {
  if (!links?.length) return null;
  return (
    <div>
      <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
        <Icon className="size-4" /> {label}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {links.map((l) => (
          <LinkCard key={l.id} link={l} to={to} />
        ))}
      </div>
    </div>
  );
}

function LinkCard({ link, to }: { link: CurriculumLink; to: LinkTarget }) {
  const inner = (
    <>
      <div className="font-bold">{link.title}</div>
      {link.subtitle && <div className="text-xs text-muted-foreground">{link.subtitle}</div>}
      {link.reason && <p className="text-sm mt-1">{link.reason}</p>}
      {link.block_hint && (
        <div className="text-xs text-foreground bg-pink/25 rounded-lg p-2 mt-2">
          ⏱️ {link.block_hint}
        </div>
      )}
    </>
  );
  const cls =
    "block rounded-2xl bg-surface/60 p-4 border border-surface/40 hover:bg-surface/80 transition-colors";
  if (to === "lesson") {
    return (
      <Link to="/lessons/$id" params={{ id: link.id }} className={cls}>
        {inner}
      </Link>
    );
  }
  if (to === "drama") {
    return (
      <Link to="/dramas/$id" params={{ id: link.id }} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <Link to="/songs/$id" params={{ id: link.id }} className={cls}>
      {inner}
    </Link>
  );
}
