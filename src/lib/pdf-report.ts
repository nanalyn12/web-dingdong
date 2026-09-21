import { safeCanvasScale } from "@/lib/file-delivery";

/**
 * Turning a laid-out element into an A4 PDF.
 *
 * This used to be `html2pdf.js`, which bundles html2canvas 1.4.1. That version
 * cannot parse `oklch()` and throws on sight of one:
 *
 *     Error: Attempting to parse an unsupported color function "oklch"
 *
 * Every colour in this design system is oklch, so the report was never built —
 * on any platform. It looked like a phone-only fault because the old delivery
 * path failed silently, so nobody saw the error on a desktop either.
 *
 * Suppressing the colours in the render clone stopped the exception and
 * produced a zero-height canvas instead, which is a blank PDF: worse than an
 * error, because it looks like it worked. `html2canvas-pro` is the maintained
 * fork that reads oklch, lab and color(), so the renderer was replaced rather
 * than worked around.
 */

/** A4 portrait, in millimetres. */
const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const MARGIN_MM = 10;

const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2;
const CONTENT_HEIGHT_MM = PAGE_HEIGHT_MM - MARGIN_MM * 2;

export type PdfReportOptions = {
  /** Solid colour behind the report; the page is not transparent. */
  backgroundColor?: string;
};

/**
 * Renders `element` and returns the PDF as a Blob.
 *
 * A Blob rather than a direct save: `deliverFile` decides how the file reaches
 * the person, because iOS Safari ignores an anchor's `download` attribute.
 */
export async function renderElementToPdfBlob(
  element: HTMLElement,
  { backgroundColor = "#ffffff" }: PdfReportOptions = {},
): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);

  const canvas = await html2canvas(element, {
    // Stepped down for a long report: iOS Safari returns a blank canvas rather
    // than an error once it passes its pixel ceiling.
    scale: safeCanvasScale(element.offsetWidth, element.offsetHeight),
    useCORS: true,
    backgroundColor,
    logging: false,
  });

  if (canvas.width === 0 || canvas.height === 0) {
    throw new Error("리포트를 그리지 못했어요 (빈 캔버스)");
  }

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const imageData = canvas.toDataURL("image/jpeg", 0.95);
  const imageHeightMm = (canvas.height * CONTENT_WIDTH_MM) / canvas.width;

  // The image is placed once per page, shifted up by a page each time, and the
  // page clips it — the standard way to spill one tall capture across sheets.
  pdf.addImage(imageData, "JPEG", MARGIN_MM, MARGIN_MM, CONTENT_WIDTH_MM, imageHeightMm);
  let remainingMm = imageHeightMm - CONTENT_HEIGHT_MM;
  while (remainingMm > 0) {
    pdf.addPage();
    pdf.addImage(
      imageData,
      "JPEG",
      MARGIN_MM,
      MARGIN_MM + remainingMm - imageHeightMm,
      CONTENT_WIDTH_MM,
      imageHeightMm,
    );
    remainingMm -= CONTENT_HEIGHT_MM;
  }

  return pdf.output("blob");
}

/*
 * Chinese in a report has to say it is Chinese.
 *
 * On screen every Chinese element carries lang="zh-CN", which is how the
 * browser knows to reach for a Simplified Chinese face. The report HTML had no
 * such mark, so the Korean face was tried first and only the glyphs it lacks
 * fell through to a Chinese one: "请问，这趟车到上海虹桥站吗？" came out in two
 * fonts, some characters visibly heavier than their neighbours.
 */

/** A Simplified Chinese face on each platform, then whatever lang="zh-CN" picks. */
const ZH_FONT_STACK =
  "'PingFang SC','Microsoft YaHei','Noto Sans SC','Noto Sans CJK SC','Source Han Sans SC',sans-serif";

const HAN = "\u3400-\u9fff\uf900-\ufaff";
/** CJK punctuation and fullwidth forms: ，。？！、：；（）「」 and friends. */
const CJK_PUNCT = "\u3000-\u303f\uff00-\uffef\u201c\u201d\u2018\u2019\u00b7\u2026";
/** A run starts on a Han character and ends on Han or CJK punctuation. */
const ZH_RUN = new RegExp(`[${HAN}](?:[${HAN}${CJK_PUNCT}]*[${HAN}${CJK_PUNCT}])?`, "g");

const ZH_OPEN = `<span lang="zh-CN" style="font-family:${ZH_FONT_STACK}">`;

/**
 * Wraps every run of Chinese in `html` in a zh-CN span. Markup is left alone —
 * attribute values included — and so is text already inside such a span, so
 * applying it twice changes nothing.
 */
export function tagChineseRuns(html: string): string {
  let inZh = false;
  let skip = 0; // inside <title>, <script> or <style>
  return html
    .split(/(<[^>]*>)/)
    .map((part) => {
      if (part.startsWith("<")) {
        if (/^<span lang="zh-CN"/i.test(part)) inZh = true;
        else if (inZh && /^<\/span>/i.test(part)) inZh = false;
        else if (/^<(title|script|style)\b/i.test(part)) skip++;
        else if (/^<\/(title|script|style)>/i.test(part)) skip = Math.max(0, skip - 1);
        return part;
      }
      if (inZh || skip > 0) return part;
      return part.replace(ZH_RUN, (run) => `${ZH_OPEN}${run}</span>`);
    })
    .join("");
}
