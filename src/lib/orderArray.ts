/**
 * The tolerant reader for container order arrays
 * (docs/plans/archive/ordering-simplification.md §6).
 *
 * Order lives on the container that owns the list — `User.rootOrder`,
 * `Series.postOrder`, `Project.seriesOrder`, `Document.tabOrder` — as an ordered
 * array of child ids. An array and the rows it names can always disagree: a row
 * created since the array was last written is not in it, and a deleted row's id
 * still is. Neither may produce a broken view, so every read goes through here
 * rather than trusting the array to be a faithful index.
 *
 * Deliberately import-free, for the reason `src/lib/dragGeometry.ts` is: the
 * whole of the ordering rule is then exercisable without a browser, a store or a
 * database (`src/lib/__tests__/orderArray.test.ts`).
 */

/** The minimum a row must carry to be ordered: an id, and a tiebreaker. */
interface Orderable {
  id: string;
  createdAt?: string | Date | null;
}

const timeOf = (row: Orderable): number => {
  const at = row.createdAt;
  if (at == null) return 0;
  const ms = at instanceof Date ? at.getTime() : new Date(at).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

/**
 * Order `rows` by their id's index in `order`.
 *
 * - Ids missing from `order` — newly created, or never ordered — fall to the
 *   **end**, oldest first, ties broken by id so the result is total and stable.
 *   That is also what an empty `order` means: no manual order, so createdAt
 *   order, which is the app's own pre-`rank` behaviour.
 * - Ids in `order` with no matching row are ignored.
 * - A duplicated id in `order` is read at its first position; the later mention
 *   is a repetition, not a second slot.
 *
 * The input is never mutated.
 */
export function orderBy<T extends Orderable>(
  order: readonly string[],
  rows: readonly T[],
): T[] {
  if (rows.length === 0) return [];

  // First mention wins, so a duplicated id cannot move a row later than the
  // array's own first claim about it.
  const index = new Map<string, number>();
  for (let i = 0; i < order.length; i++) {
    if (!index.has(order[i])) index.set(order[i], i);
  }

  const placed: { row: T; at: number }[] = [];
  const rest: T[] = [];
  for (const row of rows) {
    const at = index.get(row.id);
    if (at === undefined) rest.push(row);
    else placed.push({ row, at });
  }

  // Two rows can share a slot only if `rows` itself repeats an id; `at` ties
  // then break by nothing in particular, and `sort` being stable keeps them in
  // the order they arrived, which is the least surprising answer.
  placed.sort((a, b) => a.at - b.at);
  rest.sort((a, b) =>
    timeOf(a) - timeOf(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );

  return [...placed.map((p) => p.row), ...rest];
}

/**
 * `order` with `ids` added — at the end, or at the front with `at: "start"` —
 * ignoring any that are already in it.
 *
 * The create / re-home half of §6's bookkeeping, as a pure function, because
 * both sides of the storage seam now do exactly this: the server writes it to
 * the container's column (`addToOrder` in `src/repositories/ordering.ts`) and
 * the guest library writes it to IndexedDB (`src/store/backend/local.ts`).
 * Returns `order` itself when there is nothing to add.
 */
export function withIds(
  order: readonly string[],
  ids: readonly string[],
  at: "start" | "end" = "end",
): string[] {
  const present = new Set(order);
  const fresh = ids.filter((id) => !present.has(id));
  if (fresh.length === 0) return [...order];
  return at === "start" ? [...fresh, ...order] : [...order, ...fresh];
}

/** `order` with `ids` dropped — the delete / re-home half of the same rule. */
export function withoutIds(
  order: readonly string[],
  ids: readonly string[],
): string[] {
  const gone = new Set(ids);
  return order.filter((id) => !gone.has(id));
}
