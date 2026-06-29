import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/**
 * Manual-ordering primitive.
 *
 * Every orderable row (a {@link import("@/types").UserDocument} or a Series)
 * stores a `rank`: a fractional-index key giving its position among its
 * siblings within its container (its series, its parent tab-group, or the
 * author's root list). Ranks are compared as plain strings — `a.rank < b.rank`
 * — so a row can be re-positioned by writing a single new key *between* its
 * neighbours, with no renumbering of the rest of the list.
 *
 * This module is the only place that mints or reasons about rank keys. All
 * repositories, thunks and selectors go through it.
 *
 * Collision note: two clients editing offline can mint the same key for the
 * same slot. {@link byRank} breaks such ties deterministically by `id`, so
 * display order is always total and stable. Jittered keys (to also keep future
 * inserts *between* the colliding pair from wedging) are deferred until
 * concurrent offline reordering is wired up — see the ordering plan.
 */

/** Minimal shape this module needs: anything with a stable id and a rank. */
export interface Ranked {
  id: string;
  rank: string;
}

/**
 * A rank strictly between two adjacent siblings, ordered top-to-bottom.
 *
 * Pass the rank of the neighbour *above* the target slot as `upper` and the
 * neighbour *below* as `lower`. A `null` means "the edge of the list": top
 * (`upper = null`) or bottom (`lower = null`). Both `null` mints the first key
 * for an empty container.
 *
 * @throws if `upper >= lower` — neighbours must be passed in list order.
 */
export function rankBetween(
  upper: string | null,
  lower: string | null,
): string {
  if (upper !== null && lower !== null && upper >= lower) {
    throw new Error(
      `rankBetween: neighbours out of order (upper=${upper}, lower=${lower})`,
    );
  }
  return generateKeyBetween(upper, lower);
}

/** A rank that sorts after every sibling (append to the end of the list). */
export function rankAtEnd(siblings: readonly Ranked[]): string {
  return generateKeyBetween(maxRank(siblings), null);
}

/** A rank that sorts before every sibling (prepend to the start of the list). */
export function rankAtStart(siblings: readonly Ranked[]): string {
  return generateKeyBetween(null, minRank(siblings));
}

/**
 * `count` evenly spaced ranks in ascending order, for seeding a whole list at
 * once (used by the migration backfill). Returns `[]` for `count <= 0`.
 */
export function ranksForList(count: number): string[] {
  if (count <= 0) return [];
  return generateNKeysBetween(null, null, count);
}

/**
 * `count` ascending ranks that all sort after `after` (or after the start of
 * the list when `after` is null). Used to append a batch of rows to the end of
 * a container in one shot — e.g. re-homing a deleted series' posts into root.
 */
export function ranksAfter(after: string | null, count: number): string[] {
  if (count <= 0) return [];
  return generateNKeysBetween(after, null, count);
}

/**
 * Total ordering comparator: ascending by `rank`, with `id` as a stable
 * tiebreaker so colliding ranks never produce an ambiguous order.
 */
export function byRank(a: Ranked, b: Ranked): number {
  if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

function maxRank(siblings: readonly Ranked[]): string | null {
  let max: string | null = null;
  for (const s of siblings) if (max === null || s.rank > max) max = s.rank;
  return max;
}

function minRank(siblings: readonly Ranked[]): string | null {
  let min: string | null = null;
  for (const s of siblings) if (min === null || s.rank < min) min = s.rank;
  return min;
}
