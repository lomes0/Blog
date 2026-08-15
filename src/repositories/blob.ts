import { prisma } from "@/lib/prisma";
import { planBlobRefs, unionOf } from "@/lib/blobRefs";
import type { Blob, Prisma } from "@prisma/client";

/**
 * Blob lookups. See docs/plans/blob-storage.md.
 *
 * There is no `findBlobById`-style unauthorized fetch here on purpose. A blob's
 * bytes are only reachable through the documents referencing it (§4), so the
 * only useful question is a *conditional* one — hence the two readable-by
 * queries below rather than one fetch plus a check the caller might forget.
 */

/**
 * The document conditions that make a blob readable by an anonymous caller.
 *
 * `published && !private` are checked as two independent flags because they are
 * two independent flags: a post can be published *and* private, which must stay
 * unreadable. `collab` means "anyone holding the link may edit", which implies
 * read. This mirrors `permitsDocument` in `src/lib/access.ts` for `read`, minus
 * the author and coauthor branches an anonymous caller cannot satisfy.
 */
const PUBLIC_READ_CONDITIONS: Prisma.DocumentWhereInput[] = [
  { collab: true },
  { published: true, private: false },
];

const PUBLICLY_READABLE: Prisma.DocumentWhereInput = {
  OR: PUBLIC_READ_CONDITIONS,
};

/**
 * Is this blob reachable without a session?
 *
 * Separate from {@link findBlobReadableBy} because the answer decides
 * *cacheability*, not just access: a response only carries `Cache-Control:
 * public` when an anonymous caller could have fetched it. Conflating the two
 * would let a shared cache serve a private draft's image to the internet, which
 * is the one mistake in this design that is unrecoverable once made.
 */
export async function isBlobPubliclyReadable(hash: string): Promise<boolean> {
  const ref = await prisma.blobRef.findFirst({
    where: { blobHash: hash, document: PUBLICLY_READABLE },
    select: { blobHash: true },
  });
  return ref !== null;
}

/**
 * The blob, if `userId` may read it through some document that references it —
 * otherwise `null`.
 *
 * "Some document" is the whole rule. Under deduplication one blob is reachable
 * through many documents with different visibilities, so this asks whether *any*
 * of them admits the caller. A blob shared between a published post and a
 * private draft is readable, because it is readable through the published one:
 * the bytes are already public, and pretending otherwise would not un-publish
 * them.
 *
 * Pass `userId: null` for an anonymous caller.
 */
export async function findBlobReadableBy(
  hash: string,
  userId: string | null,
): Promise<Blob | null> {
  const ref = await prisma.blobRef.findFirst({
    where: {
      blobHash: hash,
      document: userId
        ? { OR: [{ authorId: userId }, ...PUBLIC_READ_CONDITIONS] }
        : PUBLICLY_READABLE,
    },
    select: { blob: true },
  });
  return ref?.blob ?? null;
}

/** Metadata for a blob, with no authorization. Callers must have proven access. */
export function findBlobMeta(hash: string): Promise<Blob | null> {
  return prisma.blob.findUnique({ where: { hash } });
}

/**
 * Record a blob and the fact that `documentId` references it.
 *
 * Both halves are upserts because both are expected to already exist: the whole
 * point of content addressing is that the same bytes arrive repeatedly. A second
 * paste of the same image into the same document must be a no-op, not a
 * conflict, and two concurrent pastes of it must not race — which is why this is
 * `upsert` rather than `create` and needs no transaction to be safe.
 *
 * `size` and `mimeType` are only written on first insert. They are properties of
 * the bytes, and the bytes cannot have changed — a differing value on a later
 * upload means the caller mislabelled the same content, and the first
 * observation is no worse a guess than the second.
 */
export async function recordBlob(
  hash: string,
  documentId: string,
  size: number,
  mimeType: string,
): Promise<void> {
  await prisma.blob.upsert({
    where: { hash },
    create: { hash, size, mimeType },
    update: {},
  });
  await prisma.blobRef.upsert({
    where: { blobHash_documentId: { blobHash: hash, documentId } },
    create: { blobHash: hash, documentId },
    update: {},
  });
}

/**
 * Attach an already-stored blob to a document, or report that it is not stored.
 *
 * This is the dedup fast path: the client hashes locally and calls here first,
 * so re-using an image the server already holds transfers no bytes. It returns
 * `false` rather than throwing when the blob is unknown, because "not stored
 * yet" is the ordinary first-upload case and not an error.
 *
 * **No authorization happens here** — the caller must already have proven write
 * access to `documentId`. Linking is a write to that document's reference set,
 * and letting an arbitrary caller link arbitrary hashes would hand out reads on
 * blobs they cannot otherwise reach, which is precisely the leak §4 is built to
 * prevent.
 */
export async function linkBlobToDocument(
  hash: string,
  documentId: string,
): Promise<boolean> {
  const blob = await prisma.blob.findUnique({
    where: { hash },
    select: { hash: true },
  });
  if (!blob) return false;

  await prisma.blobRef.upsert({
    where: { blobHash_documentId: { blobHash: hash, documentId } },
    create: { blobHash: hash, documentId },
    update: {},
  });
  return true;
}

/**
 * Make the document's `BlobRef` rows match what its content actually
 * references — docs/plans/blob-storage.md §3, and the precondition for §5.
 *
 * Call it after **anything that changes the set of revision rows or their
 * content**: a save, a revision created or deleted, a proposal written,
 * approved or rejected, an import. That rule is the invariant this whole
 * mechanism rests on — a content write that does not reconcile leaves the
 * document referencing bytes nobody records, and §5's collector believes the
 * record.
 *
 * It takes no content, because it needs none: every write stamps its own
 * revision's `blobHashes` in the statement that stores the data (that is what
 * `blobHashesFor` is for), so what a document references is already answerable
 * from short arrays rather than from megabytes of JSON. Reconciling is then the
 * same three queries whether content arrived, changed or was deleted.
 *
 * ## It never throws
 *
 * Reconciliation is bookkeeping that runs after a committed write, so a failure
 * here must not turn a save the user already made into a 500 they will retry.
 * What a swallowed failure costs is bounded and self-healing: the reference set
 * stays as it was, so nothing becomes unreadable — references for new images
 * were already created at upload time — and the next write reconciles again.
 * Only the collector notices, by leaving bytes alone that it could have taken.
 */
export async function reconcileDocumentBlobs(
  documentId: string,
): Promise<void> {
  try {
    const [refs, revisions] = await Promise.all([
      prisma.blobRef.findMany({
        where: { documentId },
        select: { blobHash: true, createdAt: true },
      }),
      prisma.revision.findMany({
        where: { documentId },
        select: { blobHashes: true },
      }),
    ]);

    const recorded = refs.map((ref) => ({
      hash: ref.blobHash,
      createdAt: ref.createdAt,
    }));
    const referenced = unionOf(revisions.map((r) => r.blobHashes));

    const { add, remove } = planBlobRefs(recorded, referenced, new Date());

    if (add.length > 0) {
      // A hash can be referenced by content whose bytes this deployment does
      // not hold — an imported bundle, a document restored from elsewhere. The
      // foreign key would reject the whole batch for one such row, so the
      // unknown ones are dropped rather than allowed to fail the known ones.
      const stored = await prisma.blob.findMany({
        where: { hash: { in: add } },
        select: { hash: true },
      });
      if (stored.length > 0) {
        await prisma.blobRef.createMany({
          data: stored.map(({ hash }) => ({ blobHash: hash, documentId })),
          skipDuplicates: true,
        });
      }
    }

    if (remove.length > 0) {
      await prisma.blobRef.deleteMany({
        where: { documentId, blobHash: { in: remove } },
      });
    }
  } catch (error) {
    console.warn(`Could not reconcile blob refs for ${documentId}`, error);
  }
}
