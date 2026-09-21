import { Download, Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ASSURE_STEPS, normalizeAssure, type AssurePlan } from "@/lib/assure";
import { deliverFile } from "@/lib/file-delivery";
import { renderElementToPdfBlob, tagChineseRuns } from "@/lib/pdf-report";

type TimeBlock = {
  start_min?: number;
  end_min?: number;
  phase?: string;
  title?: string;
  teacher_action?: string;
  student_action?: string;
  materials?: string[];
};

type Activity = {
  name?: string;
  type?: string;
  duration_min?: number;
  objective?: string;
  materials?: string[];
  steps?: string[];
  chinese_examples?: { zh?: string; pinyin?: string; ko?: string }[];
  why_this?: string;
};

type Assessment = {
  formative?: string;
  summative?: string;
  rubric?: string[];
};

type Props = {
  title: string;
  studentGrade: string;
  durationMinutes: number;
  objectives: string[];
  materials: string[];
  timeBlocks: TimeBlock[];
  activities: Activity[];
  assessment: Assessment;
  handoutMarkdown: string;
  /**
   * ASSURE 6단계. 없는 계획서(레거시 행)에서는 섹션만 빠지고 나머지는 그대로
   * 나와야 한다 — buildHtml 이 여기서 던지면 PDF·인쇄 두 버튼이 함께 죽는다.
   */
  assure?: AssurePlan | null;
};

/** Trims a value down to something a filesystem will accept. */
function safeFile(s: string, max: number) {
  return s
    .replace(/[^\w가-힣-]+/g, "_")
    .replace(/_+$/, "")
    .slice(0, max);
}

function esc(s: unknown) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * ASSURE 6단계 — 없으면 빈 문자열을 돌려 섹션만 빠진다.
 *
 * 흑백 인쇄에서도 단계가 구분돼야 하므로 색이 아니라 테두리와 단계 문자
 * 사각형으로 나눈다. 값은 전부 esc() 를 지나며, 규칙은 화면과 같은
 * normalizeAssure 하나만 쓴다.
 */
function assureHtml(raw: unknown): string {
  const plan = normalizeAssure(raw);
  if (!plan) return "";

  const list = (label: string, items: string[]) =>
    items.length > 0
      ? `<div style="margin-bottom:6px;"><div style="font-weight:700;">${esc(label)}</div>
          <ul style="margin:2px 0;padding-left:16px;">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`
      : "";
  const text = (label: string, value: string) =>
    value
      ? `<div style="margin-bottom:6px;"><div style="font-weight:700;">${esc(label)}</div><div>${esc(value)}</div></div>`
      : "";

  const abcd = plan.state.objectives
    .map(
      (
        o,
      ) => `<div style="border:1px solid #cbd5e1;border-radius:6px;padding:6px;margin-bottom:6px;">
        ${o.audience ? `<div><b>A 학습자</b> ${esc(o.audience)}</div>` : ""}
        ${o.condition ? `<div><b>C 조건</b> ${esc(o.condition)}</div>` : ""}
        ${o.behavior ? `<div><b>B 행동</b> ${esc(o.behavior)}</div>` : ""}
        ${o.degree ? `<div><b>D 준거</b> ${esc(o.degree)}</div>` : ""}
      </div>`,
    )
    .join("");

  const bodies: Record<string, string> = {
    analyze: [
      list("일반적 특성", plan.analyze.general_traits),
      list("출발점 능력 (선수학습)", plan.analyze.entry_competencies),
      list("학습 양식", plan.analyze.learning_styles),
    ].join(""),
    state: abcd,
    select: [
      list("교수방법", plan.select.methods),
      list("매체", plan.select.media),
      list("자료", plan.select.materials),
      text("선정 근거", plan.select.rationale),
    ].join(""),
    utilize: [
      text("사전검토", plan.utilize.preview),
      text("자료 준비", plan.utilize.prepare_materials),
      text("환경 준비", plan.utilize.prepare_environment),
      text("학습자 준비", plan.utilize.prepare_learners),
      text("학습경험 제공", plan.utilize.provide_experience),
    ].join(""),
    require: [
      list("참여 유도 활동", plan.require.participation_activities),
      text("연습", plan.require.practice),
      text("피드백", plan.require.feedback),
    ].join(""),
    evaluate: [
      text("학습자 성취 평가", plan.evaluate.learner_assessment),
      text("매체·방법 평가", plan.evaluate.media_method_evaluation),
      text("수정 계획", plan.evaluate.revision_plan),
    ].join(""),
  };

  const cards = ASSURE_STEPS.filter((s) => bodies[s.key])
    .map(
      (
        s,
      ) => `<div style="border:1px solid #94a3b8;border-radius:8px;padding:10px;margin-bottom:8px;font-size:12px;page-break-inside:avoid;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
          <span style="display:inline-block;min-width:20px;text-align:center;border:1px solid #0f172a;background:#0f172a;color:#f8fafc;font-weight:700;border-radius:4px;padding:1px 4px;">${esc(s.letter)}</span>
          <b style="font-size:13px;">${esc(s.label)}</b>
          <span style="color:#475569;font-size:11px;">${esc(s.summary)}</span>
        </div>
        ${bodies[s.key]}
      </div>`,
    )
    .join("");
  if (!cards) return "";

  return `
      <section style="margin-bottom:18px;">
        <h2 style="font-size:15px;font-weight:700;margin:0 0 6px;">🧭 ASSURE 교수설계 분석</h2>
        ${cards}
      </section>`;
}

function buildHtml(p: Props) {
  const phaseColor: Record<string, string> = {
    도입: "#fce7f3",
    전개: "#e0f2fe",
    활동: "#dcfce7",
    정리: "#ede9fe",
  };
  return `
    <div style="padding:32px;font-family:'Noto Sans KR','Pretendard',system-ui,sans-serif;color:#0f172a;background:#fff;width:760px;">
      <div style="border-bottom:2px solid #f9a8d4;padding-bottom:12px;margin-bottom:20px;">
        <div style="font-size:12px;color:#64748b;">DingDong 수업 커리큘럼 · ${new Date().toLocaleDateString("ko-KR")}</div>
        <h1 style="font-size:24px;font-weight:700;margin:6px 0 0;">${esc(p.title)}</h1>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">대상: ${esc(p.studentGrade)} · 총 ${p.durationMinutes}분</div>
      </div>
${assureHtml(p.assure)}

      <section style="margin-bottom:18px;">
        <h2 style="font-size:15px;font-weight:700;margin:0 0 6px;">🎯 수업 목표</h2>
        <ul style="font-size:13px;margin:0;padding-left:18px;">
          ${p.objectives.map((o) => `<li>${esc(o)}</li>`).join("")}
        </ul>
      </section>

      <section style="margin-bottom:18px;">
        <h2 style="font-size:15px;font-weight:700;margin:0 0 6px;">🧰 준비물</h2>
        <ul style="font-size:13px;margin:0;padding-left:18px;">
          ${p.materials.map((m) => `<li>${esc(m)}</li>`).join("")}
        </ul>
      </section>

      <section style="margin-bottom:18px;">
        <h2 style="font-size:15px;font-weight:700;margin:0 0 6px;">⏱️ 시간 블록별 계획</h2>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#fdf2f8;">
              <th style="text-align:left;padding:6px;border:1px solid #fbcfe8;width:70px;">시간</th>
              <th style="text-align:left;padding:6px;border:1px solid #fbcfe8;width:60px;">단계</th>
              <th style="text-align:left;padding:6px;border:1px solid #fbcfe8;">교사 활동</th>
              <th style="text-align:left;padding:6px;border:1px solid #fbcfe8;">학생 활동</th>
            </tr>
          </thead>
          <tbody>
            ${p.timeBlocks
              .map(
                (b) => `<tr>
                  <td style="padding:6px;border:1px solid #fce7f3;font-weight:600;">${b.start_min ?? 0}~${b.end_min ?? 0}분</td>
                  <td style="padding:6px;border:1px solid #fce7f3;">
                    <span style="background:${phaseColor[b.phase ?? ""] ?? "#f1f5f9"};padding:2px 6px;border-radius:6px;">${esc(b.phase ?? "")}</span>
                    <div style="font-weight:600;margin-top:2px;">${esc(b.title ?? "")}</div>
                  </td>
                  <td style="padding:6px;border:1px solid #fce7f3;">${esc(b.teacher_action ?? "")}</td>
                  <td style="padding:6px;border:1px solid #fce7f3;">${esc(b.student_action ?? "")}</td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </section>

      <section style="margin-bottom:18px;">
        <h2 style="font-size:15px;font-weight:700;margin:0 0 6px;">🎲 인터랙티브 활동</h2>
        ${p.activities
          .map(
            (
              a,
            ) => `<div style="border:1px solid #fbcfe8;border-radius:10px;padding:10px;margin-bottom:8px;font-size:12px;">
              <div style="font-weight:700;font-size:13px;">${esc(a.name ?? "")} <span style="color:#64748b;font-weight:500;">· ${esc(a.type ?? "")} · ${a.duration_min ?? 0}분</span></div>
              <div style="color:#475569;margin:4px 0;">🎯 ${esc(a.objective ?? "")}</div>
              <div style="margin:4px 0;">준비물: ${(a.materials ?? []).map(esc).join(", ")}</div>
              <ol style="margin:4px 0;padding-left:18px;">${(a.steps ?? []).map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
              ${
                (a.chinese_examples ?? []).length > 0
                  ? `<div style="background:#fdf2f8;padding:6px;border-radius:6px;margin-top:4px;">${a.chinese_examples!.map((c) => `<div><b>${esc(c.zh)}</b> <span style="color:#64748b;">${esc(c.pinyin)}</span> — ${esc(c.ko)}</div>`).join("")}</div>`
                  : ""
              }
              ${a.why_this ? `<div style="color:#be185d;margin-top:4px;">💡 ${esc(a.why_this)}</div>` : ""}
            </div>`,
          )
          .join("")}
      </section>

      <section style="margin-bottom:18px;">
        <h2 style="font-size:15px;font-weight:700;margin:0 0 6px;">📝 평가</h2>
        <div style="font-size:13px;">
          <div><b>수업 중:</b> ${esc(p.assessment.formative ?? "")}</div>
          <div><b>수업 후:</b> ${esc(p.assessment.summative ?? "")}</div>
          ${(p.assessment.rubric ?? []).length > 0 ? `<div><b>평가 기준:</b><ul style="margin:2px 0;padding-left:18px;">${p.assessment.rubric!.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>` : ""}
        </div>
      </section>

      <section>
        <h2 style="font-size:15px;font-weight:700;margin:0 0 6px;">📄 학생 배포용 유인물 초안</h2>
        <pre style="white-space:pre-wrap;font-family:inherit;font-size:12px;background:#f8fafc;padding:10px;border-radius:8px;">${esc(p.handoutMarkdown)}</pre>
      </section>

      <div style="margin-top:24px;text-align:center;color:#94a3b8;font-size:11px;">
        🐼 叮叮(DingDong) · 수업 커리큘럼 생성기
      </div>
    </div>
  `;
}

/** The sheet both buttons render, with its Chinese marked as Chinese so it is
 * set in one face rather than the Korean face plus fallbacks. */
function sheetHtml(props: Props): string {
  return tagChineseRuns(buildHtml(props));
}

export function CurriculumPdfButton(props: Props) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    const container = document.createElement("div");
    try {
      container.innerHTML = sheetHtml(props);
      document.body.appendChild(container);
      const target = container.firstElementChild as HTMLElement;
      const dateStr = new Date().toLocaleDateString("ko-KR");
      // ko-KR renders as "2026. 9. 4.", whose spaces and trailing dot turned
      // the filename into "…_2026. 9. 4..pdf".
      const filename = `DingDong_커리큘럼_${safeFile(props.title, 30)}_${safeFile(dateStr, 12)}.pdf`;
      const blob = await renderElementToPdfBlob(target);

      const method = await deliverFile(blob, filename);
      if (method === "open") {
        toast.info("PDF를 새 탭에서 열었어요. 공유 버튼으로 저장할 수 있어요.");
      }
    } catch {
      toast.error("PDF를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      // Was removed inside the try, after an await: a failed render left the
      // whole curriculum sheet sitting on the page.
      container.remove();
      setBusy(false);
    }
  };

  const print = () => {
    const w = window.open("", "_blank", "width=900,height=1200");
    if (!w) return;
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${esc(props.title)}</title></head><body>${sheetHtml(props)}<script>window.onload=()=>{window.print();}</script></body></html>`,
    );
    w.document.close();
  };

  return (
    <div className="flex gap-2">
      <Button onClick={print} variant="outline">
        <Printer className="size-4" />
        인쇄
      </Button>
      <Button onClick={download} disabled={busy}>
        <Download className="size-4" />
        {busy ? "PDF 생성 중..." : "PDF 저장"}
      </Button>
    </div>
  );
}
