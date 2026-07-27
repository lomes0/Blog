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
 * Whether `rank` is a well-formed fractional-index key.
 *
 * Legacy/partially-migrated rows can carry keys the fractional-indexing library
 * rejects (e.g. the integer sort_order `"0"` left behind by an incomplete
 * backfill). Feeding such a key to `generateKeyBetween` throws
 * (`invalid order key head: 0`), which would wedge *every* insert/reorder into
 * that key's container — a single bad row breaks moves for the whole list. We
 * validate defensively and treat an invalid key as "absent" (a list edge) so
 * one corrupt row can't poison rank computation. The moved row then gets a
 * fresh valid key, so the list self-heals as items are reordered.
 */
export function isValidRank(rank: string | null | undefined): rank is string {
  if (!rank) return false;
  try {
    // generateKeyBetween validates its first argument; a malformed key throws.
    generateKeyBetween(rank, null);
    return true;
  } catch {
    return false;
  }
}

/** Coerce an invalid/absent key to null (a list edge) for safe key minting. */
function sanitizeRank(rank: string | null): string | null {
  return isValidRank(rank) ? rank : null;
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
  // Drop malformed neighbour keys to the list edge so a legacy/corrupt rank
  // can't crash the mint (see isValidRank).
  const u = sanitizeRank(upper);
  const l = sanitizeRank(lower);
  if (u !== null && l !== null && u >= l) {
    throw new Error(
      `rankBetween: neighbours out of order (upper=${u}, lower=${l})`,
    );
  }
  return generateKeyBetween(u, l);
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
  return generateNKeysBetween(sanitizeRank(after), null, count);
}

/**
 * Total ordering comparator over a (nullable) rank and a stable id tiebreaker:
 * ascending by `rank`, unranked (`null`) entries sort last, and equal/absent
 * ranks break by `id` so the order is always total and stable.
 *
 * This is the one primitive every rank-ordered surface builds on — the root
 * list on /posts, the sidebar tree's group/root ordering, and {@link byRank}.
 */
export function compareRankThenId(
  aRank: string | null,
  aId: string,
  bRank: string | null,
  bId: string,
): number {
  if (aRank != null && bRank != null) {
    if (aRank !== bRank) return aRank < bRank ? -1 : 1;
  } else if (aRank != null) return -1;
  else if (bRank != null) return 1;
  return aId < bId ? -1 : aId > bId ? 1 : 0;
}

/**
 * Total ordering comparator: ascending by `rank`, with `id` as a stable
 * tiebreaker so colliding ranks never produce an ambiguous order. A thin
 * {@link compareRankThenId} over the non-null `Ranked` shape.
 */
export function byRank(a: Ranked, b: Ranked): number {
  return compareRankThenId(a.rank, a.id, b.rank, b.id);
}

function maxRank(siblings: readonly Ranked[]): string | null {
  let max: string | null = null;
  for (const s of siblings) {
    // Ignore malformed keys so a corrupt sibling can't become the bound we
    // then feed to generateKeyBetween (which would throw).
    if (!isValidRank(s.rank)) continue;
    if (max === null || s.rank > max) max = s.rank;
  }
  return max;
}

function minRank(siblings: readonly Ranked[]): string | null {
  let min: string | null = null;
  for (const s of siblings) {
    if (!isValidRank(s.rank)) continue;
    if (min === null || s.rank < min) min = s.rank;
  }
  return min;
}
