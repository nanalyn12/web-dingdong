import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Film, Loader2, Music, NotebookPen, Search } from "lucide-react";

import { searchContent, type SearchHit } from "@/lib/search.functions";

const TYPE_META: Record<SearchHit["type"], { label: string; icon: typeof BookOpen }> = {
  lesson: { label: "레슨", icon: BookOpen },
  drama: { label: "영상 학습", icon: Film },
  song: { label: "학습송", icon: Music },
  vocab: { label: "내 단어장", icon: NotebookPen },
};

/** Debounce a rapidly-changing value. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function HeaderSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(q.trim(), 220);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => searchContent({ data: { q: debounced } }),
    enabled: debounced.length >= 1,
    staleTime: 30_000,
  });

  // Flat list of hits (in display order) for keyboard navigation.
  const flat = useMemo(() => {
    if (!data) return [] as SearchHit[];
    return [...data.lessons, ...data.dramas, ...data.songs, ...data.vocab];
  }, [data]);
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [debounced]);

  // Close on outside click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function go(hit: SearchHit) {
    setOpen(false);
    setQ("");
    if (hit.type === "lesson") navigate({ to: "/lessons/$id", params: { id: hit.id } });
    else if (hit.type === "drama") navigate({ to: "/dramas/$id", params: { id: hit.id } });
    else if (hit.type === "song") navigate({ to: "/songs/$id", params: { id: hit.id } });
    else navigate({ to: "/vocabulary" });
  }

  const showPanel = open && debounced.length >= 1;

  return (
    // min-w-0 lets this shrink first when the header runs out of room, instead
    // of pushing the buttons beside it down to one character per line.
    <div ref={boxRef} className="relative flex-1 min-w-0 max-w-md">
      <div className="flex items-center gap-2 rounded-2xl bg-white/40 px-3 py-2">
        <Search className="size-4 text-muted-foreground shrink-0" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, flat.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && flat[active]) {
              e.preventDefault();
              go(flat[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="레슨, 영상, 노래, 단어 검색…"
          className="bg-transparent outline-none text-sm flex-1 placeholder:text-muted-foreground"
        />
        {isFetching && showPanel && (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground shrink-0" />
        )}
      </div>

      {showPanel && (
        <div className="absolute left-0 right-0 top-full mt-2 glass rounded-2xl border border-white/60 shadow-lg p-2 max-h-[70vh] overflow-y-auto z-50">
          {!data || data.total === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {isFetching ? "검색 중…" : `"${debounced}" 결과가 없어요.`}
            </p>
          ) : (
            (["lesson", "drama", "song", "vocab"] as const).map((type) => {
              const hits =
                type === "lesson"
                  ? data.lessons
                  : type === "drama"
                    ? data.dramas
                    : type === "song"
                      ? data.songs
                      : data.vocab;
              if (hits.length === 0) return null;
              const Meta = TYPE_META[type];
              return (
                <div key={type} className="mb-1 last:mb-0">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {Meta.label}
                  </div>
                  {hits.map((hit) => {
                    const idx = flat.indexOf(hit);
                    const Icon = Meta.icon;
                    return (
                      <button
                        key={`${hit.type}-${hit.id}`}
                        type="button"
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => go(hit)}
                        className={[
                          "w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition",
                          idx === active ? "bg-white/70" : "hover:bg-white/50",
                        ].join(" ")}
                      >
                        <Icon className="size-4 text-primary shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm truncate">{hit.title}</span>
                          {hit.subtitle && (
                            <span className="block text-[11px] text-muted-foreground truncate">
                              {hit.subtitle}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
