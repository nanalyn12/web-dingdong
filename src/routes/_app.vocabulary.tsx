import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  BookOpen,
  Filter as FilterIcon,
  Play,
  Search as SearchIcon,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useZhTts } from "@/lib/use-zh-tts";
import { cn } from "@/lib/utils";
import { srsStatus, daysUntilDue } from "@/lib/vocab-srs";
import { useVocabStore } from "@/hooks/use-vocab-store";
import { VocabTagEditor } from "@/components/vocab-tag-editor";
import { VocabPracticeDialog } from "@/components/vocab-practice-dialog";
import type { VocabItem } from "@/lib/vocab";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  tag: fallback(z.string(), "").default(""),
  hsk: fallback(z.enum(["all", "1", "2", "3", "4", "5", "6"]), "all").default("all"),
  status: fallback(z.enum(["all", "new", "due", "learning", "learned"]), "all").default("all"),
  sort: fallback(z.enum(["recent", "due", "hsk"]), "recent").default("recent"),
});

export const Route = createFileRoute("/_app/vocabulary")({
  head: () => ({
    meta: [
      { title: "단어장 — DingDong" },
      { name: "description", content: "저장한 중국어 단어를 태그·복습 큐로 관리하세요." },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  component: VocabularyPage,
});

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  new: { text: "🆕 신규", cls: "bg-sky-100 text-sky-700 border-sky-200" },
  due: { text: "🔔 오늘", cls: "bg-rose-100 text-rose-700 border-rose-200" },
  learning: { text: "⏳ 진행중", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  learned: { text: "✅ 암기", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
};

function VocabularyPage() {
  const store = useVocabStore();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/vocabulary" });
  const now = new Date();

  const filtered = useMemo(() => {
    const q = search.q.trim().toLowerCase();
    const arr = store.items.filter((v) => {
      if (q) {
        const hay = `${v.zh} ${v.pinyin ?? ""} ${v.ko ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (search.tag && !(v.tags ?? []).includes(search.tag)) return false;
      if (search.hsk !== "all" && String(v.hsk ?? "") !== search.hsk) return false;
      if (search.status !== "all" && srsStatus(v.srs, now) !== search.status) return false;
      return true;
    });
    arr.sort((a, b) => {
      if (search.sort === "due") {
        const ad = a.srs?.dueAt ?? a.created_at;
        const bd = b.srs?.dueAt ?? b.created_at;
        return ad.localeCompare(bd);
      }
      if (search.sort === "hsk") {
        return (a.hsk ?? 99) - (b.hsk ?? 99);
      }
      return b.created_at.localeCompare(a.created_at);
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.items, search.q, search.tag, search.hsk, search.status, search.sort]);

  const counts = useMemo(() => {
    let due = 0, fresh = 0, learned = 0;
    for (const v of store.items) {
      const s = srsStatus(v.srs, now);
      if (s === "due") due++;
      else if (s === "new") fresh++;
      else if (s === "learned") learned++;
    }
    // Today's session is what the review page actually studies under scope
    // "due": words due again plus brand-new words being introduced. Counting
    // only `due` here left the button dead for anyone who had just started
    // saving words — every word is "new" until first reviewed.
    return { due, fresh, learned, today: due + fresh };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.items]);

  const setSearch = (patch: Partial<z.infer<typeof searchSchema>>) =>
    navigate({ search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, ...patch }) });


  const activeFilters =
    (search.tag ? 1 : 0) + (search.hsk !== "all" ? 1 : 0) + (search.status !== "all" ? 1 : 0);

  if (store.loading) {
    return (
      <section className="glass rounded-3xl p-8">
        <p className="text-muted-foreground">불러오는 중...</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <header className="glass rounded-3xl p-5 sm:p-6 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <BookOpen className="size-7 text-primary" /> 단어장
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            총 <b>{store.items.length}</b>개 · 복습 예정 <b className="text-rose-500">{counts.due}</b> · 신규 <b>{counts.fresh}</b> · 암기 <b className="text-emerald-600">{counts.learned}</b>
            {store.authed === false && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-semibold">
                게스트 — 이 브라우저에만 저장
              </span>
            )}
          </p>
        </div>
        <Button asChild disabled={counts.today === 0} size="lg" className="gap-2">
          <Link
            to="/vocabulary/review"
            search={{ mode: "flash", scope: "due", limit: 20 }}
          >
            <Play className="size-4" />
            오늘 복습 {counts.today > 0 && `(${counts.today})`}
          </Link>
        </Button>
      </header>

      <div className="glass rounded-3xl p-4 flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-[180px] rounded-xl bg-white/70 px-3 py-1.5">
          <SearchIcon className="size-4 opacity-50" />
          <Input
            value={search.q}
            onChange={(e) => setSearch({ q: e.target.value })}
            placeholder="한자·병음·뜻 검색…"
            className="border-0 bg-transparent shadow-none focus-visible:ring-0 h-8 text-sm px-0"
          />
          {search.q && (
            <button
              className="size-6 grid place-items-center rounded-full hover:bg-white/60"
              onClick={() => setSearch({ q: "" })}
            >
              <X className="size-3" />
            </button>
          )}
        </div>
        <Select value={search.status} onValueChange={(v) => setSearch({ status: v as never })}>
          <SelectTrigger className="w-32 h-9 text-xs">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">상태: 전체</SelectItem>
            <SelectItem value="due">🔔 오늘</SelectItem>
            <SelectItem value="new">🆕 신규</SelectItem>
            <SelectItem value="learning">⏳ 진행중</SelectItem>
            <SelectItem value="learned">✅ 암기</SelectItem>
          </SelectContent>
        </Select>
        <Select value={search.hsk} onValueChange={(v) => setSearch({ hsk: v as never })}>
          <SelectTrigger className="w-24 h-9 text-xs">
            <SelectValue placeholder="HSK" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">HSK 전체</SelectItem>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <SelectItem key={n} value={String(n)}>HSK {n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={search.sort} onValueChange={(v) => setSearch({ sort: v as never })}>
          <SelectTrigger className="w-28 h-9 text-xs">
            <SelectValue placeholder="정렬" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">최근 추가</SelectItem>
            <SelectItem value="due">복습 예정</SelectItem>
            <SelectItem value="hsk">HSK 순</SelectItem>
          </SelectContent>
        </Select>
        {activeFilters > 0 && (
          <button
            onClick={() => setSearch({ tag: "", hsk: "all", status: "all" })}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <FilterIcon className="size-3" /> 필터 초기화
          </button>
        )}
      </div>

      {store.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1">
          <button
            onClick={() => setSearch({ tag: "" })}
            className={cn(
              "rounded-full px-3 py-1 text-[11px] border cursor-pointer",
              !search.tag
                ? "border-primary bg-primary text-primary-foreground"
                : "border-slate-200 bg-white/70 text-slate-600 hover:bg-white",
            )}
          >
            모든 태그
          </button>
          {store.tags.map((t) => (
            <button
              key={t}
              onClick={() => setSearch({ tag: t === search.tag ? "" : t })}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] border cursor-pointer",
                search.tag === t
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-slate-200 bg-white/70 text-slate-600 hover:bg-white",
              )}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="glass rounded-3xl p-10 text-center text-sm text-muted-foreground">
          {store.items.length === 0
            ? "아직 저장된 단어가 없어요. 강의·노래·드라마에서 단어를 저장해보세요."
            : "조건에 맞는 단어가 없어요."}
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => (
            <VocabCard
              key={v.id}
              v={v}
              allTags={store.tags}
              onDelete={() => store.deleteByZh(v.zh)}
              onSetTags={(t) => store.setTagsById(v.id, t)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function VocabCard({
  v,
  allTags,
  onDelete,
  onSetTags,
}: {
  v: VocabItem;
  allTags: string[];
  onDelete: () => void;
  onSetTags: (tags: string[]) => void | Promise<void>;
}) {
  const { speak, speakingId } = useZhTts();
  const [practice, setPractice] = useState(false);
  const status = srsStatus(v.srs);
  const days = daysUntilDue(v.srs);
  const badge = STATUS_LABEL[status];
  return (
    <div className="group p-4 bg-white/85 hover:bg-white rounded-3xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_-12px_rgba(244,114,182,0.2)] transition-all">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => setPractice(true)}
          className="shrink-0 size-12 rounded-2xl flex items-center justify-center text-2xl bg-gradient-to-br from-white to-slate-50 border border-white shadow-inner hover:scale-110 transition-transform cursor-pointer"
          aria-label="AI 학습 열기"
        >
          {v.emoji || "📝"}
        </button>
        <button
          type="button"
          onClick={() => setPractice(true)}
          className="min-w-0 flex-1 text-left cursor-pointer"
        >
          <p className="text-xl font-semibold text-slate-900 leading-tight" lang="zh-CN">
            {v.zh}
          </p>
          {v.pinyin && <p className="text-xs italic text-slate-500 mt-0.5">{v.pinyin}</p>}
          {v.ko && <p className="text-sm text-slate-700 mt-1">{v.ko}</p>}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
          aria-label="삭제"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="mt-3 flex items-center flex-wrap gap-1.5">
        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold", badge.cls)}>
          {badge.text}
          {status === "learning" && days > 0 && ` · ${days}일 후`}
        </span>
        {v.hsk && (
          <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[10px]">
            HSK {v.hsk}
          </span>
        )}
        {(v.tags ?? []).map((t) => (
          <span key={t} className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px]">#{t}</span>
        ))}
        <VocabTagEditor
          tags={v.tags ?? []}
          allTags={allTags}
          onChange={onSetTags}
          compact
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => speak(v.zh, v.zh)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 px-2.5 py-1 text-[11px] cursor-pointer",
            speakingId === v.zh && "animate-pulse bg-primary/30",
          )}
        >
          <Volume2 className="size-3" /> 듣기
        </button>
        <button
          type="button"
          onClick={() => setPractice(true)}
          className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-rose-400 to-pink-400 text-white px-3 py-1 text-[11px] font-bold shadow-sm hover:shadow-md transition-shadow cursor-pointer"
        >
          <Sparkles className="size-3" /> AI 학습
        </button>
      </div>

      <VocabPracticeDialog
        word={practice ? v : null}
        open={practice}
        onOpenChange={(o) => setPractice(o)}
      />
    </div>
  );
}
