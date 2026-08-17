import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useState } from "react";

type KeyExpression = { zh: string; pinyin?: string; ko: string; hsk?: number };

type Props = {
  lessonTitle: string;
  level: string;
  keyExpressions: KeyExpression[];
  completedTabs: string[];
  quizScore?: { correct: number; total: number };
};

const TAB_LABEL: Record<string, string> = {
  key: "핵심표현",
  content: "본문",
  dialogue: "실전대화",
  slides: "슬라이드",
  quiz: "퀴즈",
};

export function LessonPdfButton({
  lessonTitle,
  level,
  keyExpressions,
  completedTabs,
  quizScore,
}: Props) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    const container = document.createElement("div");
    try {
      const dateStr = new Date().toLocaleDateString("ko-KR");
      // Parked off-screen: html2canvas needs a laid-out node with real
      // dimensions (so `display:none` is out), but appending it inline meant
      // the whole report visibly appeared at the bottom of the page while the
      // PDF was being rendered.
      container.style.cssText =
        "position:fixed;left:-10000px;top:0;z-index:-1;padding:32px;font-family:'Noto Sans KR','Pretendard',system-ui,sans-serif;color:#0f172a;background:#fff;width:720px;";
      container.innerHTML = `
        <div style="border-bottom:2px solid #f9a8d4;padding-bottom:12px;margin-bottom:20px;">
          <div style="font-size:12px;color:#64748b;">DingDong 학습 리포트 · ${dateStr}</div>
          <h1 style="font-size:24px;font-weight:700;margin:6px 0 0;">${escapeHtml(lessonTitle)}</h1>
          <div style="font-size:12px;color:#64748b;margin-top:4px;">난이도: ${escapeHtml(level)}</div>
        </div>

        <section style="margin-bottom:20px;">
          <h2 style="font-size:16px;font-weight:700;margin:0 0 8px;">✅ 학습한 섹션</h2>
          <div style="font-size:14px;">${
            completedTabs.length
              ? completedTabs.map((t) => TAB_LABEL[t] ?? t).join(" · ")
              : "(아직 학습한 섹션이 없습니다)"
          }</div>
        </section>

        <section style="margin-bottom:20px;">
          <h2 style="font-size:16px;font-weight:700;margin:0 0 8px;">📝 퀴즈 결과</h2>
          <div style="font-size:14px;">${
            quizScore
              ? `${quizScore.correct} / ${quizScore.total} 정답`
              : "(퀴즈를 아직 완료하지 않았어요)"
          }</div>
        </section>

        <section>
          <h2 style="font-size:16px;font-weight:700;margin:0 0 8px;">⭐ 핵심표현</h2>
          ${
            keyExpressions.length
              ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">
                  <thead>
                    <tr style="background:#fdf2f8;">
                      <th style="text-align:left;padding:8px;border:1px solid #fbcfe8;">中文</th>
                      <th style="text-align:left;padding:8px;border:1px solid #fbcfe8;">Pinyin</th>
                      <th style="text-align:left;padding:8px;border:1px solid #fbcfe8;">한국어</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${keyExpressions
                      .map(
                        (k) => `<tr>
                      <td style="padding:8px;border:1px solid #fce7f3;font-size:16px;">${escapeHtml(k.zh)}</td>
                      <td style="padding:8px;border:1px solid #fce7f3;color:#64748b;">${escapeHtml(k.pinyin ?? "")}</td>
                      <td style="padding:8px;border:1px solid #fce7f3;">${escapeHtml(k.ko)}</td>
                    </tr>`,
                      )
                      .join("")}
                  </tbody>
                </table>`
              : "<div style='font-size:14px;color:#64748b;'>핵심표현이 없습니다.</div>"
          }
        </section>

        <div style="margin-top:24px;text-align:center;color:#94a3b8;font-size:11px;">
          🐼 叮叮(DingDong) · 오늘도 중국어 한 입!
        </div>
      `;
      document.body.appendChild(container);

      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .from(container)
        .set({
          margin: 10,
          filename: `DingDong_${safeFile(lessonTitle)}_${dateStr}.pdf`,
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .save();
    } finally {
      // In `finally` so a failed render cannot strand the report in the page.
      container.remove();
      setBusy(false);
    }
  };

  return (
    <Button onClick={download} disabled={busy} variant="outline">
      <Download className="size-4" />
      {busy ? "PDF 생성 중..." : "학습 결과 PDF 저장"}
    </Button>
  );
}

function escapeHtml(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function safeFile(s: string) {
  return s.replace(/[^\w가-힣-]+/g, "_").slice(0, 40);
}
