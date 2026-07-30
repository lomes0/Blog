import { byRank, isValidRank } from "@/lib/ordering";
import type { DropPosition } from "@/lib/dragDrop";
import type { Post } from "@/types";

export const rankOf = (post: Post): string | null => post.rank ?? null;

export type ReorderDirection = "up" | "down" | "top" | "bottom";

/**
 * Given a rank-ordered list and the index of the item being moved, return the
 * ranks that should bracket its new slot for the requested direction — the
 * input to `movePost`/`moveSeries`'s `between`. Returns null when the move
 * is a no-op (already at the relevant edge).
 */
export function ranksBracketing(
  ranks: (string | null)[],
  index: number,
  direction: ReorderDirection,
): { afterRank: string | null; beforeRank: string | null } | null {
  const last = ranks.length - 1;
  const at = (i: number) => (i >= 0 && i <= last ? ranks[i] : null);
  switch (direction) {
    case "up":
      return index === 0
        ? null
        : { afterRank: at(index - 2), beforeRank: at(index - 1) };
    case "down":
      return index === last
        ? null
        : { afterRank: at(index + 1), beforeRank: at(index + 2) };
    case "top":
      return index === 0 ? null : { afterRank: null, beforeRank: at(0) };
    case "bottom":
      return index === last ? null : { afterRank: at(last), beforeRank: null };
  }
}

/** A sibling as the drop bracket sees it: an id and its (possibly absent) rank. */
export interface RankedSibling {
  id: string;
  rank: string | null;
}

/**
 * Ranks that bracket the slot at `position` relative to `targetId` in
 * `siblings` — the drag counterpart of {@link ranksBracketing}, and likewise the
 * input to `movePost`/`moveSeries`'s `between`.
 *
 * Every dragged row is removed from the list first, so a block's own ranks never
 * bracket its destination.
 *
 * Returns null when the drop cannot be ranked, which is the caller's cue to drop
 * the gesture:
 *   - the target isn't among the siblings, or
 *   - the bracketing neighbours collide (`afterRank >= beforeRank`). Two rows can
 *     share a rank when offline clients mint the same key (see `lib/ordering`);
 *     handing that pair to `rankBetween` *throws*, so it is caught here once
 *     instead of at each call site. A refresh reconciles the ranks server-side.
 *
 * A malformed neighbour key is deliberately *not* treated as a collision:
 * `rankBetween` sanitizes an invalid key to a list edge and mints successfully,
 * which is what lets a list self-heal as its rows are reordered.
 */
export function bracketForDrop(
  siblings: readonly RankedSibling[],
  draggedIds: ReadonlySet<string>,
  targetId: string,
  position: DropPosition,
): { afterRank: string | null; beforeRank: string | null } | null {
  const list = siblings.filter((s) => !draggedIds.has(s.id));
  const ti = list.findIndex((s) => s.id === targetId);
  if (ti === -1) return null;

  const at = (i: number) => (i >= 0 && i < list.length ? list[i].rank : null);
  const afterRank = position === "before" ? at(ti - 1) : at(ti);
  const beforeRank = position === "before" ? at(ti) : at(ti + 1);

  if (
    isValidRank(afterRank) && isValidRank(beforeRank) && afterRank >= beforeRank
  ) {
    return null;
  }
  return { afterRank, beforeRank };
}

const createdAtOf = (post: Post): number =>
  new Date(post.createdAt ?? 0).getTime();

/**
 * Order posts by their manual `rank` (ascending). Unranked posts — e.g. drafts
 * created before they were assigned a rank — sort after ranked ones, by creation
 * time then id, so the result is always total and stable.
 *
 * This is the default ordering for the content surfaces (posts list, series
 * parts, sidebar tabs). Date/name sorting remains available as explicit views.
 */
export function comparePostsByRank(a: Post, b: Post): number {
  const ar = rankOf(a);
  const br = rankOf(b);
  if (ar != null && br != null) {
    return byRank({ id: a.id, rank: ar }, { id: b.id, rank: br });
  }
  if (ar != null) return -1; // ranked before unranked
  if (br != null) return 1;
  const ac = createdAtOf(a);
  const bc = createdAtOf(b);
  if (ac !== bc) return ac - bc;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
