// Drag-to-move for the 叮叮 floating button.
//
// It used to be pinned to `fixed bottom-6 right-6`, which is exactly where page
// content puts its own actions — so on the landing page it sat on top of the
// course cards' buttons with no way out. Now the learner drags it wherever they
// want, it snaps to the nearer side so it always hugs an edge instead of
// floating mid-screen, and the spot is remembered per browser.
import { useCallback, useEffect, useRef, useState } from "react";

const KEY = "dingdong:fab-pos:v1";
/** Gap kept between the button and the viewport edge. */
const MARGIN = 24;
/** Pointer travel that turns a tap into a drag (and cancels the click). */
const DRAG_THRESHOLD = 6;

export type FabSide = "left" | "right";
type Placement = { side: FabSide; y: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

function loadPlacement(): Placement | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Placement;
    if ((p.side === "left" || p.side === "right") && Number.isFinite(p.y)) return p;
  } catch {
    /* unreadable storage — fall back to the default corner */
  }
  return null;
}

export function useDraggableFab() {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  // Free position while a drag is in flight; null means "resting". Mirrored in
  // a ref because pointerup can land before React re-renders with the last
  // move — reading state there would drop a fast flick and snap it back.
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const startRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const maxY = useCallback(
    () => window.innerHeight - (ref.current?.offsetHeight ?? 64) - MARGIN,
    [],
  );

  // Restore after mount: the server has no viewport to clamp a saved spot
  // against, and applying it during render would break hydration.
  useEffect(() => {
    const saved = loadPlacement();
    if (saved) setPlacement({ side: saved.side, y: clamp(saved.y, MARGIN, maxY()) });
  }, [maxY]);

  // A remembered spot must survive the window getting shorter or narrower.
  useEffect(() => {
    const onResize = () => setPlacement((p) => (p ? { ...p, y: clamp(p.y, MARGIN, maxY()) } : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [maxY]);

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    startRef.current = { px: e.clientX, py: e.clientY, x: r.left, y: r.top };
    movedRef.current = false;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Capture is an optimization (it keeps moves coming when the pointer
      // outruns the button); dragging still works without it.
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const start = startRef.current;
    const el = ref.current;
    if (!start || !el) return;
    const dx = e.clientX - start.px;
    const dy = e.clientY - start.py;
    if (!movedRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    movedRef.current = true;
    const next = {
      x: clamp(start.x + dx, MARGIN, window.innerWidth - el.offsetWidth - MARGIN),
      y: clamp(start.y + dy, MARGIN, maxY()),
    };
    dragRef.current = next;
    setDrag(next);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (el?.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    startRef.current = null;
    const dropped = dragRef.current;
    dragRef.current = null;
    if (!movedRef.current || !dropped) {
      setDrag(null);
      return;
    }
    const width = el?.offsetWidth ?? 64;
    const side: FabSide = dropped.x + width / 2 < window.innerWidth / 2 ? "left" : "right";
    const next: Placement = { side, y: clamp(dropped.y, MARGIN, maxY()) };
    setPlacement(next);
    setDrag(null);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* private mode — the position just won't persist */
    }
    // The browser fires `click` right after this, which would open the panel
    // the learner was only trying to move. `wasDragged` swallows it, and this
    // resets the flag once that click has come and gone.
    setTimeout(() => {
      movedRef.current = false;
    }, 0);
  };

  const style: React.CSSProperties = drag
    ? { left: drag.x, top: drag.y, right: "auto", bottom: "auto" }
    : placement
      ? {
          top: placement.y,
          bottom: "auto",
          ...(placement.side === "left"
            ? { left: MARGIN, right: "auto" }
            : { right: MARGIN, left: "auto" }),
        }
      : {};

  return {
    ref,
    style,
    /** Side it is resting against — the label flips to stay on screen. */
    side: placement?.side ?? ("right" as FabSide),
    dragging: !!drag,
    /** True for the click that ends a drag, so the panel does not open. */
    wasDragged: () => movedRef.current,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
