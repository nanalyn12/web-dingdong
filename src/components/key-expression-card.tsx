import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookmarkPlus, BookmarkCheck, Mic, Volume2, Check, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import {
  addGuestVocab,
  guessEmoji,
  loadGuestVocab,
  scorePronunciation,
} from "@/lib/vocab";
import { hasVocabZh, saveVocabulary } from "@/lib/vocab.functions";
import { VocabPracticeDialog } from "@/components/vocab-practice-dialog";

type KeyExpression = {
  zh: string;
  pinyin?: string;
  ko: string;
  hsk?: number;
  emoji?: string;
};

type Tone = {
  tag: string;
  hover: string;
  pin: string;
  ring: string;
};

/* ----- Web Speech typings (minimal) ----- */
type SR = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getRecognition(): SR | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;
  if (!Ctor) return null;
  const r: SR = new Ctor();
  r.lang = "zh-CN";
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.continuous = false;
  return r;
}

export function KeyExpressionCard({
  k,
  index,
  tone,
  lessonId,
  speak,
  speaking,
}: {
  k: KeyExpression;
  index: number;
  tone: Tone;
  lessonId: string;
  speak: (text: string, id?: string) => void;
  speaking: boolean;
}) {
  const emoji = k.emoji || guessEmoji(k.zh, k.ko);
  const callSave = useServerFn(saveVocabulary);
  const callHasVocab = useServerFn(hasVocabZh);

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await authClient.getSession();
      if (!alive) return;
      const user = data?.user ?? null;
      setAuthed(!!user);
      if (!user) {
        setSaved(loadGuestVocab().some((v) => v.zh === k.zh));
      } else {
        try {
          const res = await callHasVocab({ data: { zh: k.zh } });
          if (alive) setSaved(!!res?.saved);
        } catch {
          // non-fatal — leave as unsaved
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [k.zh]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (authed) {
        await callSave({
          data: {
            zh: k.zh,
            pinyin: k.pinyin ?? null,
            ko: k.ko ?? null,
            hsk: k.hsk ?? null,
            emoji,
            lesson_id: lessonId,
          },
        });
      } else {
        addGuestVocab({
          zh: k.zh,
          pinyin: k.pinyin ?? null,
          ko: k.ko ?? null,
          hsk: k.hsk ?? null,
          emoji,
          lesson_id: lessonId,
        });
      }
    },
    onSuccess: () => setSaved(true),
  });

  /* ---------- Pronunciation test ---------- */
  const recRef = useRef<SR | null>(null);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function startTest() {
    setErr(null);
    setHeard(null);
    setScore(null);
    const rec = getRecognition();
    if (!rec) {
      setErr("이 브라우저는 음성 인식을 지원하지 않아요. (Chrome 권장)");
      return;
    }
    recRef.current = rec;
    rec.onresult = (e: any) => {
      const transcript = e?.results?.[0]?.[0]?.transcript ?? "";
      setHeard(transcript);
      setScore(scorePronunciation(k.zh, transcript));
    };
    rec.onerror = (e: any) => {
      setErr(
        e?.error === "not-allowed"
          ? "마이크 권한이 필요해요."
          : "다시 시도해주세요.",
      );
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  function stopTest() {
    recRef.current?.stop();
    setListening(false);
  }

  useEffect(() => () => recRef.current?.abort?.(), []);

  const pct = score == null ? null : Math.round(score * 100);
  const pass = pct != null && pct >= 70;

  return (
    <div
      className={cn(
        "group relative p-5 bg-white/85 hover:bg-white transition-all duration-300 rounded-3xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)]",
        tone.hover,
      )}
    >
      {/* Header row */}
      <div className="flex justify-between items-start mb-3 gap-2">
        <span
          className={cn(
            "px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full border",
            tone.tag,
          )}
        >
          EXPRESSION {String(index + 1).padStart(2, "0")}
        </span>
        <div className="flex items-center gap-1.5">
          {k.hsk !== undefined && (
            <span className="px-2 py-0.5 text-[10px] font-bold text-slate-500 bg-slate-100 rounded-full">
              HSK {k.hsk}
            </span>
          )}
          <button
            type="button"
            onClick={() => setPracticeOpen(true)}
            className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-rose-400 to-pink-400 text-white px-2 py-0.5 text-[10px] font-bold shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            aria-label="AI 학습"
          >
            <Sparkles className="size-3" /> AI
          </button>
          <button
            type="button"
            onClick={() => !saved && saveMut.mutate()}
            disabled={saved || saveMut.isPending}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors",
              saved
                ? "bg-emerald-50 text-emerald-600 border-emerald-200 cursor-default"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 cursor-pointer",
            )}
            aria-label="단어장에 저장"
            title={saved ? "단어장에 저장됨" : "단어장에 저장"}
          >
            {saved ? (
              <>
                <BookmarkCheck className="size-3" /> 저장됨
              </>
            ) : (
              <>
                <BookmarkPlus className="size-3" /> 단어장
              </>
            )}
          </button>
        </div>
      </div>

      {/* Emoji + Chinese */}
      <div className="flex items-start gap-3 mb-1">
        <div
          className={cn(
            "shrink-0 size-12 sm:size-14 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl bg-gradient-to-br from-white to-slate-50 border border-white shadow-inner",
            tone.ring,
          )}
          aria-hidden
        >
          {emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p
              className="text-2xl sm:text-3xl font-semibold text-slate-900 leading-tight tracking-tight"
              lang="zh-CN"
            >
              {k.zh}
            </p>
            <button
              type="button"
              onClick={() => speak(k.zh, k.zh)}
              className={cn(
                "shrink-0 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors px-2 py-0.5 text-[11px] cursor-pointer",
                speaking && "animate-pulse bg-primary/30",
              )}
              aria-label="중국어 듣기"
            >
              <Volume2 className="size-3" /> 듣기
            </button>
          </div>
          {k.pinyin && (
            <p className={cn("text-xs font-medium italic tracking-wide mt-0.5", tone.pin)}>
              {k.pinyin}
            </p>
          )}
          <p className="text-[15px] text-slate-700 font-medium mt-1">{k.ko}</p>
        </div>
      </div>

      {/* Pronunciation test */}
      <div className="mt-4 rounded-2xl bg-slate-50/80 border border-slate-100 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            🎤 발음 테스트
          </div>
          <button
            type="button"
            onClick={listening ? stopTest : startTest}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-all cursor-pointer",
              listening
                ? "bg-rose-500 text-white shadow animate-pulse"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50",
            )}
            aria-label={listening ? "중단" : "녹음 시작"}
          >
            <Mic className="size-3.5" />
            {listening ? "듣는 중…" : "말해보기"}
          </button>
        </div>

        {err && (
          <p className="mt-2 text-[11px] text-rose-600">{err}</p>
        )}

        {heard != null && (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">들린 말:</span>
              <span className="font-medium text-slate-800" lang="zh-CN">
                {heard || "—"}
              </span>
            </div>
            {pct != null && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      pass
                        ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
                        : "bg-gradient-to-r from-amber-400 to-rose-400",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span
                  className={cn(
                    "text-xs font-bold inline-flex items-center gap-0.5",
                    pass ? "text-emerald-600" : "text-amber-600",
                  )}
                >
                  {pass ? <Check className="size-3" /> : <X className="size-3" />}
                  {pct}점
                </span>
              </div>
            )}
            <p className="text-[11px] text-slate-500">
              {pass
                ? "잘했어요! 한 번 더 또렷이 말해볼까요?"
                : "괜찮아요, 듣기 버튼을 누르고 다시 따라해보세요."}
            </p>
          </div>
        )}
      </div>

      <VocabPracticeDialog
        word={{ zh: k.zh, pinyin: k.pinyin, ko: k.ko, emoji }}
        open={practiceOpen}
        onOpenChange={setPracticeOpen}
      />
    </div>
  );
}
