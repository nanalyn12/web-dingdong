/**
 * Handing a generated file to the person who asked for it.
 *
 * The study report used `html2pdf().save()`, which ends in jsPDF setting
 * `.download` on an anchor and clicking it. iOS Safari ignores that attribute
 * for `blob:` URLs, so on a phone the button did nothing at all — no file, no
 * error, nothing to report.
 *
 * The reason this is a module and not an inline branch: it cannot be
 * feature-detected. `"download" in document.createElement("a")` is true on iOS
 * Safari; the property is present and disregarded. Deciding by user agent is
 * the only option available, and a decision made from a user agent string
 * deserves to be written down where it can be read and tested.
 */

export type DeliveryMethod = "share" | "download" | "open";

export type DeliveryCapabilities = {
  /** `navigator.canShare({ files })` — Web Share Level 2. */
  canShareFiles: boolean;
  /** Whether an anchor's `download` attribute is actually honoured here. */
  honorsAnchorDownload: boolean;
};

/**
 * Share first: on iOS it opens the sheet with "Save to Files" alongside every
 * other destination, which is a better answer than a download even where a
 * download would have worked.
 */
export function chooseDelivery(caps: DeliveryCapabilities): DeliveryMethod {
  if (caps.canShareFiles) return "share";
  return caps.honorsAnchorDownload ? "download" : "open";
}

/**
 * WebKit on iOS refuses the `download` attribute, and every browser on iOS is
 * WebKit — Chrome and Firefox there inherit the refusal, so the check is for
 * the platform rather than the brand.
 *
 * iPadOS reports a Macintosh user agent, which no string test can separate
 * from a real Mac. `touchPoints` (from `navigator.maxTouchPoints`) is what
 * distinguishes them; a Mac reports 0.
 *
 * Unknown agents get `true` — the download path is the ordinary one, and
 * guessing "open in a tab" for a desktop browser would be the worse mistake.
 */
export function honorsAnchorDownload(userAgent?: string, touchPoints = 0): boolean {
  const ua = userAgent ?? "";
  if (/iPhone|iPad|iPod/i.test(ua)) return false;
  if (/Macintosh/i.test(ua) && touchPoints > 1) return false; // iPadOS in disguise
  return true;
}

/**
 * iOS Safari caps a canvas at roughly 16.7 million pixels. Past it there is no
 * exception — it hands back a blank canvas, which becomes an empty PDF.
 */
export const IOS_CANVAS_PIXEL_LIMIT = 16_777_216;

/** Scales html2canvas renders at; ordered best-first. */
const SCALE_CANDIDATES = [2, 1.5, 1] as const;

/**
 * The largest scale whose rendered canvas still fits under the ceiling. Never
 * below 1: a report is better slightly soft than blank.
 */
export function safeCanvasScale(
  widthPx: number,
  heightPx: number,
  limit = IOS_CANVAS_PIXEL_LIMIT,
): number {
  const w = Math.max(0, widthPx);
  const h = Math.max(0, heightPx);
  const area = w * h;
  if (!Number.isFinite(area) || area <= 0) return SCALE_CANDIDATES[0];
  return SCALE_CANDIDATES.find((scale) => area * scale * scale <= limit) ?? 1;
}

/** Reads the capabilities of the browser this is running in. */
export function detectCapabilities(file?: File): DeliveryCapabilities {
  if (typeof navigator === "undefined") {
    return { canShareFiles: false, honorsAnchorDownload: true };
  }
  let canShareFiles = false;
  try {
    canShareFiles = !!file && !!navigator.canShare?.({ files: [file] });
  } catch {
    // Some engines throw on an unsupported payload rather than returning false.
    canShareFiles = false;
  }
  return {
    canShareFiles,
    honorsAnchorDownload: honorsAnchorDownload(navigator.userAgent, navigator.maxTouchPoints),
  };
}

/**
 * Delivers `blob` as `filename`, by whichever route this browser supports.
 * Returns the route taken so the caller can word its own message.
 */
export async function deliverFile(blob: Blob, filename: string): Promise<DeliveryMethod> {
  const file = new File([blob], filename, { type: blob.type || "application/pdf" });
  const method = chooseDelivery(detectCapabilities(file));

  if (method === "share") {
    try {
      await navigator.share({ files: [file], title: filename });
      return "share";
    } catch (e) {
      // A cancelled sheet is not a failure and must not fall through to a
      // second attempt, which would look like the app ignoring the dismissal.
      if (e instanceof DOMException && e.name === "AbortError") return "share";
      // Anything else (a browser that advertises canShare but refuses the
      // payload) falls back rather than stranding the file.
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    if (method === "download" || method === "share") {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      return "download";
    }
    // Last resort: hand it to the browser's own viewer, which carries a share
    // button of its own. `_blank` may be blocked if this is not inside the
    // gesture that started the render, so fall back to the current tab.
    const opened = window.open(url, "_blank");
    if (!opened) window.location.href = url;
    return "open";
  } finally {
    // Revoking immediately cancels an in-flight download in some engines; one
    // turn of the event loop is enough for the click or the open to take hold.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
