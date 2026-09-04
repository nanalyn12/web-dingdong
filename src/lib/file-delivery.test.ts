import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import {
  IOS_CANVAS_PIXEL_LIMIT,
  chooseDelivery,
  honorsAnchorDownload,
  safeCanvasScale,
} from "./file-delivery";

/*
 * Batch 12 — saving the study report as a PDF did nothing on a phone.
 *
 * `html2pdf().save()` ends up in jsPDF's save path, which sets `.download` on
 * an anchor and clicks it. iOS Safari ignores that attribute for `blob:` URLs,
 * so the tap produced no file and no error.
 *
 * The part that makes this worth a module: it cannot be feature-detected.
 * `"download" in document.createElement("a")` is true on iOS Safari — the
 * property exists and is disregarded. Detection has to read the user agent,
 * which is exactly the kind of decision worth pinning down in a pure function
 * rather than leaving inline in a click handler.
 */

const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  ipod: "Mozilla/5.0 (iPod touch; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  // iOS Chrome and Firefox are WebKit underneath and inherit the same refusal.
  iosChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  desktopSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
};

describe("honorsAnchorDownload", () => {
  // L1-2
  it("says no for every iOS engine", () => {
    for (const ua of [UA.iphone, UA.ipad, UA.ipod, UA.iosChrome]) {
      expect(honorsAnchorDownload(ua), ua.slice(0, 40)).toBe(false);
    }
  });

  it("says yes everywhere the attribute actually works", () => {
    for (const ua of [UA.androidChrome, UA.desktopChrome, UA.firefox]) {
      expect(honorsAnchorDownload(ua), ua.slice(0, 40)).toBe(true);
    }
  });

  // iPadOS reports a Macintosh UA. It is told apart by having a touch screen,
  // which the caller passes in — the string alone cannot decide it.
  it("treats a Macintosh UA with touch points as iPadOS", () => {
    expect(honorsAnchorDownload(UA.desktopSafari, 0)).toBe(true);
    expect(honorsAnchorDownload(UA.desktopSafari, 5)).toBe(false);
  });

  it("does not throw on a missing or empty user agent", () => {
    expect(() => honorsAnchorDownload("")).not.toThrow();
    expect(() => honorsAnchorDownload(undefined)).not.toThrow();
    // Unknown means "assume it works" — the download path is the common one.
    expect(honorsAnchorDownload("")).toBe(true);
  });
});

describe("chooseDelivery", () => {
  // L1-1
  it("prefers the share sheet when files can be shared", () => {
    expect(chooseDelivery({ canShareFiles: true, honorsAnchorDownload: true })).toBe("share");
    expect(chooseDelivery({ canShareFiles: true, honorsAnchorDownload: false })).toBe("share");
  });

  it("falls back to a download when sharing is unavailable", () => {
    expect(chooseDelivery({ canShareFiles: false, honorsAnchorDownload: true })).toBe("download");
  });

  // Older iOS: no file sharing, and the download attribute is ignored. Opening
  // the blob hands the viewer to Safari's PDF reader, which has its own share
  // button — not silent failure, which is what shipped.
  it("opens the file when neither path is available", () => {
    expect(chooseDelivery({ canShareFiles: false, honorsAnchorDownload: false })).toBe("open");
  });
});

describe("safeCanvasScale", () => {
  // L1-3 — html2canvas renders at `scale`, and iOS Safari silently hands back
  // a blank canvas past its pixel ceiling, which produces an empty PDF rather
  // than an error.
  it("keeps the full scale for a short report", () => {
    expect(safeCanvasScale(720, 1000)).toBe(2);
  });

  it("steps down rather than exceeding the ceiling", () => {
    const tall = safeCanvasScale(720, 8000);
    expect(tall).toBeLessThan(2);
    expect(720 * tall * (8000 * tall)).toBeLessThanOrEqual(IOS_CANVAS_PIXEL_LIMIT);
  });

  it("never goes above 2 or below 1", () => {
    for (const height of [1, 500, 5000, 20_000, 200_000]) {
      const scale = safeCanvasScale(720, height);
      expect(scale).toBeLessThanOrEqual(2);
      expect(scale).toBeGreaterThanOrEqual(1);
    }
  });

  it("does not throw on degenerate sizes", () => {
    for (const [w, h] of [
      [0, 0],
      [-1, 100],
      [720, 0],
    ]) {
      expect(() => safeCanvasScale(w, h)).not.toThrow();
    }
  });
});

/* ── 소스 가드 ─────────────────────────────────────────────────────────── */

/** Comments explain the fix and name the call it replaced; only code counts. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const BUTTONS = ["lesson-pdf-button.tsx", "curriculum-pdf-button.tsx"].map((name) => {
  const source = readFileSync(
    fileURLToPath(new URL(`../components/${name}`, import.meta.url)),
    "utf8",
  );
  return { name, source, code: stripComments(source) };
});

describe("both PDF buttons", () => {
  // L1-4 — the bug lived in one line duplicated across two files. Fixing the
  // one the report came from would have left the other broken.
  it("no longer calls the save() path that iOS ignores", () => {
    for (const { name, code } of BUTTONS) {
      expect(/\.save\(\)/.test(code), `${name} still calls .save()`).toBe(false);
    }
  });

  // L1-7 — html2canvas 1.4.1, which html2pdf.js bundles, throws outright on
  // `oklch()`, and this design system states every colour that way. The render
  // died before a file existed, on every platform — it only looked like a phone
  // problem because the old save() path failed without saying so. Neutralising
  // the colours in the clone stopped the exception and produced a blank canvas
  // instead, so the renderer itself had to go.
  it("no longer depends on the renderer that cannot read oklch", () => {
    for (const { name, code } of BUTTONS) {
      expect(/html2pdf/.test(code), `${name} still imports html2pdf.js`).toBe(false);
    }
  });

  it("renders through the shared report renderer", () => {
    for (const { name, code } of BUTTONS) {
      expect(/renderElementToPdfBlob/.test(code), `${name} does not use it`).toBe(true);
    }
  });

  it("routes through the shared delivery helper", () => {
    for (const { name, source } of BUTTONS) {
      expect(source.includes("@/lib/file-delivery"), `${name} does not import it`).toBe(true);
    }
  });

  // L1-5 — curriculum removed its container inside the try, after an await, so
  // a failed render left the report visible on the page.
  it("removes the off-screen container in a finally block", () => {
    for (const { name, code } of BUTTONS) {
      const finallyBlock = /finally\s*\{([\s\S]*?)\n\s{4}\}/.exec(code)?.[1] ?? "";
      expect(/remove/.test(finallyBlock), `${name} does not clean up in finally`).toBe(true);
    }
  });
});
