import { useState } from "react";
import { Check, Plus, Tag as TagIcon, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function VocabTagEditor({
  tags,
  allTags,
  onChange,
  compact = false,
}: {
  tags: string[];
  allTags: string[];
  onChange: (next: string[]) => void | Promise<void>;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const toggle = (t: string) => {
    const has = tags.includes(t);
    const next = has ? tags.filter((x) => x !== t) : [...tags, t];
    onChange(next);
  };

  const addDraft = () => {
    const v = draft.trim();
    if (!v) return;
    if (!tags.includes(v)) onChange([...tags, v]);
    setDraft("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] md:min-h-0",
          "border-border bg-surface/70 text-muted-foreground hover:bg-surface",
        )}
        aria-label="태그 편집"
      >
        <TagIcon className="size-3" />
        {compact ? tags.length || "+" : tags.length ? `${tags.length} 태그` : "태그 추가"}
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-2 p-3">
        <div className="text-xs font-semibold text-muted-foreground">태그</div>
        <div className="flex gap-1 flex-wrap min-h-6">
          {tags.length === 0 && (
            <span className="text-[11px] text-muted-foreground/70">아직 태그가 없어요.</span>
          )}
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => toggle(t)}
              className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[11px] hover:bg-primary/25 cursor-pointer"
            >
              #{t}
              <X className="size-3" />
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="새 태그"
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addDraft();
              }
            }}
          />
          <button
            onClick={addDraft}
            className="rounded-md bg-primary text-primary-foreground px-2 grid place-items-center cursor-pointer"
            aria-label="추가"
          >
            <Plus className="size-4" />
          </button>
        </div>
        {allTags.length > 0 && (
          <>
            <div className="text-[11px] text-muted-foreground mt-2">기존 태그</div>
            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
              {allTags.map((t) => {
                const on = tags.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggle(t)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] cursor-pointer border",
                      on
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border bg-surface text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {on && <Check className="size-3" />}#{t}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
