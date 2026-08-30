import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withIds, withoutIds } from "@/lib/orderArray";
import { APP_ORIGIN } from "@/lib/changes/events";
import { notifyChange } from "@/lib/changes/notify";

/**
 * Server-side ordering: the order arrays, and re-homing a row between
 * containers (docs/plans/ordering-simplification.md §4).
 *
 * A list's order lives on the row that owns the list, as an ordered array of
 * child ids — `User.rootOrder`, `Series.postOrder`, `Project.seriesOrder`,
 * `Document.tabOrder`. A reorder is one array write: the client sends the array
 * it already rendered and this module persists it verbatim. Nothing here
 * computes a position, and since phase 5 there is no per-row ordering column
 * left to compute one *from* — a create appends to its container's array the
 * same way a re-home does.
 *
 * Everything here accepts a Prisma client or an interactive-transaction client
 * (`PrismaClient` is structurally assignable to `TransactionClient`), so a
 * single move can run standalone or be composed into a larger transaction.
 */
type Db = Prisma.TransactionClient;

/**
 * One list whose order is stored as an array of ids on the row that owns it.
 *
 * Four kinds, because there are four containers — the plan's §2 table names
 * only three and misses `Project`, which both sits in the root list and owns
 * the order of its member series.
 */
export type OrderContainer =
  | { kind: "root"; authorId: string }
  | { kind: "series"; seriesId: string }
  | { kind: "project"; projectId: string }
  | { kind: "tabs"; parentId: string };

/** The order container a document lives in, from its own columns. */
export const containerOf = (doc: {
  authorId: string;
  seriesId: string | null;
  parentId: string | null;
}): OrderContainer =>
  doc.seriesId
    ? { kind: "series", seriesId: doc.seriesId }
    : doc.parentId
    ? { kind: "tabs", parentId: doc.parentId }
    : { kind: "root", authorId: doc.authorId };

/** The order container a series lives in: its project, or the root list. */
export const seriesContainerOf = (series: {
  authorId: string;
  projectId: string | null;
}): OrderContainer =>
  series.projectId
    ? { kind: "project", projectId: series.projectId }
    : { kind: "root", authorId: series.authorId };

// ─── Reading and writing one container's array ───────────────────────────────

/** The container's stored order, or `[]` when the owning row is gone. */
export async function readOrder(
  db: Db,
  container: OrderContainer,
): Promise<string[]> {
  switch (container.kind) {
    case "root": {
      const row = await db.user.findUnique({
        where: { id: container.authorId },
        select: { rootOrder: true },
      });
      return row?.rootOrder ?? [];
    }
    case "series": {
      const row = await db.series.findUnique({
        where: { id: container.seriesId },
        select: { postOrder: true },
      });
      return row?.postOrder ?? [];
    }
    case "project": {
      const row = await db.project.findUnique({
        where: { id: container.projectId },
        select: { seriesOrder: true },
      });
      return row?.seriesOrder ?? [];
    }
    case "tabs": {
      const row = await db.document.findUnique({
        where: { id: container.parentId },
        select: { tabOrder: true },
      });
      return row?.tabOrder ?? [];
    }
  }
}

/**
 * Persist `ids` as the container's order, verbatim. Private: every caller goes
 * through {@link setOrder} (validated) or the append/remove helpers below, so
 * an unvalidated array cannot reach a column.
 */
async function writeOrder(
  db: Db,
  container: OrderContainer,
  ids: string[],
): Promise<void> {
  switch (container.kind) {
    case "root":
      await db.user.update({
        where: { id: container.authorId },
        data: { rootOrder: ids },
      });
      return;
    case "series":
      await db.series.update({
        where: { id: container.seriesId },
        data: { postOrder: ids },
      });
      return;
    case "project":
      await db.project.update({
        where: { id: container.projectId },
        data: { seriesOrder: ids },
      });
      return;
    case "tabs": {
      // Rearranging a post's tab strip is not an edit of the post, so its
      // `updatedAt` is pinned rather than left to `@updatedAt` — otherwise a
      // reorder would push the post to the top of every recency-sorted list.
      // Naming the column in `data` is what overrides the annotation. The other
      // three containers are the list's *owner* (a user, a series, a project),
      // for which "its order changed" is a change to the row.
      const parent = await db.document.findUnique({
        where: { id: container.parentId },
        select: { updatedAt: true },
      });
      await db.document.update({
        where: { id: container.parentId },
        data: {
          tabOrder: ids,
          ...(parent ? { updatedAt: parent.updatedAt } : {}),
        },
      });
      return;
    }
  }
}

/**
 * Every id that legally belongs in this container's array, in one query per
 * table the container draws from.
 *
 * This is the authorization primitive for an order write, and the reason it
 * answers for the whole set at once is `findUnownedDocumentIds`': a body that is
 * a *list* of ids invites checking only the first one. The container is already
 * proven to be the caller's before this runs, and membership is scoped by the
 * container, so an id belonging to another author simply is not in the result.
 *
 * The root list is the only one that spans three tables — standalone documents,
 * ungrouped series and projects share it, which is why they interleave.
 */
export async function orderMemberIds(
  db: Db,
  container: OrderContainer,
): Promise<string[]> {
  switch (container.kind) {
    case "root": {
      const [docs, series, projects] = await Promise.all([
        db.document.findMany({
          where: {
            authorId: container.authorId,
            seriesId: null,
            parentId: null,
          },
          select: { id: true },
        }),
        db.series.findMany({
          where: { authorId: container.authorId, projectId: null },
          select: { id: true },
        }),
        db.project.findMany({
          where: { authorId: container.authorId },
          select: { id: true },
        }),
      ]);
      return [...docs, ...series, ...projects].map((row) => row.id);
    }
    case "series": {
      const posts = await db.document.findMany({
        where: { seriesId: container.seriesId },
        select: { id: true },
      });
      return posts.map((row) => row.id);
    }
    case "project": {
      const members = await db.series.findMany({
        where: { projectId: container.projectId },
        select: { id: true },
      });
      return members.map((row) => row.id);
    }
    case "tabs": {
      const children = await db.document.findMany({
        where: { parentId: container.parentId },
        select: { id: true },
      });
      return children.map((row) => row.id);
    }
  }
}

/** Why an order write was refused. Both answers are the caller's mistake. */
export type OrderRejection =
  | { reason: "foreign"; ids: string[] }
  | { reason: "duplicate"; ids: string[] };

/**
 * Validate a proposed order against the container's live membership.
 *
 * - An id that is not a member is **refused**. A body naming a foreign id is
 *   never a race — it is a caller reaching into someone else's list — and
 *   accepting it would adopt that row into this author's order.
 * - A repeated id is **refused**. The tolerant reader silently collapses a
 *   duplicate to its first mention (§6), so accepting one would hide the bug
 *   that produced it rather than surface it.
 * - A *missing* member is **accepted**. A client sends the list it rendered, and
 *   that list can legitimately lag by a row (created in another tab, arriving on
 *   the change feed a moment later); rejecting would make every reorder during
 *   such a window fail. {@link setOrder} keeps the unnamed members rather than
 *   dropping them, so a short array never destroys the order of what it omits.
 */
export function validateOrder(
  memberIds: readonly string[],
  orderedIds: readonly string[],
): OrderRejection | null {
  const members = new Set(memberIds);
  const foreign = orderedIds.filter((id) => !members.has(id));
  if (foreign.length > 0) return { reason: "foreign", ids: [...new Set(foreign)] };

  const seen = new Set<string>();
  const duplicate: string[] = [];
  for (const id of orderedIds) {
    if (seen.has(id)) duplicate.push(id);
    else seen.add(id);
  }
  if (duplicate.length > 0) {
    return { reason: "duplicate", ids: [...new Set(duplicate)] };
  }
  return null;
}

/**
 * Write a container's order (docs/plans/ordering-simplification.md §4).
 *
 * Rejects a foreign or repeated id (see {@link validateOrder}); otherwise
 * persists `orderedIds` followed by every current member the caller did not
 * name, each keeping the relative position it already had. That tail is what
 * makes a partial submission safe: the array stays a complete index of the
 * container instead of quietly demoting whatever the client had not loaded.
 *
 * Returns the array as written, or the rejection.
 */
export async function setOrder(
  db: Db,
  container: OrderContainer,
  orderedIds: string[],
): Promise<{ ok: true; order: string[] } | { ok: false } & OrderRejection> {
  const memberIds = await orderMemberIds(db, container);
  const rejection = validateOrder(memberIds, orderedIds);
  if (rejection) return { ok: false, ...rejection };

  const named = new Set(orderedIds);
  const members = new Set(memberIds);
  const previous = await readOrder(db, container);
  const tail = [
    ...previous.filter((id) => members.has(id) && !named.has(id)),
  ];
  const known = new Set([...named, ...tail]);
  const unheard = memberIds.filter((id) => !known.has(id));

  const order = [...orderedIds, ...tail, ...unheard];
  await writeOrder(db, container, order);
  return { ok: true, order };
}

/**
 * Add `ids` to the end (or, with `at: "start"`, the front) of a container's
 * array, ignoring any already present.
 *
 * The create/re-home half of §6's bookkeeping. There is nothing to recompute an
 * array *from* — it is the only record of the order there is — so maintenance
 * is explicit at every write, and this is the one place that does it.
 */
export async function addToOrder(
  db: Db,
  container: OrderContainer,
  ids: string[],
  at: "start" | "end" = "end",
): Promise<void> {
  if (ids.length === 0) return;
  const current = await readOrder(db, container);
  const next = withIds(current, ids, at);
  if (next.length === current.length) return;
  await writeOrder(db, container, next);
}

/** Drop `ids` from a container's array (the delete/re-home half of §6). */
export async function removeFromOrder(
  db: Db,
  container: OrderContainer,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const current = await readOrder(db, container);
  const next = withoutIds(current, ids);
  if (next.length === current.length) return;
  await writeOrder(db, container, next);
}

// ─── Re-homing ───────────────────────────────────────────────────────────────

/**
 * Re-home a document: set its container (series / tab-group / root), atomically.
 *
 * **Appends only** (§4, decided). The document's id leaves the source
 * container's array and joins the end of the destination's; a caller that
 * dropped it at a specific slot follows with an order write to position it. Two
 * small calls rather than one combined position payload.
 *
 * Container membership is exclusive — a document is in a series XOR a tab-group
 * XOR root — so setting `seriesId` clears `parentId` and vice versa.
 */
export async function movePost(
  db: Db,
  args: {
    id: string;
    destination: { seriesId?: string | null; parentId?: string | null };
  },
): Promise<void> {
  const doc = await db.document.findUnique({
    where: { id: args.id },
    // `seriesId` and `parentId` are read for the order arrays: the container
    // the document is *leaving* owns one too, and it has to lose the id.
    select: { authorId: true, seriesId: true, parentId: true },
  });
  if (!doc) throw new Error(`movePost: document ${args.id} not found`);

  // Exclusivity: a series destination wins; otherwise a parent; otherwise root.
  const seriesId = args.destination.seriesId ?? null;
  const parentId = seriesId ? null : (args.destination.parentId ?? null);

  if (parentId) await assertNoParentCycle(db, args.id, parentId);

  const from = containerOf(doc);
  const to = containerOf({ authorId: doc.authorId, seriesId, parentId });

  await db.document.update({
    where: { id: args.id },
    data: { seriesId, parentId },
  });

  // Both ends of the move, in the same transaction as the move itself. A move
  // whose destination is the current container is a no-op for both arrays.
  await removeFromOrder(db, from, [args.id]);
  await addToOrder(db, to, [args.id]);

  // `document.updated` — a move changes where the sidebar draws the row, which
  // is a change the client answers exactly as it answers a rename (docs/plans/
  // changes-detection.md §2.1). Emitted on `db`, so when this runs inside
  // `moveDocumentTx` the notification commits with the move.
  await notifyChange(db, {
    kind: "document.updated",
    id: args.id,
    authorId: doc.authorId,
    origin: APP_ORIGIN,
  });
}

/**
 * Append `docIds` (in the given order) to the end of the author's root list.
 * Used when a delete reparents rows via `onDelete: SetNull` (a deleted series'
 * posts, a deleted tab-parent's children) — the container they were ordered in
 * no longer exists, so they arrive at root the way any re-home arrives: at the
 * end, in the order they were in.
 */
export async function freeIntoRoot(
  db: Db,
  authorId: string,
  docIds: string[],
): Promise<void> {
  if (docIds.length === 0) return;
  await db.document.updateMany({
    where: { id: { in: docIds } },
    data: { seriesId: null, parentId: null },
  });
  // The container they came from is being deleted by the caller, so only root
  // has an array left to fix. `docIds` arrives in the order the dead container
  // held them, and `addToOrder` appends in that order, so the group lands at
  // the end of root having kept its own shape.
  await addToOrder(db, { kind: "root", authorId }, docIds);
}

/** Walk parent links up from `parentId`; throw if it loops back to `movingId`. */
async function assertNoParentCycle(
  db: Db,
  movingId: string,
  parentId: string,
): Promise<void> {
  const seen = new Set<string>();
  let current: string | null = parentId;
  while (current) {
    if (current === movingId) {
      throw new Error("movePost: would create a parent cycle");
    }
    if (seen.has(current)) break; // pre-existing cycle elsewhere — stop walking
    seen.add(current);
    const parent: { parentId: string | null } | null = await db.document
      .findUnique({
        where: { id: current },
        select: { parentId: true },
      });
    current = parent?.parentId ?? null;
  }
}

/**
 * Re-home a series: set its container (a project, or the root list). Appends,
 * for the reason {@link movePost} appends.
 *
 * Setting `projectId` to null re-homes the series to the shared root space
 * (where it interleaves with root documents and projects); setting it to a
 * project id nests it among that project's series.
 */
export async function moveSeries(
  db: Db,
  args: { id: string; destination: { projectId?: string | null } },
): Promise<void> {
  const series = await db.series.findUnique({
    where: { id: args.id },
    select: { authorId: true, projectId: true },
  });
  if (!series) throw new Error(`moveSeries: series ${args.id} not found`);

  const projectId = args.destination.projectId ?? null;
  const from = seriesContainerOf(series);
  const to = seriesContainerOf({ authorId: series.authorId, projectId });

  await db.series.update({ where: { id: args.id }, data: { projectId } });

  await removeFromOrder(db, from, [args.id]);
  await addToOrder(db, to, [args.id]);
}

/**
 * Append `seriesIds` (in the given order) to the end of the author's root list
 * and clear their `projectId`. Used when a project is deleted and its member
 * series are freed to root; the mirror of {@link freeIntoRoot} for series.
 */
export async function freeSeriesIntoRoot(
  db: Db,
  authorId: string,
  seriesIds: string[],
): Promise<void> {
  if (seriesIds.length === 0) return;
  await db.series.updateMany({
    where: { id: { in: seriesIds } },
    data: { projectId: null },
  });
  await addToOrder(db, { kind: "root", authorId }, seriesIds);
}

// Convenience: run a re-home outside an existing transaction.
export const moveDocumentTx = (
  args: Parameters<typeof movePost>[1],
): Promise<void> => prisma.$transaction((tx) => movePost(tx, args));

export const moveSeriesTx = (
  args: Parameters<typeof moveSeries>[1],
): Promise<void> => prisma.$transaction((tx) => moveSeries(tx, args));

/** Run one validated order write outside an existing transaction. */
export const setOrderTx = (
  container: OrderContainer,
  orderedIds: string[],
): Promise<Awaited<ReturnType<typeof setOrder>>> =>
  prisma.$transaction((tx) => setOrder(tx, container, orderedIds));
