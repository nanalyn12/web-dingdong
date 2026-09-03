/**
 * Reordering for the widget panel.
 *
 * The panel used to reorder through HTML5 drag-and-drop alone. `dragstart` /
 * `dragover` never fire from a touch, so on a phone the panel could add and
 * remove widgets but not move them. The move is stated here rather than inside
 * the component for two reasons: it is assertable without a DOM, and the drag
 * path and the button path both call it, so the two cannot drift.
 *
 * Every function is total — an out-of-range index returns the list unchanged
 * instead of throwing. The buttons are disabled at the ends, but a key repeat
 * or a stale index must not be able to drop a widget.
 */

export type MoveDirection = "up" | "down";

/** `list` with the item at `index` moved one slot. Never mutates `list`. */
export function moveWidget<T>(list: readonly T[], index: number, direction: MoveDirection): T[] {
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || index >= list.length) return [...list];
  if (target < 0 || target >= list.length) return [...list];
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** 첫 항목은 위로 갈 수 없다. */
export function canMoveUp(index: number): boolean {
  return index > 0;
}

/** 마지막 항목은 아래로 갈 수 없다. 항목이 하나면 양쪽 다 false. */
export function canMoveDown(index: number, length: number): boolean {
  return index >= 0 && index < length - 1;
}
