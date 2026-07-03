import { byRank } from "@/lib/ordering";
import type { UserDocument } from "@/types";

export const rankOf = (doc: UserDocument): string | null =>
  doc.cloud?.rank ?? doc.local?.rank ?? null;

export type ReorderDirection = "up" | "down" | "top" | "bottom";

/**
 * Given a rank-ordered list and the index of the item being moved, return the
 * ranks that should bracket its new slot for the requested direction — the
 * input to `moveDocument`/`moveSeries`'s `between`. Returns null when the move
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

const createdAtOf = (doc: UserDocument): number =>
  new Date(doc.cloud?.createdAt ?? doc.local?.createdAt ?? 0).getTime();

/**
 * Order documents by their manual `rank` (ascending). Unranked documents — e.g.
 * local drafts created before they were assigned a rank — sort after ranked
 * ones, by creation time then id, so the result is always total and stable.
 *
 * This is the default ordering for the content surfaces (posts list, series
 * parts, sidebar tabs). Date/name sorting remains available as explicit views.
 */
export function compareDocumentsByRank(
  a: UserDocument,
  b: UserDocument,
): number {
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
