/**
 * One-time backfill: assign a `rank` to every Document and Series that lacks
 * one, reproducing the current display order so the migration is visually
 * neutral. Run AFTER `add_rank_nullable` and BEFORE making `rank` NOT NULL.
 *
 *   node prisma/scripts/backfill-ranks.ts          # apply
 *   node prisma/scripts/backfill-ranks.ts --dry    # report only, no writes
 *
 * Idempotent: a container whose rows already all have a rank is skipped, so
 * re-running is safe.
 *
 * Container model (mirrors src/lib/ordering):
 *   - root(author): standalone Documents (no seriesId, no parentId) + Series,
 *     ranked in ONE shared space so they interleave. Order preserved today:
 *     pinned-by-sort_order standalone docs first, then by createdAt desc, then
 *     the author's series by createdAt desc.
 *   - series:  member Documents ordered by seriesOrder asc, createdAt asc.
 *   - tab-group: child Documents ordered by sort_order asc, createdAt asc.
 */
import { PrismaClient } from "@prisma/client";
import { ranksForList } from "../../src/lib/ordering.ts";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");

type DocRow = {
  id: string;
  createdAt: Date;
  seriesId: string | null;
  parentId: string | null;
  sort_order: number | null;
  seriesOrder: number | null;
  rank: string | null;
};
type SeriesRow = { id: string; createdAt: Date; rank: string | null };

/** A rank write to apply: which table, which id, what key. */
type Plan = { table: "document" | "series"; id: string; rank: string };

const allRanked = (rows: { rank: string | null }[]) =>
  rows.length > 0 && rows.every((r) => r.rank !== null);

function planContainer(
  rows: { table: Plan["table"]; id: string }[],
): Plan[] {
  const keys = ranksForList(rows.length);
  return rows.map((r, i) => ({ table: r.table, id: r.id, rank: keys[i] }));
}

async function backfillAuthor(authorId: string): Promise<Plan[]> {
  const docs = (await prisma.document.findMany({
    where: { authorId, type: "DOCUMENT" },
    select: {
      id: true,
      createdAt: true,
      seriesId: true,
      parentId: true,
      sort_order: true,
      seriesOrder: true,
      rank: true,
    },
  })) as DocRow[];
  const series = (await prisma.series.findMany({
    where: { authorId },
    select: { id: true, createdAt: true, rank: true },
  })) as SeriesRow[];

  const plans: Plan[] = [];

  // Container = seriesId ?? parentId ?? root.
  const rootDocs = docs.filter((d) => !d.seriesId && !d.parentId);
  const bySeries = new Map<string, DocRow[]>();
  const byParent = new Map<string, DocRow[]>();
  for (const d of docs) {
    if (d.seriesId) push(bySeries, d.seriesId, d);
    else if (d.parentId) push(byParent, d.parentId, d);
  }

  // Root list: standalone docs (pinned-first, then newest), then series newest.
  const rootRows = [...rootDocs, ...series];
  if (!allRanked(rootRows)) {
    const sortedDocs = [...rootDocs].sort(byPinnedThenNewest);
    const sortedSeries = [...series].sort(byNewest);
    plans.push(
      ...planContainer([
        ...sortedDocs.map((d) => ({ table: "document" as const, id: d.id })),
        ...sortedSeries.map((s) => ({ table: "series" as const, id: s.id })),
      ]),
    );
  }

  // Each series: by seriesOrder asc, then createdAt asc.
  for (const members of bySeries.values()) {
    if (allRanked(members)) continue;
    const ordered = [...members].sort(bySeriesOrderThenOldest);
    plans.push(
      ...planContainer(ordered.map((d) => ({ table: "document", id: d.id }))),
    );
  }

  // Each tab-group: by sort_order asc, then createdAt asc.
  for (const children of byParent.values()) {
    if (allRanked(children)) continue;
    const ordered = [...children].sort(bySortOrderThenOldest);
    plans.push(
      ...planContainer(ordered.map((d) => ({ table: "document", id: d.id }))),
    );
  }

  return plans;
}

// ── comparators (nulls sort last among pinned; ties broken by id for stability)
const num = (n: number | null) => (n == null ? Number.POSITIVE_INFINITY : n);
const newest = (a: Date, b: Date) => b.getTime() - a.getTime();
const oldest = (a: Date, b: Date) => a.getTime() - b.getTime();

const byNewest = (a: { createdAt: Date; id: string }, b: typeof a) =>
  newest(a.createdAt, b.createdAt) || (a.id < b.id ? -1 : 1);
const byPinnedThenNewest = (a: DocRow, b: DocRow) =>
  num(a.sort_order) - num(b.sort_order) || newest(a.createdAt, b.createdAt) ||
  (a.id < b.id ? -1 : 1);
const bySeriesOrderThenOldest = (a: DocRow, b: DocRow) =>
  num(a.seriesOrder) - num(b.seriesOrder) || oldest(a.createdAt, b.createdAt) ||
  (a.id < b.id ? -1 : 1);
const bySortOrderThenOldest = (a: DocRow, b: DocRow) =>
  num(a.sort_order) - num(b.sort_order) || oldest(a.createdAt, b.createdAt) ||
  (a.id < b.id ? -1 : 1);

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

async function main() {
  const authors = await prisma.user.findMany({ select: { id: true } });
  let docWrites = 0;
  let seriesWrites = 0;

  for (const { id: authorId } of authors) {
    const plans = await backfillAuthor(authorId);
    if (plans.length === 0) continue;

    if (!DRY) {
      await prisma.$transaction(
        plans.map((p) =>
          p.table === "document"
            ? prisma.document.update({
              where: { id: p.id },
              data: { rank: p.rank },
            })
            : prisma.series.update({
              where: { id: p.id },
              data: { rank: p.rank },
            })
        ),
      );
    }
    docWrites += plans.filter((p) => p.table === "document").length;
    seriesWrites += plans.filter((p) => p.table === "series").length;
  }

  const remaining = await prisma.document.count({ where: { rank: null } }) +
    await prisma.series.count({ where: { rank: null } });

  console.warn(
    `${DRY ? "[dry-run] would rank" : "ranked"} ${docWrites} documents, ` +
      `${seriesWrites} series across ${authors.length} authors. ` +
      `rank IS NULL remaining: ${remaining}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
