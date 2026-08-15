/**
 * Collect blobs nothing references any more — docs/plans/blob-storage.md §5,
 * phase 5.
 *
 *   pnpm blobs:collect status          # what would go, and what is holding
 *   pnpm blobs:collect run --dry-run
 *   pnpm blobs:collect run
 *
 * Content addressing without collection is a leak with extra steps: every
 * deleted image, every discarded revision, every document thrown away leaves its
 * bytes in the store with nothing pointing at them. Nothing else in the app ever
 * removes an object — that is deliberate and is §5's first rule.
 *
 * ## Why this is a script and not a route
 *
 * **Never delete on the write path.** Under deduplication a blob can be
 * re-referenced between the check and the delete by a concurrent paste of the
 * same image, and that is the common case rather than the unlucky one: `POST
 * /api/blob/link` is a *bytes-free* link, so a client whose image the server
 * already holds is told not to upload. If a collector took the object in that
 * window, the browser holding the only other copy has already moved on. So
 * collection happens offline, against blobs that have been unreferenced for a
 * week (`BLOB_GC_GRACE_MS`), where the race needs a hash to be simultaneously
 * untouched for seven days and re-pasted during the seconds this is running.
 *
 * ## Loud on purpose
 *
 * §5: "A GC that silently removes user data is the one job that must be loud."
 * Every hash is printed with its size and age as it goes, `status` prints what
 * is holding each survivor back, and a failure names the blob and continues —
 * one unreachable object must not strand the rest of the run, and a run that
 * aborted halfway would otherwise be indistinguishable from one that found
 * nothing.
 *
 * Run it on a schedule. Weekly is the interval the grace window is sized for;
 * running it more often is free, and running it less often only defers storage.
 */
import { prisma } from "../../src/lib/prisma.ts";
import {
  ageOf,
  BLOB_GC_GRACE_MS,
  type BlobCandidate,
  formatAge,
  planBlobCollection,
} from "../../src/lib/blobGc.ts";
import { deleteBlob, isStorageConfigured } from "../../src/lib/storage.ts";

const has = (argv: string[], name: string): boolean => argv.includes(`--${name}`);

const die = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const kb = (bytes: number): string => `${(bytes / 1024).toFixed(0)} kB`;

/**
 * Every blob, with the number of documents referencing it.
 *
 * Deliberately **unfiltered**. Asking Postgres for "the collectable ones" would
 * put half of §5's rule into a `where` clause and half into `blobGc.ts`, and
 * §13 has already ruled on what two spellings of one blob rule cost: they drift,
 * and drifting here means deleting bytes that are still in use. So the query
 * fetches rows and the decision stays in one import-free module that specs can
 * drive. The store holds six distinct blobs at the measurement in §1; if it ever
 * grows enough for this to matter, page it — do not move the rule into SQL.
 */
async function candidates(): Promise<(BlobCandidate & { mimeType: string })[]> {
  const rows = await prisma.blob.findMany({
    select: {
      hash: true,
      size: true,
      mimeType: true,
      createdAt: true,
      _count: { select: { refs: true } },
    },
  });

  return rows.map((row) => ({
    hash: row.hash,
    size: row.size,
    mimeType: row.mimeType,
    createdAt: row.createdAt,
    refCount: row._count.refs,
  }));
}

const line = (blob: BlobCandidate & { mimeType: string }, now: Date): string =>
  `  ${blob.hash.slice(0, 12)}…  ${kb(blob.size).padStart(8)}  ${
    formatAge(ageOf(blob, now)).padStart(4)
  }  ${blob.mimeType}`;

/**
 * What a run would do, touching nothing — not the database, not the store.
 *
 * Separate from `run --dry-run` in one way that matters: this reports the whole
 * store, including what is *keeping* each survivor. An operator looking at a
 * bucket that will not shrink needs to know whether the bytes are still
 * referenced or merely young, because only one of those is going to resolve on
 * its own.
 */
async function status() {
  const now = new Date();
  const all = await candidates();
  const plan = planBlobCollection(all, now);
  const byHash = new Map(all.map((blob) => [blob.hash, blob]));
  const stored = all.reduce((sum, blob) => sum + blob.size, 0);

  console.log(
    `${all.length} blobs, ${mb(stored)} stored. Grace window ${
      formatAge(BLOB_GC_GRACE_MS)
    }.\n`,
  );

  if (plan.collect.length === 0) {
    console.log("Nothing is collectable.");
  } else {
    console.log(
      `Collectable — ${plan.collect.length} blobs, ${mb(plan.bytes)}:`,
    );
    for (const blob of plan.collect) console.log(line(byHash.get(blob.hash)!, now));
  }

  const waiting = plan.keep.filter((k) => k.reason === "within-grace");
  if (waiting.length > 0) {
    console.log(
      `\nUnreferenced but inside the grace window — ${waiting.length} blobs, ` +
        `${mb(waiting.reduce((sum, k) => sum + k.blob.size, 0))}:`,
    );
    for (const { blob } of waiting) console.log(line(byHash.get(blob.hash)!, now));
  }

  const referenced = plan.keep.filter((k) => k.reason === "referenced");
  console.log(
    `\n${referenced.length} blobs are referenced, ${
      mb(referenced.reduce((sum, k) => sum + k.blob.size, 0))
    }.`,
  );

  if (!isStorageConfigured()) {
    console.log(
      "\nNo object store is configured — `run` would refuse. This report is " +
        "from the database alone and needs none.",
    );
  }
}

async function run(dryRun: boolean) {
  // Refuse rather than delete rows whose objects cannot be reached. Dropping
  // the row without the object is the one outcome that leaks *permanently*: the
  // row is the only thing in the system that names the key, so once it is gone
  // no later run can find those bytes to remove them.
  if (!isStorageConfigured()) {
    die(
      "No object store configured — set S3_ENDPOINT / S3_ACCESS_KEY_ID / " +
        "S3_SECRET_ACCESS_KEY. Nothing was changed.",
    );
  }

  const now = new Date();
  const all = await candidates();
  const plan = planBlobCollection(all, now);
  const byHash = new Map(all.map((blob) => [blob.hash, blob]));

  if (plan.collect.length === 0) {
    console.log(
      `Nothing to collect — ${all.length} blobs, all referenced or younger ` +
        `than ${formatAge(BLOB_GC_GRACE_MS)}.`,
    );
    return;
  }

  let collected = 0;
  let bytes = 0;
  let failures = 0;

  for (const candidate of plan.collect) {
    const blob = byHash.get(candidate.hash)!;
    const age = formatAge(ageOf(blob, now));

    if (dryRun) {
      console.log(`would collect ${blob.hash}  ${kb(blob.size)}  ${age}  ${blob.mimeType}`);
      collected++;
      bytes += blob.size;
      continue;
    }

    try {
      // **Object first, then the row**, and the two failures are not
      // symmetrical. The row is the only handle on the object: the key is
      // derivable from nothing else, so deleting the row first and then failing
      // on the object would leave bytes that nothing in the database names and
      // no later run can ever find — a permanent, invisible leak, which is
      // precisely what this job exists to close. Object first leaves the
      // opposite residue, a `Blob` row whose object is gone, and that one is
      // both visible (`pnpm blobs:migrate verify` reports it) and self-healing:
      // the row still has zero references, so the next run picks it up and
      // deletes an object that is already absent, which the store treats as
      // success. It is harmless in the meantime, because a `Blob` row is only
      // reachable through a `BlobRef` and by construction it has none.
      //
      // (§5 names this order and then argues for it by saying "an orphaned
      // object is cheaper than an orphaned row pointing at nothing" — but an
      // orphaned object is the residue of the *reverse* order. The order it
      // chose is right; the sentence justifying it describes the wrong
      // leftover.)
      await deleteBlob(blob.hash);
      await prisma.blob.delete({ where: { hash: blob.hash } });

      console.log(`collected ${blob.hash}  ${kb(blob.size)}  ${age}  ${blob.mimeType}`);
      collected++;
      bytes += blob.size;
    } catch (error) {
      // One blob must not abort the run. A permissions problem or a single
      // unreachable key would otherwise hide every blob behind it in the list,
      // and the next run would stop in the same place.
      failures++;
      console.error(`FAILED ${blob.hash} (${kb(blob.size)}, ${age}) —`, error);
    }
  }

  console.log(
    `\n${dryRun ? "Dry run — nothing was deleted." : "Done."}\n` +
      `  collected  ${collected} blobs\n` +
      `  reclaimed  ${mb(bytes)}\n` +
      `  failed     ${failures}`,
  );

  // A run that could not finish its list exits non-zero so a scheduler notices;
  // §5's whole point is that this job is never quiet about what it did.
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
      die("Usage: collect-blobs.ts status | run [--dry-run]");
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
