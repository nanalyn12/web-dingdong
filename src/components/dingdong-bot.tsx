import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import { Mic, MicOff, Send, Volume2, X, MessageSquare, HelpCircle } from "lucide-react";

import { assistantChat } from "@/lib/assistant.functions";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDraggableFab } from "@/lib/use-draggable-fab";
import pandaImg from "@/assets/hero-dingdong.png";
import { FAQ_CATEGORIES, FAQ_ITEMS, type FaqCategory } from "@/lib/dingdong-faq";

// Strip markdown syntax, brackets, and emoji for natural spoken/displayed text.
function sanitizeForSpeech(raw: string): string {
  let s = raw;
  // Remove code fences and inline code
  s = s.replace(/```[\s\S]*?```/g, " ").replace(/`([^`]*)`/g, "$1");
  // Bold/italic markdown markers
  s = s.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1");
  s = s.replace(/[*_#>]+/g, " ");
  // Bracketed emphasis like [강의 목록], 【…】, 「…」, 《…》
  s = s.replace(/[\[\]【】「」『』《》()()]/g, " ");
  // Emoji / pictographs
  s = s.replace(/\p{Extended_Pictographic}/gu, " ");
  // Collapse whitespace
  return s.replace(/\s+/g, " ").trim();
}



type ChatMsg = { role: "user" | "assistant"; content: string };
type Segment = { lang: "zh" | "ko"; text: string };

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const WELCOME_KEY = "dingdong:welcomed:v1";

function segmentBilingual(text: string): Segment[] {
  const segs: Segment[] = [];
  let buf = "";
  let curr: "zh" | "ko" | null = null;
  const flush = () => {
    if (buf.trim()) segs.push({ lang: curr === "zh" ? "zh" : "ko", text: buf.trim() });
    buf = "";
  };
  for (const ch of text) {
    const isZh = CJK_RE.test(ch);
    const lang: "zh" | "ko" = isZh ? "zh" : "ko";
    if (curr === null) curr = lang;
    if (lang !== curr) {
      flush();
      curr = lang;
    }
    buf += ch;
  }
  flush();
  return segs
    .map((s) =>
      s.lang === "zh"
        ? { ...s, text: s.text.replace(/[\uac00-\ud7af]/g, "").trim() }
        : { ...s, text: s.text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, "").trim() },
    )
    .filter((s) => s.text.length > 0);
}

function pickVoice(lang: "zh" | "ko"): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith(lang === "zh" ? "zh-cn" : "ko-kr")) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(lang)) ||
    null
  );
}

function speakBilingual(text: string, onDone?: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onDone?.();
    return () => {};
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const segments = segmentBilingual(sanitizeForSpeech(text));
  let cancelled = false;
  const runNext = (i: number) => {
    if (cancelled || i >= segments.length) {
      onDone?.();
      return;
    }
    const seg = segments[i];
    const u = new SpeechSynthesisUtterance(seg.text);
    u.lang = seg.lang === "zh" ? "zh-CN" : "ko-KR";
    const v = pickVoice(seg.lang);
    if (v) u.voice = v;
    u.pitch = 1.0;
    u.rate = 0.9;
    u.onend = () => runNext(i + 1);
    u.onerror = () => runNext(i + 1);
    synth.speak(u);
  };
  runNext(0);
  return () => {
    cancelled = true;
    synth.cancel();
  };
}

function getSpeechRecognition(): any {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
}

export function DingDongBot() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chat" | "faq">("chat");
  const [faqCat, setFaqCat] = useState<FaqCategory>("platform");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [sttLang, setSttLang] = useState<"ko-KR" | "zh-CN">("ko-KR");
  const [blinking, setBlinking] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(0); // 0..1

  const { session } = useSession();
  const fab = useDraggableFab();
  // The two-line caption is what made the resting button ~260px wide and easy
  // to collide with, so it introduces itself once and then gets out of the way.
  const [labelPinned, setLabelPinned] = useState(true);
  const [hovering, setHovering] = useState(false);
  const [scrolling, setScrolling] = useState(false);

  const stopSpeakRef = useRef<(() => void) | null>(null);
  const recognitionRef = useRef<any>(null);
  const sendFn = useServerFn(assistantChat);
  const navigate = useNavigate();
  const historyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.getVoices();
    const h = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", h);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", h);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(WELCOME_KEY)) return;
    setMessages([
      {
        role: "assistant",
        content:
          "안녕! 나는 판다 도우미 叮叮(딩딩)이야 🐼 중국어 공부하다가 궁금한 거 있으면 뭐든 물어봐! 你好吗？",
      },
    ]);
    localStorage.setItem(WELCOME_KEY, "1");
  }, []);

  useEffect(() => {
    if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight;
  }, [messages, loading]);

  // Say hello, then shrink to just the panda.
  useEffect(() => {
    const t = setTimeout(() => setLabelPinned(false), 8000);
    return () => clearTimeout(t);
  }, []);

  // Fade back while the learner is reading past it, restore once they settle.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      setScrolling(true);
      clearTimeout(t);
      t = setTimeout(() => setScrolling(false), 800);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
    else {
      stopSpeakRef.current?.();
      setSpeaking(false);
    }
  }, [open]);

  // Random blink: every 3–6s, brief 280ms blink. Pause while not visible.
  useEffect(() => {
    if (!open && !messages.length) return;
    let timer: ReturnType<typeof setTimeout>;
    const scheduleBlink = () => {
      const delay = 3000 + Math.random() * 3000;
      timer = setTimeout(() => {
        setBlinking(true);
        setTimeout(() => setBlinking(false), 300);
        scheduleBlink();
      }, delay);
    };
    scheduleBlink();
    return () => clearTimeout(timer);
  }, [open, messages.length]);

  // Lip-sync: while speaking, animate mouth open value with a soft pseudo-amplitude.
  // Web Speech API audio isn't tappable via AnalyserNode, so we use a smoothed
  // rhythmic pattern (~7-10 Hz) with mild randomness so it reads as natural speech.
  useEffect(() => {
    if (!speaking) {
      setMouthOpen(0);
      return;
    }
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      // Combine two sines + jitter, clamp to [0.15, 1]
      const base = 0.5 + 0.5 * Math.sin(t * 13.5);
      const sub = 0.5 + 0.5 * Math.sin(t * 7.1 + 1.3);
      const jitter = Math.random() * 0.15;
      const v = Math.max(0.1, Math.min(1, base * 0.55 + sub * 0.35 + jitter * 0.2));
      setMouthOpen(v);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speaking]);


  const lastAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].content;
    }
    return "";
  }, [messages]);

  const playLast = () => {
    if (!lastAssistant) return;
    stopSpeakRef.current?.();
    setSpeaking(true);
    stopSpeakRef.current = speakBilingual(lastAssistant, () => setSpeaking(false));
  };

  const stopSpeaking = () => {
    stopSpeakRef.current?.();
    setSpeaking(false);
  };

  const send = async (text: string, fromVoice = false) => {
    const trimmed = text.trim();
    // The composer is hidden for guests; this guards the voice path too.
    if (!trimmed || loading || !session) return;
    const next: ChatMsg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = (await sendFn({
        data: { messages: next.slice(-12).map(({ role, content }) => ({ role, content })) },
      })) as { reply: string; navigateTo: string | null };
      const reply = res.reply ?? "";
      setMessages([...next, { role: "assistant", content: reply }]);
      if (fromVoice) {
        setTimeout(() => {
          stopSpeakRef.current?.();
          setSpeaking(true);
          stopSpeakRef.current = speakBilingual(reply, () => setSpeaking(false));
        }, 50);
      }
      if (res.navigateTo) {
        setTimeout(() => {
          navigate({ to: res.navigateTo! as string } as never).catch(() => {});
          stopSpeaking();
          setOpen(false);
        }, fromVoice ? 1800 : 600);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "응답을 받지 못했어요.";
      setMessages([...next, { role: "assistant", content: `미안! 잠깐 문제가 생겼어. (${msg})` }]);
    } finally {
      setLoading(false);
    }
  };

  const toggleListening = () => {
    const SR = getSpeechRecognition();
    if (!SR) {
      alert("이 브라우저는 음성 입력을 지원하지 않아요. Chrome을 권장합니다.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.lang = sttLang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (ev: any) => {
      const transcript = ev.results[0]?.[0]?.transcript ?? "";
      if (transcript) send(transcript, true);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  // Push a pre-canned FAQ exchange into the chat and speak it.
  const askFaq = (q: string, a: string) => {
    const next: ChatMsg[] = [
      ...messages,
      { role: "user", content: q },
      { role: "assistant", content: a },
    ];
    setMessages(next);
    setTab("chat");
    setTimeout(() => {
      stopSpeakRef.current?.();
      setSpeaking(true);
      stopSpeakRef.current = speakBilingual(a, () => setSpeaking(false));
    }, 80);
  };

  const faqsInCat = useMemo(
    () => FAQ_ITEMS.filter((f) => f.category === faqCat),
    [faqCat],
  );

  return (
    <>
      {/* FAB — clearly labeled as a voice AI assistant, and draggable so it can
          be moved off whatever page content it happens to be covering. */}
      <div
        ref={fab.ref}
        style={fab.style}
        {...fab.handlers}
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={() => setHovering(false)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex items-center gap-2 touch-none select-none",
          // Snapped left, the caption has to sit on the button's right or it
          // would run off the screen.
          fab.side === "left" && "flex-row-reverse",
          fab.dragging ? "cursor-grabbing transition-none" : "cursor-grab transition-[opacity,top,left,right] duration-200",
          scrolling && !fab.dragging && !hovering ? "opacity-40" : "opacity-100",
          open && "hidden",
        )}
      >
        <div
          className={cn(
            "hidden sm:flex flex-col mr-1 pointer-events-none select-none transition-opacity duration-300",
            fab.side === "left" ? "items-start ml-1 mr-0" : "items-end",
            labelPinned || hovering ? "opacity-100" : "opacity-0",
          )}
        >
          <span className="glass-soft rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-widest uppercase text-primary">
            🎙️ 음성 AI
          </span>
          <span className="mt-1 text-[11px] font-semibold text-foreground/80 bg-white/70 backdrop-blur rounded-full px-2 py-0.5 shadow-sm">
            叮叮에게 말 걸기
          </span>
        </div>
        <button
          onClick={() => {
            if (fab.wasDragged()) return; // that click just ended a drag
            setOpen(true);
          }}
          data-tour="bot-fab"
          className={cn(
            "relative h-16 w-16 rounded-full",
            "glass shadow-xl transition-transform",
            !fab.dragging && "hover:scale-105",
            "flex items-center justify-center overflow-visible",
          )}
          aria-label="음성으로 대화하는 AI 도우미 叮叮 열기 (드래그해서 위치를 옮길 수 있어요)"
          title="말로 대화하는 AI 도우미 — 클릭해서 시작하기 · 드래그해서 위치 옮기기"
        >
          {/* Pulsing ring signals it's a live voice bot. It runs while the
              caption is up and on hover — left on permanently it is just
              motion in the corner of every page. */}
          {(labelPinned || hovering) && (
            <span
              aria-hidden
              className="absolute inset-0 rounded-full ring-2 ring-primary/40 animate-ping opacity-60"
            />
          )}
          <img
            src={pandaImg}
            alt="叮叮"
            className={cn("h-14 w-14 object-contain drop-shadow dingdong-breath")}
          />
          {/* mic badge */}
          <span
            aria-hidden
            className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full gradient-primary text-primary-foreground shadow-md ring-2 ring-white flex items-center justify-center"
          >
            <Mic className="h-3.5 w-3.5" />
          </span>
          {messages.length > 1 && (
            <span className="absolute -top-1 -left-1 h-3 w-3 rounded-full bg-pink-400 animate-pulse" />
          )}
        </button>
      </div>


      {/* Center stage overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[55] flex flex-col items-center justify-center p-4 bg-gradient-to-br from-pink-100/60 via-purple-100/40 to-sky-100/60 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              stopSpeaking();
              setOpen(false);
            }
          }}
        >
          {/* Close */}
          <button
            onClick={() => {
              stopSpeaking();
              setOpen(false);
            }}
            className="absolute top-6 right-6 h-10 w-10 rounded-full glass flex items-center justify-center hover:scale-105 transition"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Identity caption — makes it obvious this is a voice AI */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 glass-soft rounded-full px-3 py-1.5 shadow">
            <Mic className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-bold tracking-widest uppercase text-primary">
              음성으로 대화하는 AI 도우미 · 叮叮
            </span>
          </div>

          {/* Stage: panda + speech bubble */}
          <div className="flex-1 w-full max-w-2xl flex flex-col items-center justify-center gap-4 pt-10">
            {/* Speech bubble (last assistant message) */}
            {lastAssistant && (
              <div className="relative glass rounded-3xl px-6 py-4 max-w-xl shadow-xl animate-scale-in">
                <p className="text-base md:text-lg leading-relaxed text-foreground whitespace-pre-wrap">
                  {lastAssistant}
                </p>
                <button
                  onClick={() => (speaking ? stopSpeaking() : playLast())}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  {speaking ? "멈추기" : "🔊 다시 듣기"}
                </button>
                {/* Tail */}
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rotate-45 bg-white/60 border-r border-b border-white/40 backdrop-blur-md" />
              </div>
            )}

            {/* Big panda — layered transforms: enter → sway → breath → talk-bob/blink */}
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-pink-300/30 blur-3xl scale-110" />
              <div className="dingdong-enter">
                <div className="dingdong-sway">
                  <div className="dingdong-breath">
                    <div
                      className={cn(
                        "relative",
                        speaking && "dingdong-talk-bob",
                        blinking && "dingdong-blink-once",
                      )}
                    >
                      <img
                        src={pandaImg}
                        alt="叮叮"
                        className="relative h-48 w-48 md:h-64 md:w-64 object-contain drop-shadow-2xl select-none"
                        draggable={false}
                      />
                      {/* Lip-sync mouth overlay */}
                      <div
                        className="dingdong-mouth"
                        style={{
                          height: `${4 + mouthOpen * 14}px`,
                          opacity: speaking ? 0.85 : 0,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              {loading && (
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 glass-soft rounded-full px-3 py-1 text-xs">
                  생각 중…
                </div>
              )}
            </div>


            {/* Mini history (collapsed unless multiple) */}
            {messages.length > 1 && (
              <div
                ref={historyRef}
                className="w-full max-w-xl max-h-24 overflow-y-auto glass-soft rounded-2xl px-3 py-2 space-y-1 text-xs"
              >
                {messages.slice(-4, -1).map((m, i) => (
                  <div
                    key={i}
                    className={cn(
                      "truncate",
                      m.role === "user" ? "text-right text-primary" : "text-muted-foreground",
                    )}
                  >
                    <span className="font-medium">
                      {m.role === "user" ? "나" : "叮叮"}:
                    </span>{" "}
                    {m.content}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Composer + FAQ */}
          <div className="w-full max-w-2xl glass rounded-3xl p-3 shadow-2xl">
            {/* Tabs */}
            <div className="flex items-center gap-1 mb-2 p-1 rounded-2xl bg-white/40 w-fit mx-auto">
              <button
                onClick={() => setTab("chat")}
                className={cn(
                  "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition",
                  tab === "chat"
                    ? "gradient-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <MessageSquare className="h-3.5 w-3.5" /> AI 채팅
              </button>
              <button
                onClick={() => setTab("faq")}
                className={cn(
                  "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition",
                  tab === "faq"
                    ? "gradient-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <HelpCircle className="h-3.5 w-3.5" /> FAQ
              </button>
            </div>

            {tab === "faq" ? (
              <div className="space-y-2">
                {/* Category chips */}
                <div className="flex flex-wrap gap-1.5 px-1">
                  {FAQ_CATEGORIES.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => setFaqCat(c.key)}
                      className={cn(
                        "text-[11px] px-2.5 py-1 rounded-full transition",
                        faqCat === c.key
                          ? "gradient-primary text-primary-foreground"
                          : "glass-soft text-foreground/80 hover:bg-white/70",
                      )}
                    >
                      {c.emoji} {c.label}
                    </button>
                  ))}
                </div>
                {/* Questions */}
                <div className="max-h-56 overflow-y-auto pr-1 space-y-1.5">
                  {faqsInCat.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => askFaq(f.q, f.a)}
                      className="w-full text-left rounded-2xl bg-white/60 hover:bg-white/90 transition px-3 py-2 text-xs leading-snug border border-white/50"
                    >
                      <span className="font-semibold text-foreground">Q. </span>
                      {f.q}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-center text-muted-foreground pt-1">
                  원하는 답이 없다면 「AI 채팅」 탭에서 자유롭게 물어보세요!
                </p>
              </div>
            ) : !session ? (
              /* Free chat is a model call per message, so it needs an account.
                 The FAQ tab above is pre-written and stays open to everyone. */
              <div className="rounded-2xl bg-white/70 border border-white/60 p-5 text-center space-y-3">
                <div className="text-3xl">🐼</div>
                <div className="text-sm font-semibold text-foreground">
                  叮叮과 자유롭게 대화하려면 로그인해 주세요
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  로그인 없이도 위의 「자주 묻는 질문」 탭은 그대로 쓸 수 있어요.
                </p>
                <Button asChild size="sm" className="rounded-full">
                  <Link to="/auth">로그인하기</Link>
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5 mb-2 px-1">
                  <button
                    onClick={() => setSttLang((l) => (l === "ko-KR" ? "zh-CN" : "ko-KR"))}
                    className="text-[10px] px-2 py-0.5 rounded-full glass-soft text-muted-foreground hover:text-foreground"
                  >
                    🎙 {sttLang === "ko-KR" ? "한국어" : "中文"}
                  </button>
                  {listening && (
                    <span className="text-[10px] text-pink-500 animate-pulse">● 듣는 중…</span>
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    send(input, false);
                  }}
                  className="flex items-center gap-2"
                >
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={toggleListening}
                    className={cn(
                      "h-10 w-10 rounded-full shrink-0",
                      listening && "bg-pink-100 text-pink-600",
                    )}
                  >
                    {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="🎙️ 말하거나 입력해서 물어보세요…"
                    className="flex-1 h-10 px-4 rounded-full bg-white/70 border border-white/50 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="h-10 w-10 rounded-full shrink-0"
                    disabled={loading || !input.trim()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </>
            )}
          </div>

        </div>
      )}
    </>
  );
}
