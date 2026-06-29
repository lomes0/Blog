import { byRank } from "@/lib/ordering";
import type { UserDocument } from "@/types";

const rankOf = (doc: UserDocument): string | null =>
  doc.cloud?.rank ?? doc.local?.rank ?? null;

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
