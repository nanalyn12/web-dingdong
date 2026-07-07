// Per-song activity completion state, stored in localStorage.
// Simple guest-friendly progress tracking. No server sync.

import { useCallback, useEffect, useState } from "react";

export type SongProgress = {
  vocab: string[]; // zh keys of flipped/learned vocab
  grammar: string[]; // titles of studied grammar notes
  cloze: boolean; // completed cloze once
  order: boolean; // solved order once
  repeat: string[]; // zh keys of lines played in "따라 부르기"
  updatedAt: string;
};

const EMPTY: SongProgress = {
  vocab: [],
  grammar: [],
  cloze: false,
  order: false,
  repeat: [],
  updatedAt: "",
};

const KEY = (id: string) => `dingdong:progress:song:${id}`;

function load(id: string): SongProgress {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = localStorage.getItem(KEY(id));
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<SongProgress>;
    return {
      vocab: Array.isArray(parsed.vocab) ? parsed.vocab : [],
      grammar: Array.isArray(parsed.grammar) ? parsed.grammar : [],
      cloze: !!parsed.cloze,
      order: !!parsed.order,
      repeat: Array.isArray(parsed.repeat) ? parsed.repeat : [],
      updatedAt: parsed.updatedAt ?? "",
    };
  } catch {
    return { ...EMPTY };
  }
}

function save(id: string, next: SongProgress) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      KEY(id),
      JSON.stringify({ ...next, updatedAt: new Date().toISOString() }),
    );
  } catch {
    /* ignore */
  }
}

const EVENT = "dingdong:song-progress-change";

export function useSongProgress(songId: string) {
  const [state, setState] = useState<SongProgress>(EMPTY);

  useEffect(() => {
    setState(load(songId));
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (!detail || detail.id === songId) setState(load(songId));
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [songId]);

  const mutate = useCallback(
    (patch: (prev: SongProgress) => SongProgress) => {
      const next = patch(load(songId));
      save(songId, next);
      setState(next);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(EVENT, { detail: { id: songId } }),
        );
      }
    },
    [songId],
  );

  const markVocab = useCallback(
    (zh: string) =>
      mutate((p) =>
        p.vocab.includes(zh) ? p : { ...p, vocab: [...p.vocab, zh] },
      ),
    [mutate],
  );
  const markGrammar = useCallback(
    (title: string) =>
      mutate((p) =>
        p.grammar.includes(title)
          ? p
          : { ...p, grammar: [...p.grammar, title] },
      ),
    [mutate],
  );
  const markCloze = useCallback(
    () => mutate((p) => (p.cloze ? p : { ...p, cloze: true })),
    [mutate],
  );
  const markOrder = useCallback(
    () => mutate((p) => (p.order ? p : { ...p, order: true })),
    [mutate],
  );
  const markRepeat = useCallback(
    (zh: string) =>
      mutate((p) =>
        p.repeat.includes(zh) ? p : { ...p, repeat: [...p.repeat, zh] },
      ),
    [mutate],
  );
  const reset = useCallback(() => mutate(() => ({ ...EMPTY })), [mutate]);

  return {
    progress: state,
    markVocab,
    markGrammar,
    markCloze,
    markOrder,
    markRepeat,
    reset,
  };
}
