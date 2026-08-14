import { prisma } from "@/lib/prisma";
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
