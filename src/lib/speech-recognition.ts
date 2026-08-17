// Minimal Web Speech API types.
//
// TypeScript's DOM lib still ships no SpeechRecognition definitions (it is not
// on a standards track Chrome and Safari agree on), so every screen that used
// the mic had declared its own shape and fallen back to `any` for the events.
// These are the fields this app actually touches — types only, no runtime code,
// so importing this cannot change behaviour anywhere.

export type SpeechRecognitionAlternativeLike = { transcript: string };

/** `results[resultIndex][alternativeIndex].transcript` — both levels are
 *  array-like, not real arrays, which is why callers index rather than map. */
export type SpeechRecognitionResultEventLike = {
  results: ArrayLike<ArrayLike<SpeechRecognitionAlternativeLike>>;
};

/** `error` carries the spec's error code: "not-allowed", "no-speech",
 *  "aborted", "audio-capture", "network", "service-not-allowed". */
export type SpeechRecognitionErrorEventLike = { error?: string };

export type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous?: boolean;
  onresult: ((e: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** Chrome/Edge expose the constructor under the `webkit` prefix; the unprefixed
 *  name exists on newer builds. Cast `window` through this to read either. */
export type SpeechRecognitionWindow = {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};
