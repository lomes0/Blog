/**
 * Phase 2 of docs/plans/ordering-simplification.md §8: seed every container's
 * order array from the `rank` order it renders in today, so switching reads to
 * the arrays (phase 3) is visually neutral.
 *
 *   node --import tsx --env-file=.env prisma/scripts/backfill-order.ts        # apply
 *   node --import tsx --env-file=.env prisma/scripts/backfill-order.ts --dry  # report only
 *
 * or `pnpm order:backfill [--dry]`.
 *
 * Idempotent: a container whose stored array already equals the computed one is
 * skipped, so re-running writes nothing. That also makes it a repair tool — run
 * it if an array is ever suspected of drifting from the ranks.
 *
 * Four containers, one array each (the plan's §2 table names only three; see
 * §11 of the plan's phase log for why `Project` is the fourth):
 *   - root(author) → `User.rootOrder`: standalone Documents (no seriesId, no
 *     parentId) + ungrouped Series (no projectId) + Projects, which share ONE
 *     rank space and so interleave.
 *   - series       → `Series.postOrder`:   its member Documents.
 *   - project      → `Project.seriesOrder`: its member Series.
 *   - tab-group    → `Document.tabOrder`:  a parent's child Documents.
 *
 * `rank` is C-collated in Postgres (see the `rank_c_collation` migration), so
 * ordering by it here — a JavaScript string compare, in `compareRankThenId` —
 * is the same order the database produces. That is what makes the SQL
 * comparison in the phase log a valid check of this script.
 */
import { PrismaClient } from "@prisma/client";
import { compareRankThenId } from "../../src/lib/ordering.ts";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");

/** Anything orderable: an id, its rank, and which table it came from. */
type Ranked = { id: string; rank: string | null };

/** One array to write: which container owns it, and the ids in order. */
type Plan =
  | { kind: "root"; id: string; ids: string[] }
  | { kind: "series"; id: string; ids: string[] }
  | { kind: "project"; id: string; ids: string[] }
  | { kind: "tabs"; id: string; ids: string[] };

const byRank = (a: Ranked, b: Ranked) =>
  compareRankThenId(a.rank, a.id, b.rank, b.id);

const ordered = (rows: Ranked[]): string[] =>
  [...rows].sort(byRank).map((r) => r.id);

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

async function planAuthor(authorId: string): Promise<Plan[]> {
  const [docs, series, projects, user] = await Promise.all([
    prisma.document.findMany({
      where: { authorId, type: "DOCUMENT" },
      select: {
        id: true,
        rank: true,
        seriesId: true,
        parentId: true,
        tabOrder: true,
      },
    }),
    prisma.series.findMany({
      where: { authorId },
      select: { id: true, rank: true, projectId: true, postOrder: true },
    }),
    prisma.project.findMany({
      where: { authorId },
      select: { id: true, rank: true, seriesOrder: true },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: authorId },
      select: { rootOrder: true },
    }),
  ]);

  const plans: Plan[] = [];

  // Root: the three kinds in one shared rank space.
  const rootRows: Ranked[] = [
    ...docs.filter((d) => !d.seriesId && !d.parentId),
    ...series.filter((s) => !s.projectId),
    ...projects,
  ];
  const rootIds = ordered(rootRows);
  if (!same(user.rootOrder, rootIds)) {
    plans.push({ kind: "root", id: authorId, ids: rootIds });
  }

  // Series and tab-groups, from the documents this author owns.
  const bySeries = new Map<string, Ranked[]>();
  const byParent = new Map<string, Ranked[]>();
  for (const doc of docs) {
    if (doc.seriesId) push(bySeries, doc.seriesId, doc);
    else if (doc.parentId) push(byParent, doc.parentId, doc);
  }

  for (const s of series) {
    const ids = ordered(bySeries.get(s.id) ?? []);
    if (!same(s.postOrder, ids)) {
      plans.push({ kind: "series", id: s.id, ids });
    }
  }

  const tabOrderOf = new Map(docs.map((d) => [d.id, d.tabOrder]));
  for (const [parentId, children] of byParent) {
    const ids = ordered(children);
    // A child whose parent belongs to someone else is not this author's to
    // order; it will be planned under that author's own pass.
    const stored = tabOrderOf.get(parentId);
    if (stored && !same(stored, ids)) {
      plans.push({ kind: "tabs", id: parentId, ids });
    }
  }

  // Projects: their member series, in the project's own space.
  const byProject = new Map<string, Ranked[]>();
  for (const s of series) if (s.projectId) push(byProject, s.projectId, s);
  for (const p of projects) {
    const ids = ordered(byProject.get(p.id) ?? []);
    if (!same(p.seriesOrder, ids)) {
      plans.push({ kind: "project", id: p.id, ids });
    }
  }

  return plans;
}

const apply = (plan: Plan) => {
  switch (plan.kind) {
    case "root":
      return prisma.user.update({
        where: { id: plan.id },
        data: { rootOrder: plan.ids },
      });
    case "series":
      return prisma.series.update({
        where: { id: plan.id },
        data: { postOrder: plan.ids },
      });
    case "project":
      return prisma.project.update({
        where: { id: plan.id },
        data: { seriesOrder: plan.ids },
      });
    case "tabs":
      return prisma.document.update({
        where: { id: plan.id },
        data: { tabOrder: plan.ids },
      });
  }
};

async function main() {
  const authors = await prisma.user.findMany({ select: { id: true } });
  const counts = { root: 0, series: 0, project: 0, tabs: 0 };

  for (const { id: authorId } of authors) {
    const plans = await planAuthor(authorId);
    if (plans.length === 0) continue;
    if (!DRY) await prisma.$transaction(plans.map(apply));
    for (const plan of plans) counts[plan.kind] += 1;
  }

  console.warn(
    `${DRY ? "[dry-run] would write" : "wrote"} ${counts.root} rootOrder, ` +
      `${counts.series} postOrder, ${counts.project} seriesOrder and ` +
      `${counts.tabs} tabOrder arrays across ${authors.length} authors.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
