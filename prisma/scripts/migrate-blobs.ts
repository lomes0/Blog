/**
 * Move the data URIs already in the database into the blob store —
 * docs/plans/blob-storage.md §10, phase 3.
 *
 *   pnpm blobs:migrate status        # what is stored, by node type
 *   pnpm blobs:migrate run --dry-run
 *   pnpm blobs:migrate run
 *   pnpm blobs:migrate verify        # after a run, before believing it
 *
 * **Run it against a restored dump first.** It rewrites revision JSON across the
 * whole database, and §3.2's grace period protects the upload-before-save
 * window, not a bad rewrite.
 *
 * Interrupting it is safe, and there is no checkpoint file because the work is
 * its own progress: a revision whose `src` is already a blob URL has nothing
 * left to find, so re-running resumes. Both writes are idempotent — the object
 * key is the hash, and the rows are upserts.
 *
 * ## Order
 *
 * Bytes first, rows second, per document in one transaction. The two failures
 * are not symmetrical: an object with no row is invisible and costs storage,
 * while a row pointing at bytes that were never stored is a post rendering an
 * empty picture. Only the first is acceptable, so it is the one left possible.
 */
import { prisma } from "../../src/lib/prisma.ts";
import {
  blobsToStore,
  findDataUriSites,
  rewriteToBlobUrls,
} from "../../src/lib/blobMigration.ts";
import { blobHashesFor, blobUrl } from "../../src/lib/blobRefs.ts";
import { blobExists, isStorageConfigured, putBlob } from "../../src/lib/storage.ts";
import type { Prisma } from "@prisma/client";

const has = (argv: string[], name: string): boolean => argv.includes(`--${name}`);

const die = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const kb = (bytes: number): string => `${(bytes / 1024).toFixed(0)} kB`;

/** Documents are the transaction unit, so they are also the iteration unit. */
async function documentIds(): Promise<string[]> {
  const rows = await prisma.document.findMany({ select: { id: true } });
  return rows.map((row) => row.id);
}

type RevisionRow = { id: string; data: Prisma.JsonValue };

const revisionsOf = (documentId: string): Promise<RevisionRow[]> =>
  prisma.revision.findMany({
    where: { documentId },
    select: { id: true, data: true },
  });

async function status() {
  const ids = await documentIds();
  const byType = new Map<
    string,
    { occurrences: number; bytes: number; hashes: Set<string>; migratable: boolean }
  >();
  let revisionsWithData = 0;

  for (const documentId of ids) {
    for (const revision of await revisionsOf(documentId)) {
      const sites = findDataUriSites(revision.data);
      if (sites.length > 0) revisionsWithData++;
      for (const site of sites) {
        const entry = byType.get(site.nodeType) ?? {
          occurrences: 0,
          bytes: 0,
          hashes: new Set<string>(),
          migratable: site.migratable,
        };
        entry.occurrences++;
        entry.bytes += site.size;
        entry.hashes.add(site.hash);
        byType.set(site.nodeType, entry);
      }
    }
  }

  if (byType.size === 0) {
    console.log("No data URIs left in any revision.");
  } else {
    console.log("node type   copies  distinct   stored   deduplicated  migratable");
    for (const [type, entry] of [...byType].sort()) {
      const deduped = [...entry.hashes].length;
      console.log(
        `${type.padEnd(11)} ${String(entry.occurrences).padStart(6)}  ${
          String(deduped).padStart(8)
        }  ${mb(entry.bytes).padStart(7)}  ${
          kb(entry.bytes / entry.occurrences * deduped).padStart(12)
        }  ${entry.migratable ? "yes" : "no — see §6.1"}`,
      );
    }
    console.log(`\n${revisionsWithData} revisions hold at least one.`);
  }

  const [blobs, refs] = await Promise.all([
    prisma.blob.aggregate({ _count: { _all: true }, _sum: { size: true } }),
    prisma.blobRef.count(),
  ]);
  console.log(
    `Store: ${blobs._count._all} blobs, ${mb(blobs._sum.size ?? 0)}, ${refs} references.`,
  );
}

async function run(dryRun: boolean) {
  if (!isStorageConfigured()) {
    die(
      "No object store configured — set S3_ENDPOINT / S3_ACCESS_KEY_ID / " +
        "S3_SECRET_ACCESS_KEY. Nothing was changed.",
    );
  }

  const ids = await documentIds();
  const stored = new Set<string>();
  let documentsTouched = 0;
  let revisionsRewritten = 0;
  let occurrences = 0;
  let bytesReclaimed = 0;
  let bytesStored = 0;

  for (const documentId of ids) {
    const revisions = await revisionsOf(documentId);

    // What this document needs stored, before anything is rewritten.
    const blobs = new Map<string, { bytes: Buffer; mimeType: string }>();
    for (const revision of revisions) {
      for (const [hash, site] of blobsToStore(revision.data)) {
        blobs.set(hash, { bytes: site.bytes, mimeType: site.mimeType });
      }
    }
    if (blobs.size === 0) continue;

    // Bytes first — see the docblock. `blobExists` makes a re-run cheap rather
    // than correct; writing the same bytes to the same key twice is a no-op.
    for (const [hash, blob] of blobs) {
      if (stored.has(hash)) continue;
      if (!dryRun && !(await blobExists(hash))) {
        await putBlob(hash, blob.bytes, blob.mimeType);
      }
      stored.add(hash);
      bytesStored += blob.bytes.byteLength;
    }

    const rewrites: { id: string; data: Prisma.InputJsonValue; blobHashes: string[] }[] = [];
    for (const revision of revisions) {
      const before = findDataUriSites(revision.data).filter((s) => s.migratable);
      const count = rewriteToBlobUrls(revision.data, blobUrl);
      if (count === 0) continue;
      occurrences += count;
      bytesReclaimed += before.reduce((sum, site) => sum + site.size, 0);
      rewrites.push({
        id: revision.id,
        data: revision.data as Prisma.InputJsonValue,
        blobHashes: blobHashesFor(revision.data),
      });
    }
    if (rewrites.length === 0) continue;

    documentsTouched++;
    revisionsRewritten += rewrites.length;

    if (!dryRun) {
      // One transaction per document: a half-rewritten document would have
      // some revisions pointing at blobs and some at bytes, with no way to tell
      // from the outside which run left it that way.
      await prisma.$transaction([
        prisma.blob.createMany({
          data: [...blobs].map(([hash, blob]) => ({
            hash,
            size: blob.bytes.byteLength,
            mimeType: blob.mimeType,
          })),
          skipDuplicates: true,
        }),
        ...rewrites.map((rewrite) =>
          prisma.revision.update({
            where: { id: rewrite.id },
            data: { data: rewrite.data, blobHashes: rewrite.blobHashes },
          })
        ),
        prisma.blobRef.createMany({
          data: [...new Set(rewrites.flatMap((r) => r.blobHashes))].map((
            blobHash,
          ) => ({ blobHash, documentId })),
          skipDuplicates: true,
        }),
      ]);
    }

    console.log(
      `${dryRun ? "would rewrite" : "rewrote"} ${documentId}: ` +
        `${rewrites.length} revisions, ${blobs.size} blobs`,
    );
  }

  console.log(
    `\n${dryRun ? "Dry run — nothing was written." : "Done."}\n` +
      `  documents      ${documentsTouched}\n` +
      `  revisions      ${revisionsRewritten}\n` +
      `  occurrences    ${occurrences}\n` +
      `  distinct blobs ${stored.size}\n` +
      `  stored         ${mb(bytesStored)}\n` +
      `  freed          ${mb(bytesReclaimed)} of revision JSON`,
  );
  if (!dryRun) console.log("\nNow run `pnpm blobs:migrate verify`.");
}

/**
 * §10 step 6, and the reason it is a separate command: the run reports what it
 * *did*, and this reports what is now *true*. A migration that believes its own
 * summary is how bytes go missing.
 */
async function verify() {
  let failures = 0;
  const fail = (message: string) => {
    console.log(`FAIL  ${message}`);
    failures++;
  };

  // 1. Every blob a document references has bytes in the store.
  const blobs = await prisma.blob.findMany({ select: { hash: true } });
  let missing = 0;
  for (const { hash } of blobs) {
    if (!(await blobExists(hash))) {
      fail(`blob ${hash} has a row but no object`);
      missing++;
    }
  }
  if (missing === 0) console.log(`PASS  all ${blobs.length} blobs are in the store`);

  // 2. Every hash a revision names has a row — otherwise the reference could
  //    not have been created and the image will 404.
  const known = new Set(blobs.map((b) => b.hash));
  const revisions = await prisma.revision.findMany({
    select: { id: true, documentId: true, blobHashes: true },
  });
  const dangling = revisions.filter((r) => r.blobHashes.some((h) => !known.has(h)));
  if (dangling.length > 0) {
    fail(`${dangling.length} revisions name a hash with no Blob row`);
  } else {
    console.log("PASS  every hash named by a revision has a row");
  }

  // 3. Every reference a revision names is recorded, so `/api/blob/[hash]`
  //    will authorize it.
  const refs = await prisma.blobRef.findMany({
    select: { blobHash: true, documentId: true },
  });
  const recorded = new Set(refs.map((r) => `${r.documentId}:${r.blobHash}`));
  const unrecorded = revisions.flatMap((r) =>
    r.blobHashes
      .filter((h) => known.has(h) && !recorded.has(`${r.documentId}:${h}`))
      .map((h) => `${r.documentId}:${h}`)
  );
  if (unrecorded.length > 0) {
    fail(`${new Set(unrecorded).size} document/blob pairs are referenced but not recorded`);
  } else {
    console.log("PASS  every referenced blob is recorded against its document");
  }

  // 4. No migratable data URI survives. The types held back are reported rather
  //    than failed — they are a decision, not a leftover.
  const remaining = new Map<string, number>();
  for (const documentId of await documentIds()) {
    for (const revision of await revisionsOf(documentId)) {
      for (const site of findDataUriSites(revision.data)) {
        const key = site.migratable ? `${site.nodeType} (MIGRATABLE)` : site.nodeType;
        remaining.set(key, (remaining.get(key) ?? 0) + 1);
      }
    }
  }
  const leftBehind = [...remaining].filter(([key]) => key.includes("MIGRATABLE"));
  if (leftBehind.length > 0) {
    for (const [key, count] of leftBehind) fail(`${count} × ${key} data URIs remain`);
  } else {
    console.log("PASS  no migratable data URI is left in any revision");
  }
  for (const [key, count] of remaining) {
    if (!key.includes("MIGRATABLE")) {
      console.log(`      (${count} × ${key} left in place on purpose — §6.1)`);
    }
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

const [command, ...rest] = process.argv.slice(2);

const main = async () => {
  switch (command) {
    case "status":
      return status();
    case "run":
      return run(has(rest, "dry-run"));
    case "verify":
      return verify();
    default:
      die("Usage: migrate-blobs.ts status | run [--dry-run] | verify");
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
