import { useCallback, useEffect, useState } from "react";

/**
 * Lightweight Chinese-only TTS using the browser SpeechSynthesis API.
 * Returns a `speak(text)` fn and the id of the currently-speaking utterance
 * (so callers can show a pulsing icon on the active line).
 */
export function useZhTts() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      const zh =
        voices.find((v) => /zh[-_]CN/i.test(v.lang)) ||
        voices.find((v) => v.lang?.toLowerCase().startsWith("zh"));
      if (zh) setVoice(zh);
    };
    pickVoice();
    window.speechSynthesis.onvoiceschanged = pickVoice;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const speak = useCallback(
    (text: string, id?: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "zh-CN";
      if (voice) utter.voice = voice;
      utter.rate = 0.85;
      utter.pitch = 1.0;
      const key = id ?? text.slice(0, 24);
      utter.onstart = () => setSpeakingId(key);
      utter.onend = () => setSpeakingId((s) => (s === key ? null : s));
      utter.onerror = () => setSpeakingId((s) => (s === key ? null : s));
      synth.speak(utter);
    },
    [voice],
  );

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, []);

  return { speak, stop, speakingId };
}
