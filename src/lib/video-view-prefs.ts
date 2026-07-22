import { useCallback, useEffect, useState } from "react";

// How large the drama video is and whether it stays pinned while scrolling.
// Both are reader comfort settings, so they persist per browser rather than
// per account — a learner on a small laptop wants a small player everywhere.

export type VideoSize = "sm" | "md" | "lg";

export const VIDEO_SIZES: { key: VideoSize; label: string }[] = [
  { key: "sm", label: "작게" },
  { key: "md", label: "보통" },
  { key: "lg", label: "크게" },
];

export const VIDEO_SIZE_CLASS: Record<VideoSize, string> = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-none",
};

const SIZE_KEY = "dd.video.size";
const PIN_KEY = "dd.video.pinned";

function isVideoSize(v: string | null): v is VideoSize {
  return v === "sm" || v === "md" || v === "lg";
}

export function useVideoViewPrefs() {
  // Start at the SSR-safe defaults and adopt the stored values after mount,
  // otherwise the server and client markup disagree on first paint.
  const [size, setSizeState] = useState<VideoSize>("md");
  const [pinned, setPinnedState] = useState(false);

  useEffect(() => {
    try {
      const s = localStorage.getItem(SIZE_KEY);
      if (isVideoSize(s)) setSizeState(s);
      setPinnedState(localStorage.getItem(PIN_KEY) === "1");
    } catch {
      // Private mode or blocked storage — defaults are fine.
    }
  }, []);

  const setSize = useCallback((v: VideoSize) => {
    setSizeState(v);
    try {
      localStorage.setItem(SIZE_KEY, v);
    } catch {
      /* ignore */
    }
  }, []);

  const setPinned = useCallback((v: boolean) => {
    setPinnedState(v);
    try {
      localStorage.setItem(PIN_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  return { size, setSize, pinned, setPinned };
}
