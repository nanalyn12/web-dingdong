import { driver, type DriveStep, type Config } from "driver.js";
import "driver.js/dist/driver.css";

const KO_LABELS: Partial<Config> = {
  nextBtnText: "다음 →",
  prevBtnText: "← 이전",
  doneBtnText: "완료 🎉",
  progressText: "{{current}} / {{total}}",
  showProgress: true,
  smoothScroll: true,
  allowClose: true,
  overlayOpacity: 0.55,
  stagePadding: 6,
  stageRadius: 18,
  popoverClass: "dingdong-coach",
};

export type TourName = "landing" | "sidebar" | "courses" | "dingdong";

const KEY = (n: TourName) => `dingdong:tour:${n}:v1:done`;

export function isTourDone(name: TourName): boolean {
  if (typeof window === "undefined") return true;
  return !!window.localStorage.getItem(KEY(name));
}

export function markTourDone(name: TourName) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY(name), "1");
}

export function resetTour(name: TourName) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY(name));
}

export function runTour(name: TourName, steps: DriveStep[], opts: { force?: boolean } = {}) {
  if (typeof window === "undefined") return;
  if (!opts.force && isTourDone(name)) return;
  // Filter out steps whose targets don't exist yet
  const valid = steps.filter((s) => {
    if (!s.element) return true;
    if (typeof s.element === "string") {
      return !!document.querySelector(s.element);
    }
    return true;
  });
  if (valid.length === 0) return;
  const d = driver({
    ...KO_LABELS,
    steps: valid,
    onDestroyed: () => markTourDone(name),
  });
  // Small delay so DOM/animations settle
  setTimeout(() => d.drive(), 250);
}
