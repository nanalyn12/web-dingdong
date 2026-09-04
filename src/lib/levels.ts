// The single source of truth for 난이도 labels.
//
// These strings used to be redeclared in seven places, which is how the same
// level ended up reading "입문", "입문 (HSK 1~3)" and "입문 (HSK 1~2급)" on
// different screens. Import from here; do not write a local copy.

export type Level = "beginner" | "intermediate" | "advanced";

/** Display order — easiest first. Use for filter rows and <Select> lists. */
export const LEVEL_ORDER: Level[] = ["beginner", "intermediate", "advanced"];

export const LEVEL_LABEL: Record<Level, string> = {
  beginner: "초급",
  intermediate: "중급",
  advanced: "고급",
};

export const LEVEL_HSK: Record<Level, string> = {
  beginner: "HSK 1~3급",
  intermediate: "HSK 4~6급",
  advanced: "HSK 7~9급",
};

/** "초급 (HSK 1~3급)" — the long form, for headings and AI prompts. */
export const LEVEL_LABEL_HSK: Record<Level, string> = {
  beginner: `${LEVEL_LABEL.beginner} (${LEVEL_HSK.beginner})`,
  intermediate: `${LEVEL_LABEL.intermediate} (${LEVEL_HSK.intermediate})`,
  advanced: `${LEVEL_LABEL.advanced} (${LEVEL_HSK.advanced})`,
};

/** Ready-made <SelectItem> / filter-button data. */
export const LEVEL_OPTIONS: { value: Level; label: string }[] = LEVEL_ORDER.map((value) => ({
  value,
  label: LEVEL_LABEL[value],
}));

export function isLevel(v: unknown): v is Level {
  return v === "beginner" || v === "intermediate" || v === "advanced";
}

/** Label for a level read out of the DB, where the column is a plain string.
 * Falls back to the raw value so an unexpected one is visible, not blank. */
export function levelLabel(v: string | null | undefined): string {
  return isLevel(v) ? LEVEL_LABEL[v] : (v ?? "");
}

/** Long form of {@link levelLabel} — "초급 (HSK 1~3급)". */
export function levelLabelHsk(v: string | null | undefined): string {
  return isLevel(v) ? LEVEL_LABEL_HSK[v] : (v ?? "");
}

/**
 * Text tone for a level badge.
 *
 * Same reason the labels live here: the tones were declared per screen and
 * drifted. `_app.courses.$id.tsx` painted 중급 rose while
 * `vocab-practice-dialog.tsx` painted it sky, so the same level was a different
 * colour depending on where you looked. These are their own tokens rather than
 * the status ones — routing them through --success/--danger would say 초급
 * means success and 중급 means danger.
 */
export const LEVEL_TONE: Record<Level, string> = {
  beginner: "text-level-beginner",
  intermediate: "text-level-intermediate",
  advanced: "text-level-advanced",
};

/** Tone for a level read out of the DB, where the column is a plain string. */
export function levelTone(v: string | null | undefined): string {
  return isLevel(v) ? LEVEL_TONE[v] : "text-muted-foreground";
}
