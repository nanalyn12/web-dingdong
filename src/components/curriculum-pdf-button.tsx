import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";
import { useState } from "react";

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
};

function esc(s: unknown) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
            (a) => `<div style="border:1px solid #fbcfe8;border-radius:10px;padding:10px;margin-bottom:8px;font-size:12px;">
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

export function CurriculumPdfButton(props: Props) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const container = document.createElement("div");
      container.innerHTML = buildHtml(props);
      document.body.appendChild(container);
      const html2pdf = (await import("html2pdf.js")).default;
      const dateStr = new Date().toLocaleDateString("ko-KR");
      await html2pdf()
        .from(container.firstElementChild as HTMLElement)
        .set({
          margin: 10,
          filename: `DingDong_커리큘럼_${props.title.replace(/[^\w가-힣]+/g, "_").slice(0, 30)}_${dateStr}.pdf`,
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .save();
      document.body.removeChild(container);
    } finally {
      setBusy(false);
    }
  };

  const print = () => {
    const w = window.open("", "_blank", "width=900,height=1200");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(props.title)}</title></head><body>${buildHtml(props)}<script>window.onload=()=>{window.print();}</script></body></html>`);
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
