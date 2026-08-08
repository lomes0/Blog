/**
 * The catch-up diff — docs/plans/changes_detection.md §3, §3.1.
 *
 * Import-free on purpose, like `dragGeometry.ts` and `ordering.ts`: this is the
 * whole of the reasoning that makes the change feed correct across a
 * disconnect, so it has to be exercisable without a store, a browser or a
 * database.
 *
 * The endpoint hands back **every** document the caller owns, as `{ id,
 * updatedAt }` and nothing else. That shape — rather than a `since=` cursor —
 * is what lets three questions be answered by one response:
 *
 * - an id the response holds and the store does not is a **create**;
 * - an id both hold, with a newer `updatedAt` on the server, is an **update**;
 * - an id the store holds and the response does not is a **delete**.
 *
 * The third is the one a cursor cannot do. `Document` has no `deletedAt` —
 * `deleteDocumentRow` runs `tx.document.delete` — so a deleted row leaves
 * nothing behind that could carry a recent timestamp, and no query over
 * surviving rows can ever report it. Absence from a *full* set is the only
 * evidence there is, which is why the response is unpaged and why this function
 * takes the whole store id-set rather than a watermark.
 */

/** The two fields the catch-up carries, on either side of the comparison. */
export interface ChangeStamp {
  id: string;
  /** A `Date` in the store, an ISO string once it has crossed the wire. */
  updatedAt: string | Date;
}

export interface CatchUpDiff {
  /** Ids to re-fetch: created or updated since the store last looked. */
  changedIds: string[];
  /** Ids the response proves are gone. */
  deletedIds: string[];
}

/**
 * Milliseconds, or `NaN` for anything that does not parse.
 *
 * `updatedAt` is a `Date` on a freshly created entity and an ISO string after a
 * JSON round-trip, and both shapes really do coexist in the store — `Post`
 * types the field as `string | Date` for exactly that reason. Comparing them as
 * strings would make `"2026-08-08T…Z"` and a `Date` incomparable and every row
 * permanently "changed".
 */
const timeOf = (value: string | Date): number =>
  value instanceof Date ? value.getTime() : Date.parse(value);

/**
 * Which ids the store must re-fetch, and which it must drop.
 *
 * `stored` is what the store currently holds; `remote` is the full-set
 * response. Both are compared by id, so the order of either is irrelevant;
 * `changedIds` comes back in `remote` order so the result is deterministic.
 *
 * **Strictly newer**, not merely different. A store entity can legitimately
 * carry a timestamp a hair *ahead* of `Document.updatedAt` — `createDocument`
 * returns `findDocument(id)`, whose single-revision branch reports the
 * revision's `createdAt`, and that revision is written after the document row.
 * Treating "different" as changed would make such a row re-fetch on every poll
 * forever without ever converging.
 *
 * An unparseable timestamp on either side counts as changed: re-fetching once
 * is cheap, and the alternative is a row that can never catch up.
 */
export function diffCatchUp(
  stored: readonly ChangeStamp[],
  remote: readonly ChangeStamp[],
): CatchUpDiff {
  const storedTimes = new Map<string, number>();
  for (const entry of stored) storedTimes.set(entry.id, timeOf(entry.updatedAt));

  const changedIds: string[] = [];
  const seen = new Set<string>();

  for (const entry of remote) {
    seen.add(entry.id);
    if (!storedTimes.has(entry.id)) {
      changedIds.push(entry.id); // create
      continue;
    }
    const before = storedTimes.get(entry.id) as number;
    const after = timeOf(entry.updatedAt);
    if (Number.isNaN(before) || Number.isNaN(after) || after > before) {
      changedIds.push(entry.id); // update
    }
  }

  const deletedIds: string[] = [];
  for (const entry of stored) {
    if (!seen.has(entry.id)) deletedIds.push(entry.id);
  }

  return { changedIds, deletedIds };
}
