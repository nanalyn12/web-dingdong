import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
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
  deleteCurriculum,
  getCurriculum,
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
  도입: "bg-pink-100 text-pink-800",
  전개: "bg-sky-100 text-sky-800",
  활동: "bg-emerald-100 text-emerald-800",
  정리: "bg-violet-100 text-violet-800",
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
        <Link to="/curriculum" className="underline">목록으로</Link>
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

  return (
    <div className="space-y-6">
      <div className="glass rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 min-w-0">
          <Link to="/curriculum" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="size-3.5" /> 목록으로
          </Link>
          <h1 className="text-2xl lg:text-3xl font-bold mt-1 break-words">{row.title}</h1>
          <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-3">
            <span>대상: {row.student_grade}</span>
            <span>총 {row.duration_minutes}분</span>
            {row.interests.length > 0 && <span>관심사: {row.interests.join(", ")}</span>}
            {row.preferred_activities.length > 0 && <span>선호: {row.preferred_activities.join(", ")}</span>}
          </div>
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
          />
          <Button
            variant="outline"
            onClick={() => { if (confirm("삭제할까요?")) delM.mutate(); }}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="size-4" /> 삭제
          </Button>
        </div>
      </div>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-xl font-bold mb-3">🎯 수업 목표</h2>
        <ul className="space-y-2">
          {objectives.map((o, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="mt-1 size-1.5 rounded-full bg-primary shrink-0" />
              <span>{o}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-xl font-bold mb-3">🧰 준비물</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {materials.map((m, i) => (
            <label key={i} className="flex items-center gap-2 rounded-xl bg-white/50 px-3 py-2 text-sm">
              <input type="checkbox" className="rounded" />
              <span>{m}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-xl font-bold mb-3">⏱️ 시간 블록별 계획</h2>
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
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${PHASE_STYLE[b.phase ?? ""] ?? "bg-slate-100 text-slate-700"}`}>
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

      <section className="glass rounded-3xl p-6">
        <h2 className="text-xl font-bold mb-3">🎲 인터랙티브 활동 추천</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {activities.map((a, i) => (
            <div key={i} className="rounded-2xl bg-white/60 p-4 space-y-2 border border-white/40">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold">{a.name}</div>
                  <div className="text-xs text-muted-foreground">{a.type} · {a.duration_min}분</div>
                </div>
              </div>
              {a.objective && <div className="text-sm">🎯 {a.objective}</div>}
              {(a.materials ?? []).length > 0 && (
                <div className="text-xs text-muted-foreground">준비물: {a.materials!.join(", ")}</div>
              )}
              {(a.steps ?? []).length > 0 && (
                <ol className="text-sm space-y-1 list-decimal list-inside">
                  {a.steps!.map((s, j) => <li key={j}>{s}</li>)}
                </ol>
              )}
              {(a.chinese_examples ?? []).length > 0 && (
                <div className="rounded-xl bg-pink-50/70 p-2 text-sm space-y-0.5">
                  {a.chinese_examples!.map((c, k) => (
                    <div key={k}>
                      <span className="font-bold">{c.zh}</span>{" "}
                      <span className="text-muted-foreground">{c.pinyin}</span>{" — "}
                      <span>{c.ko}</span>
                    </div>
                  ))}
                </div>
              )}
              {a.why_this && (
                <div className="text-xs text-pink-700 bg-pink-50/50 rounded-lg p-2">
                  💡 {a.why_this}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-xl font-bold mb-3">📝 평가 방법</h2>
        <div className="space-y-2 text-sm">
          {assessment.formative && <div><b>수업 중:</b> {assessment.formative}</div>}
          {assessment.summative && <div><b>수업 후:</b> {assessment.summative}</div>}
          {(assessment.rubric ?? []).length > 0 && (
            <div>
              <b>평가 기준:</b>
              <ul className="list-disc list-inside mt-1">
                {assessment.rubric!.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-xl font-bold mb-3">📄 학생 배포용 유인물</h2>
        <pre className="whitespace-pre-wrap text-sm font-sans bg-white/50 rounded-2xl p-4">
          {row.handout_markdown}
        </pre>
      </section>
    </div>
  );
}
