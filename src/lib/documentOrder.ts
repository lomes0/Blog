import { byRank } from "@/lib/ordering";
import type { Post } from "@/types";

/**
 * What is left of rank-ordered reading: the **local (IndexedDB) library only**.
 *
 * Phase 4 of docs/plans/ordering-simplification.md moved every cloud read and
 * every write onto container order arrays, and took `ranksBracketing`,
 * `bracketForDrop` and `RankedSibling` with it — a drop now produces an id
 * array, not a pair of neighbour ranks. A guest's posts live in IndexedDB,
 * which has no `User` row to hang a `rootOrder` on and no series or projects at
 * all, so the local side stays on `rank` until §7 is done; the two selectors
 * that know this (`selectRootOrder`, `selectChildPostsByParent`) are its only
 * callers.
 */

export const rankOf = (post: Post): string | null => post.rank ?? null;

const createdAtOf = (post: Post): number =>
  new Date(post.createdAt ?? 0).getTime();

/**
 * Order posts by their manual `rank` (ascending). Unranked posts — e.g. drafts
 * created before they were assigned a rank — sort after ranked ones, by creation
 * time then id, so the result is always total and stable.
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
