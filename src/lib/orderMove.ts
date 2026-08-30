/**
 * The write side of container order
 * (docs/plans/ordering-simplification.md §4/§5): given the ids a list is
 * currently rendering, produce the ids it should render after a gesture.
 *
 * This is the whole of what a reorder computes now. There is no rank to mint,
 * no bracket to derive from neighbours, and nothing the server has to
 * re-derive — the array these functions return is the array that gets sent.
 *
 * Deliberately import-free, for the reason `src/lib/dragGeometry.ts` is: a drag
 * and a menu command are both exercisable without a browser, a store or a
 * database (`src/lib/__tests__/orderMove.test.ts`).
 */

/** Which edge of the target row a drop landed on. */
export type DropEdge = "before" | "after";

/** A menu / keyboard reorder command. */
export type ReorderDirection = "up" | "down" | "top" | "bottom";

/** Null when nothing changed, so a caller can skip the write. */
const changed = (before: readonly string[], after: string[]): string[] | null =>
  before.length === after.length && before.every((id, i) => id === after[i])
    ? null
    : after;

/**
 * Move `id` one step up/down, or to the top/bottom of `ids`.
 *
 * Returns null when the move is a no-op — the row is already at that edge, or
 * is not in the list at all.
 */
export function moveByDirection(
  ids: readonly string[],
  id: string,
  direction: ReorderDirection,
): string[] | null {
  const from = ids.indexOf(id);
  if (from === -1) return null;

  const to = direction === "up"
    ? from - 1
    : direction === "down"
    ? from + 1
    : direction === "top"
    ? 0
    : ids.length - 1;
  if (to < 0 || to >= ids.length) return null;

  const next = ids.filter((_, i) => i !== from);
  next.splice(to, 0, id);
  return changed(ids, next);
}

/**
 * Drop `draggedIds` into `ids` as one contiguous block, on the given edge of
 * `targetId`.
 *
 * The dragged rows are removed first, so a multi-row block never brackets
 * itself, and they are reinserted in the order given — which is render order,
 * so a selection dropped as a block keeps its internal order. That property
 * used to need a chain of freshly minted ranks; here it is what `splice` does.
 *
 * Returns null when the drop cannot be expressed: the target is one of the
 * dragged rows, or it is not in this list.
 */
export function moveToTarget(
  ids: readonly string[],
  draggedIds: readonly string[],
  targetId: string,
  edge: DropEdge,
): string[] | null {
  const dragged = new Set(draggedIds);
  if (dragged.has(targetId)) return null;

  // Only rows this list actually holds can be repositioned within it; the rest
  // of a cross-container drag is the caller's business (it re-homes them first).
  const block = draggedIds.filter((id) => ids.includes(id));
  const rest = ids.filter((id) => !dragged.has(id));
  const at = rest.indexOf(targetId);
  if (at === -1) return null;

  const next = [...rest];
  next.splice(edge === "before" ? at : at + 1, 0, ...block);
  return changed(ids, next);
}

/**
 * Rewrite the positions a subset occupies in `full`, leaving everything else
 * exactly where it is.
 *
 * The root list is one shared space rendered as two sections (standalone posts,
 * then projects and series), and a menu reorder acts within a section. Moving a
 * row "down" must land where the user watched it go, which means reordering the
 * section and then putting the section's rows back into the slots the section
 * already held — the rows between them belong to the other section and must not
 * shift. This is what bracketing a rank against the section used to achieve.
 */
export function applySubsetOrder(
  full: readonly string[],
  subsetOrder: readonly string[],
): string[] {
  const slots: number[] = [];
  const members = new Set(subsetOrder);
  for (let i = 0; i < full.length; i++) {
    if (members.has(full[i])) slots.push(i);
  }
  const next = [...full];
  // A subset id `full` does not contain has no slot to take; it is dropped
  // rather than appended, because the caller is describing positions *within*
  // `full` and inventing one would move rows the gesture never named.
  const placed = subsetOrder.filter((id) => full.includes(id));
  for (let i = 0; i < slots.length && i < placed.length; i++) {
    next[slots[i]] = placed[i];
  }
  return next;
}
