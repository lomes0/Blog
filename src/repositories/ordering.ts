import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { compareRankThenId, rankBetween, ranksAfter } from "@/lib/ordering";
import { APP_ORIGIN } from "@/lib/changes/events";
import { notifyChange } from "@/lib/changes/notify";

/**
 * Server-side ordering: compute `rank` keys against the live database and
 * re-home documents between containers.
 *
 * A document's container is derived — `seriesId ?? parentId ?? root(author)` —
 * and `rank` positions it among its siblings there. The author's root list is a
 * *shared* rank space across standalone Documents and Series, so they
 * interleave freely; {@link maxRank} reflects that by scanning both tables.
 *
 * Everything here accepts a Prisma client or an interactive-transaction client
 * (`PrismaClient` is structurally assignable to `TransactionClient`), so a
 * single move can run standalone or be composed into a larger transaction.
 *
 * **It also keeps the order arrays** — `User.rootOrder`, `Series.postOrder`,
 * `Project.seriesOrder`, `Document.tabOrder` — in step with the ranks it writes
 * (docs/plans/ordering-simplification.md §8, phases 1-3). Reads come from the
 * arrays now, so a reorder that moved only a `rank` would leave the array
 * stale and the reorder would appear to do nothing. Every rank write is
 * therefore followed by {@link syncOrder} on the container(s) it touched, in
 * the same transaction, and this is the only file that does it — phase 4
 * deletes the rank half of each pair rather than adding the array half.
 */
type Db = Prisma.TransactionClient;

export interface Container {
  authorId: string;
  seriesId: string | null;
  parentId: string | null;
}

/**
 * Largest rank in the author's *root* list, or null when empty. The root is a
 * shared rank space across three kinds of row — standalone documents, ungrouped
 * series (`projectId = null`) and projects — so they interleave freely. In-project
 * series are excluded here: they live in their project's space, not root.
 */
async function maxRootRank(
  db: Db,
  authorId: string,
  exclude: { docIds?: string[]; seriesIds?: string[] } = {},
): Promise<string | null> {
  const docNotSelf = exclude.docIds?.length
    ? { id: { notIn: exclude.docIds } }
    : {};
  const seriesNotSelf = exclude.seriesIds?.length
    ? { id: { notIn: exclude.seriesIds } }
    : {};
  const [topDoc, topSeries, topProject] = await Promise.all([
    db.document.findFirst({
      where: { authorId, seriesId: null, parentId: null, ...docNotSelf },
      orderBy: { rank: "desc" },
      select: { rank: true },
    }),
    db.series.findFirst({
      where: { authorId, projectId: null, ...seriesNotSelf },
      orderBy: { rank: "desc" },
      select: { rank: true },
    }),
    db.project.findFirst({
      where: { authorId },
      orderBy: { rank: "desc" },
      select: { rank: true },
    }),
  ]);
  return maxStr(
    maxStr(topDoc?.rank ?? null, topSeries?.rank ?? null),
    topProject?.rank ?? null,
  );
}

/** Largest rank currently in `container`, or null when it is empty. */
async function maxRank(
  db: Db,
  container: Container,
  excludeDocIds: string[] = [],
): Promise<string | null> {
  const notSelf = excludeDocIds.length ? { id: { notIn: excludeDocIds } } : {};

  if (container.seriesId) {
    const top = await db.document.findFirst({
      where: { seriesId: container.seriesId, ...notSelf },
      orderBy: { rank: "desc" },
      select: { rank: true },
    });
    return top?.rank ?? null;
  }
  if (container.parentId) {
    const top = await db.document.findFirst({
      where: { parentId: container.parentId, ...notSelf },
      orderBy: { rank: "desc" },
      select: { rank: true },
    });
    return top?.rank ?? null;
  }
  // Root: standalone documents + ungrouped series + projects share one space.
  return maxRootRank(db, container.authorId, { docIds: excludeDocIds });
}

/**
 * Smallest rank in the author's *root* list, or null when empty. The mirror of
 * {@link maxRootRank} — same three-table space, opposite end.
 */
async function minRootRank(
  db: Db,
  authorId: string,
  exclude: { docIds?: string[]; seriesIds?: string[] } = {},
): Promise<string | null> {
  const docNotSelf = exclude.docIds?.length
    ? { id: { notIn: exclude.docIds } }
    : {};
  const seriesNotSelf = exclude.seriesIds?.length
    ? { id: { notIn: exclude.seriesIds } }
    : {};
  const [firstDoc, firstSeries, firstProject] = await Promise.all([
    db.document.findFirst({
      where: { authorId, seriesId: null, parentId: null, ...docNotSelf },
      orderBy: { rank: "asc" },
      select: { rank: true },
    }),
    db.series.findFirst({
      where: { authorId, projectId: null, ...seriesNotSelf },
      orderBy: { rank: "asc" },
      select: { rank: true },
    }),
    db.project.findFirst({
      where: { authorId },
      orderBy: { rank: "asc" },
      select: { rank: true },
    }),
  ]);
  return minStr(
    minStr(firstDoc?.rank ?? null, firstSeries?.rank ?? null),
    firstProject?.rank ?? null,
  );
}

/** Smallest rank currently in `container`, or null when it is empty. */
async function minRank(
  db: Db,
  container: Container,
  excludeDocIds: string[] = [],
): Promise<string | null> {
  const notSelf = excludeDocIds.length ? { id: { notIn: excludeDocIds } } : {};

  if (container.seriesId) {
    const first = await db.document.findFirst({
      where: { seriesId: container.seriesId, ...notSelf },
      orderBy: { rank: "asc" },
      select: { rank: true },
    });
    return first?.rank ?? null;
  }
  if (container.parentId) {
    const first = await db.document.findFirst({
      where: { parentId: container.parentId, ...notSelf },
      orderBy: { rank: "asc" },
      select: { rank: true },
    });
    return first?.rank ?? null;
  }
  return minRootRank(db, container.authorId, { docIds: excludeDocIds });
}

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

const byRankThenId = (
  a: { id: string; rank: string | null },
  b: { id: string; rank: string | null },
) => compareRankThenId(a.rank, a.id, b.rank, b.id);

const rankedIds = (rows: { id: string; rank: string | null }[]): string[] =>
  [...rows].sort(byRankThenId).map((row) => row.id);

/**
 * Recompute one container's order array from the ranks of its live rows, and
 * write it.
 *
 * A full recompute rather than a splice, for two reasons: it is what makes the
 * array self-heal from any drift (a row created by a path that forgot to sync,
 * an id left behind by a delete), and it keeps the two representations
 * derivable from each other while both exist. It is a small read — one
 * container's rows, ids and ranks only — on lists that are tens of rows long.
 *
 * Runs on the caller's client, so inside a transaction it commits with the move
 * that prompted it: a reorder can never half-happen.
 */
export async function syncOrder(
  db: Db,
  container: OrderContainer,
): Promise<void> {
  switch (container.kind) {
    case "root": {
      // The shared root space: standalone documents, ungrouped series and
      // projects. Read the same three sets `maxRootRank` does, for the same
      // reason — they interleave.
      const [docs, series, projects] = await Promise.all([
        db.document.findMany({
          where: {
            authorId: container.authorId,
            seriesId: null,
            parentId: null,
          },
          select: { id: true, rank: true },
        }),
        db.series.findMany({
          where: { authorId: container.authorId, projectId: null },
          select: { id: true, rank: true },
        }),
        db.project.findMany({
          where: { authorId: container.authorId },
          select: { id: true, rank: true },
        }),
      ]);
      await db.user.update({
        where: { id: container.authorId },
        data: { rootOrder: rankedIds([...docs, ...series, ...projects]) },
      });
      return;
    }
    case "series": {
      const posts = await db.document.findMany({
        where: { seriesId: container.seriesId },
        select: { id: true, rank: true },
      });
      await db.series.update({
        where: { id: container.seriesId },
        data: { postOrder: rankedIds(posts) },
      });
      return;
    }
    case "project": {
      const members = await db.series.findMany({
        where: { projectId: container.projectId },
        select: { id: true, rank: true },
      });
      await db.project.update({
        where: { id: container.projectId },
        data: { seriesOrder: rankedIds(members) },
      });
      return;
    }
    case "tabs": {
      const children = await db.document.findMany({
        where: { parentId: container.parentId },
        select: { id: true, rank: true },
      });
      await db.document.update({
        where: { id: container.parentId },
        data: { tabOrder: rankedIds(children) },
      });
      return;
    }
  }
}

/** {@link syncOrder} for a source/destination pair, skipping the repeat. */
async function syncOrders(
  db: Db,
  containers: OrderContainer[],
): Promise<void> {
  const seen = new Set<string>();
  for (const container of containers) {
    const key = JSON.stringify(container);
    if (seen.has(key)) continue;
    seen.add(key);
    await syncOrder(db, container);
  }
}

/**
 * Recompute *every* order array an author owns.
 *
 * For the bulk paths that mint many ranks and would otherwise need a sync per
 * row — the import route. Cheaper than that, and the same answer.
 */
export async function resyncAuthorOrder(
  db: Db,
  authorId: string,
): Promise<void> {
  const [series, projects, parents] = await Promise.all([
    db.series.findMany({ where: { authorId }, select: { id: true } }),
    db.project.findMany({ where: { authorId }, select: { id: true } }),
    db.document.findMany({
      where: { authorId, children: { some: {} } },
      select: { id: true },
    }),
  ]);
  await syncOrder(db, { kind: "root", authorId });
  for (const s of series) await syncOrder(db, { kind: "series", seriesId: s.id });
  for (const p of projects) {
    await syncOrder(db, { kind: "project", projectId: p.id });
  }
  for (const d of parents) await syncOrder(db, { kind: "tabs", parentId: d.id });
}

/** A rank that appends a new row to the end of `container`. */
export async function rankForAppend(
  db: Db,
  container: Container,
  excludeDocIds: string[] = [],
): Promise<string> {
  return rankBetween(await maxRank(db, container, excludeDocIds), null);
}

/** A rank that puts a new row at the start of `container`. */
export async function rankForPrepend(
  db: Db,
  container: Container,
  excludeDocIds: string[] = [],
): Promise<string> {
  return rankBetween(null, await minRank(db, container, excludeDocIds));
}

/**
 * Re-home a document: set its container (series / tab-group / root) and mint a
 * fresh rank for the destination, atomically. In-place reorder is the same call
 * with the destination equal to the current container.
 *
 * Container membership is exclusive — a document is in a series XOR a tab-group
 * XOR root — so setting `seriesId` clears `parentId` and vice versa. Pass
 * neighbour ranks in `between` to drop at a position; omit it to append.
 */
export async function movePost(
  db: Db,
  args: {
    id: string;
    destination: { seriesId?: string | null; parentId?: string | null };
    between?: { afterRank?: string | null; beforeRank?: string | null };
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

  const { afterRank, beforeRank } = args.between ?? {};
  const rank = afterRank != null || beforeRank != null
    ? rankBetween(afterRank ?? null, beforeRank ?? null)
    : await rankForAppend(
      db,
      { authorId: doc.authorId, seriesId, parentId },
      [args.id],
    );

  await db.document.update({
    where: { id: args.id },
    data: { seriesId, parentId, rank },
  });

  // Both ends of the move, in the same transaction as the move itself. A
  // reorder within one container names it twice; `syncOrders` writes it once.
  await syncOrders(db, [
    containerOf({ authorId: doc.authorId, seriesId, parentId }),
    containerOf(doc),
  ]);

  // `document.updated` — a move changes where the sidebar draws the row, which
  // is a change the client answers exactly as it answers a rename (docs/plans/
  // changes-detection.md §2.1). Emitted on `db`, so when this runs inside
  // `moveDocumentTx` the notification commits with the move; `doc.authorId` is
  // the row this function already had to read to compute the rank, so the
  // payload costs no extra query.
  await notifyChange(db, {
    kind: "document.updated",
    id: args.id,
    authorId: doc.authorId,
    origin: APP_ORIGIN,
  });
}

/**
 * Append `docIds` (in the given order) to the end of the author's root list,
 * re-minting their ranks in the root space. Used when a delete reparents rows
 * via `onDelete: SetNull` (a deleted series' posts, a deleted tab-parent's
 * children) — their old ranks belonged to a container that no longer exists.
 * The freed docs are excluded from the base so their stale ranks don't skew it.
 */
export async function reRankIntoRoot(
  db: Db,
  authorId: string,
  docIds: string[],
): Promise<void> {
  if (docIds.length === 0) return;
  const base = await maxRank(
    db,
    { authorId, seriesId: null, parentId: null },
    docIds,
  );
  const keys = ranksAfter(base, docIds.length);
  await Promise.all(
    docIds.map((id, i) =>
      db.document.update({
        where: { id },
        data: { rank: keys[i], seriesId: null, parentId: null },
      })
    ),
  );
  // The container they came from is being deleted by the caller, so only root
  // has an array left to fix.
  await syncOrder(db, { kind: "root", authorId });
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

/** Largest rank among a project's member series, or null when it is empty. */
async function maxSeriesRankInProject(
  db: Db,
  projectId: string,
  excludeSeriesId?: string,
): Promise<string | null> {
  const top = await db.series.findFirst({
    where: {
      projectId,
      ...(excludeSeriesId ? { id: { not: excludeSeriesId } } : {}),
    },
    orderBy: { rank: "desc" },
    select: { rank: true },
  });
  return top?.rank ?? null;
}

/**
 * A rank that appends a series to the end of its container: the project's member
 * list when `projectId` is set, otherwise the author's root list.
 *
 * A series' container rule (project XOR root) is its own — not the document rule
 * {@link rankForAppend} encodes (series XOR tab-group XOR root) — so it gets its
 * own append rather than a `Container` that would have to carry a fourth field
 * meaningless to documents. Creating a series and moving one both land here, so
 * a series born inside a project is ranked the same way one dragged into it is.
 *
 * `excludeSeriesId` drops a series from its own baseline — for a move, whose
 * subject is already in the container it is being re-ranked within.
 */
export async function rankForAppendSeries(
  db: Db,
  args: { authorId: string; projectId?: string | null },
  excludeSeriesId?: string,
): Promise<string> {
  const base = args.projectId
    ? await maxSeriesRankInProject(db, args.projectId, excludeSeriesId)
    : await maxRootRank(db, args.authorId, {
      seriesIds: excludeSeriesId ? [excludeSeriesId] : [],
    });
  return rankBetween(base, null);
}

/**
 * Re-home a series: set its container (a project, or the root list) and mint a
 * fresh rank for the destination. A series' container is `projectId ?? root`;
 * its `rank` positions it among its siblings there. Pass `destination` to change
 * the container (omit to keep the current one — an in-place reorder); pass
 * `between` to drop at a position, or omit it to append.
 *
 * Setting `projectId` to null re-homes the series to the shared root space
 * (where it interleaves with root documents and projects); setting it to a
 * project id nests it among that project's series.
 */
export async function moveSeries(
  db: Db,
  args: {
    id: string;
    destination?: { projectId?: string | null };
    between?: { afterRank?: string | null; beforeRank?: string | null };
  },
): Promise<void> {
  const series = await db.series.findUnique({
    where: { id: args.id },
    select: { authorId: true, projectId: true },
  });
  if (!series) throw new Error(`moveSeries: series ${args.id} not found`);

  // A provided destination sets the container; otherwise keep the current one.
  const projectId = args.destination
    ? (args.destination.projectId ?? null)
    : series.projectId;

  const { afterRank, beforeRank } = args.between ?? {};
  const rank = afterRank != null || beforeRank != null
    ? rankBetween(afterRank ?? null, beforeRank ?? null)
    : await rankForAppendSeries(
      db,
      { authorId: series.authorId, projectId },
      args.id,
    );

  await db.series.update({
    where: { id: args.id },
    data: { projectId, rank },
  });

  await syncOrders(db, [
    seriesContainerOf({ authorId: series.authorId, projectId }),
    seriesContainerOf(series),
  ]);
}

/**
 * Reorder a project within its author's root list. A project always lives at the
 * root — it has no container to change — so this only re-ranks it, in the same
 * shared rank space as root documents and ungrouped series.
 */
export async function moveProject(
  db: Db,
  args: {
    id: string;
    between?: { afterRank?: string | null; beforeRank?: string | null };
  },
): Promise<void> {
  const project = await db.project.findUnique({
    where: { id: args.id },
    select: { authorId: true },
  });
  if (!project) throw new Error(`moveProject: project ${args.id} not found`);

  const { afterRank, beforeRank } = args.between ?? {};
  const rank = afterRank != null || beforeRank != null
    ? rankBetween(afterRank ?? null, beforeRank ?? null)
    : rankBetween(await maxRootRank(db, project.authorId), null);

  await db.project.update({ where: { id: args.id }, data: { rank } });
  await syncOrder(db, { kind: "root", authorId: project.authorId });
}

/**
 * Append `seriesIds` (in the given order) to the end of the author's root list,
 * re-minting their ranks in the root space and clearing their `projectId`. Used
 * when a project is deleted (its member series are freed to root) — their old
 * ranks belonged to the project's space, which no longer exists. The freed
 * series are excluded from the base so their stale ranks don't skew it.
 *
 * Call this *after* the project row is gone so the root scan doesn't count it.
 */
export async function reRankSeriesIntoRoot(
  db: Db,
  authorId: string,
  seriesIds: string[],
): Promise<void> {
  if (seriesIds.length === 0) return;
  const base = await maxRootRank(db, authorId, { seriesIds });
  const keys = ranksAfter(base, seriesIds.length);
  await Promise.all(
    seriesIds.map((id, i) =>
      db.series.update({
        where: { id },
        data: { rank: keys[i], projectId: null },
      })
    ),
  );
  // As in `reRankIntoRoot`: the project they came from is already gone.
  await syncOrder(db, { kind: "root", authorId });
}

const maxStr = (a: string | null, b: string | null): string | null =>
  a == null ? b : b == null ? a : a > b ? a : b;

const minStr = (a: string | null, b: string | null): string | null =>
  a == null ? b : b == null ? a : a < b ? a : b;

// Convenience: run a move outside an existing transaction.
export const moveDocumentTx = (
  args: Parameters<typeof movePost>[1],
): Promise<void> => prisma.$transaction((tx) => movePost(tx, args));

export const moveSeriesTx = (
  args: Parameters<typeof moveSeries>[1],
): Promise<void> => prisma.$transaction((tx) => moveSeries(tx, args));

export const moveProjectTx = (
  args: Parameters<typeof moveProject>[1],
): Promise<void> => prisma.$transaction((tx) => moveProject(tx, args));
