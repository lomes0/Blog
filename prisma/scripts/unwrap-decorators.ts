/**
 * Unwrap the paragraphs around block-level decorators —
 * docs/plans/nested-editor-support.md §3, phase A.
 *
 *   pnpm nodes:unwrap status
 *   pnpm nodes:unwrap run --dry-run
 *   pnpm nodes:unwrap run
 *
 * `canvas`, `image` and `sticky` were inline decorators, so every one of them
 * ever inserted was wrapped in a paragraph on the way in. A paragraph is not an
 * addressable container, which is why a canvas's notes and an image's caption
 * have been unreachable to every agent since the bridge was written. The node
 * classes are block-level now; this is the stored content catching up.
 *
 * ## Why this rewrites history and not just heads
 *
 * Restoring a revision would otherwise put the old shape back, silently, in the
 * one situation where nobody is looking for it. The rewrite is safe to apply
 * that widely because it does not change what a revision *says* — it removes a
 * wrapper element around a node that was already the paragraph's only child.
 * The editor's transform (`nodes/blockDecoratorUnwrap.ts`) would repair a
 * restored revision on load anyway; doing it here means the bridge sees the
 * right shape without an editor ever being mounted, which is the whole point.
 *
 * ## The case it refuses
 *
 * A paragraph holding one of these types **and** something else is counted and
 * left alone — the author's prose is not this script's to split. §2 measured
 * zero of those across all 1,475 revisions, so the counter should stay at 0;
 * it is printed anyway, because a non-zero one is the interesting number.
 */
import { prisma } from "../../src/lib/prisma.ts";
import {
  unwrapBlockDecorators,
  UNWRAPPED_BLOCK_TYPES,
} from "../../src/lib/blockDecorators.ts";
import { reconcileDocumentBlobs } from "../../src/repositories/blob.ts";

const has = (argv: string[], name: string): boolean => argv.includes(`--${name}`);

const die = (message: string): never => {
  console.error(message);
  process.exit(1);
};

interface Candidate {
  id: string;
  documentId: string;
  data: unknown;
  unwrapped: number;
  shared: number;
}

/**
 * Every revision that would change, with its counts.
 *
 * The scan runs the real migration against a parsed copy rather than a
 * pattern-match over the JSON text: `status` and `run` then cannot disagree
 * about what is a candidate, which is the failure mode a separate "would this
 * change?" predicate has every time.
 */
async function scan(): Promise<{ candidates: Candidate[]; total: number }> {
  const revisions = await prisma.revision.findMany({
    select: { id: true, documentId: true, data: true },
  });

  const candidates: Candidate[] = [];
  for (const revision of revisions) {
    const data = structuredClone(revision.data);
    const result = unwrapBlockDecorators(data);
    if (result.unwrapped === 0 && result.shared === 0) continue;
    candidates.push({
      id: revision.id,
      documentId: revision.documentId,
      data,
      unwrapped: result.unwrapped,
      shared: result.shared,
    });
  }
  return { candidates, total: revisions.length };
}

function summarize(candidates: Candidate[], total: number) {
  const unwrapped = candidates.reduce((sum, c) => sum + c.unwrapped, 0);
  const shared = candidates.reduce((sum, c) => sum + c.shared, 0);
  const documents = new Set(candidates.map((c) => c.documentId)).size;
  return { unwrapped, shared, documents, total };
}

async function status() {
  const { candidates, total } = await scan();
  const s = summarize(candidates, total);

  console.log(
    `${total} revisions scanned, for [${[...UNWRAPPED_BLOCK_TYPES].join(", ")}].\n`,
  );
  if (candidates.length === 0) {
    console.log("Nothing to unwrap — every stored decorator is already a block.");
    return;
  }

  console.log(
    `${s.unwrapped} wrapper paragraphs in ${candidates.length} revisions ` +
      `across ${s.documents} documents would be removed.`,
  );
  if (s.shared > 0) {
    console.log(
      `\n${s.shared} paragraphs hold one of these types alongside other ` +
        `content and are LEFT ALONE. Splitting them is a call for an author, ` +
        `not for a migration — see §2.`,
    );
  } else {
    console.log("\nNo paragraph shares a line with one of these — nothing is skipped.");
  }

  const heads = await prisma.document.findMany({
    where: { head: { in: candidates.map((c) => c.id) } },
    select: { id: true, name: true, head: true },
  });
  if (heads.length > 0) {
    console.log(`\nCurrent heads affected — ${heads.length}:`);
    for (const doc of heads) console.log(`  ${doc.id}  ${doc.name}`);
  }
}

async function run(dryRun: boolean) {
  const { candidates, total } = await scan();
  const s = summarize(candidates, total);

  if (candidates.length === 0) {
    console.log(`Nothing to unwrap — ${total} revisions, all already block-level.`);
    return;
  }

  let written = 0;
  let failures = 0;

  for (const candidate of candidates) {
    if (candidate.unwrapped === 0) continue;
    if (dryRun) {
      written++;
      continue;
    }
    try {
      await prisma.revision.update({
        where: { id: candidate.id },
        // The outer `data` is the update payload; the inner one is the column.
        // `blobHashes` is deliberately absent. An unwrap moves an `image` node;
        // it does not change its `src`, so the reference set is the same set.
        // The reconcile below is belt to that brace — CLAUDE.md's rule is about
        // writes that change revision content, not about writes someone
        // reasoned were safe.
        data: { data: candidate.data as never },
      });
      written++;
    } catch (error) {
      failures++;
      console.error(`FAILED revision ${candidate.id} —`, error);
    }
  }

  if (!dryRun) {
    const documents = [...new Set(candidates.map((c) => c.documentId))];
    for (const documentId of documents) await reconcileDocumentBlobs(documentId);
  }

  console.log(
    `${dryRun ? "Dry run — nothing was written." : "Done."}\n` +
      `  revisions  ${written}\n` +
      `  paragraphs ${s.unwrapped}\n` +
      `  documents  ${s.documents}\n` +
      `  skipped    ${s.shared} (shared with other content)\n` +
      `  failed     ${failures}`,
  );

  if (failures > 0) process.exitCode = 1;
}

const [command, ...rest] = process.argv.slice(2);

const main = async () => {
  switch (command) {
    case "status":
      return status();
    case "run":
      return run(has(rest, "dry-run"));
    default:
      die("Usage: unwrap-decorators.ts status | run [--dry-run]");
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
