import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, RotateCcw, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { LyricLine } from "@/lib/songs.functions";

// Manual karaoke authoring: play the song and stamp the playhead onto each
// line as it is sung. This is the only sync route for curated (YouTube) songs
// — there is no Suno task to force-align against, and this video has no
// Chinese caption track to borrow timings from.

function isSectionHeader(text: string | null | undefined): boolean {
  return !!text && /^\s*\[[^\]]+\]\s*$/.test(text);
}

function fmt(sec: number | null): string {
  if (sec === null) return "--:--";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

export function TapSyncPanel({
  lyrics,
  currentTime,
  isPlaying,
  onSeek,
  onPlayPause,
  onSave,
  onClose,
  saving,
}: {
  lyrics: LyricLine[];
  currentTime: number;
  isPlaying: boolean;
  onSeek: (t: number) => void;
  onPlayPause: () => void;
  onSave: (times: (number | null)[]) => void;
  onClose: () => void;
  saving: boolean;
}) {
  // Section headers are never sung, so they are not tap targets and always
  // save as null.
  const tappable = useMemo(
    () =>
      lyrics
        .map((l, i) => ({ i, header: isSectionHeader(l.zh) }))
        .filter((x) => !x.header)
        .map((x) => x.i),
    [lyrics],
  );

  const [times, setTimes] = useState<(number | null)[]>(() =>
    lyrics.map((l) => (typeof l.time === "number" ? l.time : null)),
  );
  const [cursor, setCursor] = useState(0); // index into `tappable`

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const idx = tappable[cursor];
    if (idx === undefined || !listRef.current) return;
    listRef.current
      .querySelector<HTMLElement>(`[data-tap="${idx}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [cursor, tappable]);

  const done = cursor >= tappable.length;

  const tap = useCallback(() => {
    if (done) return;
    const lineIdx = tappable[cursor];
    setTimes((prev) => {
      const next = [...prev];
      next[lineIdx] = Math.max(0, currentTime);
      return next;
    });
    setCursor((c) => c + 1);
  }, [cursor, currentTime, done, tappable]);

  const undo = useCallback(() => {
    setCursor((c) => {
      const back = Math.max(0, c - 1);
      const lineIdx = tappable[back];
      if (lineIdx !== undefined) {
        setTimes((prev) => {
          const next = [...prev];
          next[lineIdx] = null;
          return next;
        });
      }
      return back;
    });
  }, [tappable]);

  const restart = useCallback(() => {
    setTimes(lyrics.map(() => null));
    setCursor(0);
    onSeek(0);
  }, [lyrics, onSeek]);

  // Space taps, Backspace undoes, Enter toggles playback. Ignore repeats so a
  // held key does not stamp a burst of near-identical times.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.repeat) return;
      if (e.code === "Space") {
        e.preventDefault();
        tap();
      } else if (e.code === "Backspace") {
        e.preventDefault();
        undo();
      } else if (e.code === "Enter") {
        e.preventDefault();
        onPlayPause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tap, undo, onPlayPause]);

  const stamped = times.filter((t) => t !== null).length;

  return (
    <section className="glass rounded-3xl p-5 space-y-4 ring-2 ring-primary/40">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-lg">🎤 탭 싱크</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            노래를 재생하고 각 줄이 시작될 때마다{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-white/70 border text-[10px] font-mono">
              Space
            </kbd>
            를 누르세요. 되돌리기{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-white/70 border text-[10px] font-mono">
              Backspace
            </kbd>
            , 재생/정지{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-white/70 border text-[10px] font-mono">
              Enter
            </kbd>
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="닫기">
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="font-mono text-2xl tabular-nums font-bold text-primary">
          {fmt(currentTime)}
        </div>
        <Button
          size="lg"
          onClick={tap}
          disabled={done}
          className="flex-1 min-w-40 h-14 text-base font-bold gradient-primary text-primary-foreground"
        >
          {done ? "모든 줄 완료 ✅" : `이 줄 찍기 (${cursor + 1}/${tappable.length})`}
        </Button>
        <Button size="sm" variant="outline" onClick={onPlayPause}>
          {isPlaying ? "일시정지" : "재생"}
        </Button>
        <Button size="sm" variant="outline" onClick={undo} disabled={cursor === 0}>
          <Undo2 className="size-4 mr-1" /> 되돌리기
        </Button>
        <Button size="sm" variant="ghost" onClick={restart}>
          <RotateCcw className="size-4 mr-1" /> 처음부터
        </Button>
      </div>

      <div
        ref={listRef}
        className="max-h-[40vh] overflow-y-auto pr-1 space-y-1 rounded-2xl bg-white/40 p-2"
      >
        {lyrics.map((l, i) => {
          const header = isSectionHeader(l.zh);
          const isNext = !done && tappable[cursor] === i;
          const t = times[i];
          return (
            <div
              key={i}
              data-tap={i}
              className={[
                "flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm transition-colors",
                isNext ? "bg-primary/15 ring-1 ring-primary/40" : "",
                header ? "opacity-50" : "",
              ].join(" ")}
            >
              <span
                className={[
                  "font-mono text-[11px] tabular-nums w-14 shrink-0",
                  t !== null ? "text-primary font-semibold" : "text-muted-foreground",
                ].join(" ")}
              >
                {header ? "—" : fmt(t)}
              </span>
              <span className="flex-1 truncate">
                {header ? l.zh.replace(/^\s*\[|\]\s*$/g, "") : l.zh}
              </span>
              {t !== null && !header && (
                <button
                  onClick={() => onSeek(t)}
                  className="text-[10px] text-primary hover:underline shrink-0"
                >
                  듣기
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs text-muted-foreground">
          {stamped}/{tappable.length}줄 기록됨
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button size="sm" onClick={() => onSave(times)} disabled={saving || stamped === 0}>
            <Check className="size-4 mr-1" />
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </div>
    </section>
  );
}
