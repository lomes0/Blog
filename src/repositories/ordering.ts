import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rankBetween, ranksAfter } from "@/lib/ordering";

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
 */
type Db = Prisma.TransactionClient;

export interface Container {
  authorId: string;
  seriesId: string | null;
  parentId: string | null;
}

/** Largest rank currently in `container`, or null when it is empty. */
async function maxRank(
  db: Db,
  container: Container,
  excludeDocIds: string[] = [],
): Promise<string | null> {
  const notSelf = excludeDocIds.length
    ? { id: { notIn: excludeDocIds } }
    : {};

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
  // Root: standalone documents + series share one rank space.
  const [topDoc, topSeries] = await Promise.all([
    db.document.findFirst({
      where: {
        authorId: container.authorId,
        seriesId: null,
        parentId: null,
        ...notSelf,
      },
      orderBy: { rank: "desc" },
      select: { rank: true },
    }),
    db.series.findFirst({
      where: { authorId: container.authorId },
      orderBy: { rank: "desc" },
      select: { rank: true },
    }),
  ]);
  return maxStr(topDoc?.rank ?? null, topSeries?.rank ?? null);
}

/** A rank that appends a new row to the end of `container`. */
export async function rankForAppend(
  db: Db,
  container: Container,
  excludeDocIds: string[] = [],
): Promise<string> {
  return rankBetween(await maxRank(db, container, excludeDocIds), null);
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
export async function moveDocument(
  db: Db,
  args: {
    id: string;
    destination: { seriesId?: string | null; parentId?: string | null };
    between?: { afterRank?: string | null; beforeRank?: string | null };
  },
): Promise<void> {
  const doc = await db.document.findUnique({
    where: { id: args.id },
    select: { authorId: true },
  });
  if (!doc) throw new Error(`moveDocument: document ${args.id} not found`);

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
      throw new Error("moveDocument: would create a parent cycle");
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

const maxStr = (a: string | null, b: string | null): string | null =>
  a == null ? b : b == null ? a : a > b ? a : b;

// Convenience: run a move outside an existing transaction.
export const moveDocumentTx = (
  args: Parameters<typeof moveDocument>[1],
): Promise<void> => prisma.$transaction((tx) => moveDocument(tx, args));
