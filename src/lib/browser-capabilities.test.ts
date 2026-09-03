import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect, afterEach } from "vitest";

import { notificationPermission, supportsWebPush } from "./browser-capabilities";

/*
 * iOS Safari has no `Notification` binding at all unless the site is running as
 * an installed PWA. The push manager read it as `Notification?.permission`,
 * which looks defensive and is not: optional chaining guards a null *value*,
 * never a missing *declaration*. Evaluating the identifier threw
 * `ReferenceError: Can't find variable: Notification` and took down the whole
 * app through the root error boundary — but only after sign-in, because the
 * effect holding it returns early for signed-out visitors. That is why it
 * looked like a broken login.
 *
 * The node test environment has no `Notification` either, so the absent case
 * below is the real thing rather than a simulation of it.
 */

const g = globalThis as Record<string, unknown>;

afterEach(() => {
  delete g.Notification;
  delete g.PushManager;
  delete g.ServiceWorkerRegistration;
});

describe("notificationPermission", () => {
  it("returns null instead of throwing where the API does not exist", () => {
    expect("Notification" in globalThis).toBe(false);
    expect(() => notificationPermission()).not.toThrow();
    expect(notificationPermission()).toBeNull();
  });

  it("reports the permission where the API does exist", () => {
    g.Notification = { permission: "granted" };
    expect(notificationPermission()).toBe("granted");
    g.Notification = { permission: "default" };
    expect(notificationPermission()).toBe("default");
  });

  it("treats a present but malformed API as unknown", () => {
    g.Notification = {};
    expect(notificationPermission()).toBeNull();
  });
});

describe("supportsWebPush", () => {
  it("is false when any of the three pieces is missing", () => {
    expect(supportsWebPush()).toBe(false);
    g.Notification = { permission: "default" };
    expect(supportsWebPush()).toBe(false);
    g.PushManager = {};
    expect(supportsWebPush()).toBe(false);
  });

  it("is true only with notifications, push and a service worker together", () => {
    g.Notification = { permission: "default" };
    g.PushManager = {};
    g.ServiceWorkerRegistration = {};
    expect(supportsWebPush()).toBe(true);
  });
});

/* ── 소스 가드 ─────────────────────────────────────────────────────────── */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const REPO = fileURLToPath(new URL("../..", import.meta.url));

function sourceFiles(dir = SRC): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

function locate(file: string, source: string, index: number): string {
  const rel = file.slice(REPO.length).split(sep).join("/");
  return `${rel}:${source.slice(0, index).split("\n").length}`;
}

describe("browser-only globals", () => {
  // A bare `Notification` or `PushManager` is a ReferenceError on any engine
  // that does not ship it — `?.` does not help, which is exactly how this one
  // shipped. Reaching them through `window.` is safe because `window` itself
  // is always declared in a browser.
  it("never names a browser-only global as a bare identifier", () => {
    const BARE = /(?<![.\w$"'`])\b(Notification|PushManager)\s*\??\./g;
    const offenders: string[] = [];
    for (const path of sourceFiles()) {
      // The capability module is where the guarded lookup lives.
      if (path.endsWith(join("lib", "browser-capabilities.ts"))) continue;
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(BARE)) {
        offenders.push(`${locate(path, source, match.index)} → ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
