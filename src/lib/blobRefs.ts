/**
 * Which blobs a document's content refers to, and what that means for its
 * `BlobRef` rows — docs/plans/blob-storage.md §3 and §5.
 *
 * References are created at *upload* time (`POST /api/blob`, `POST
 * /api/blob/link`), which is what makes a freshly pasted image readable before
 * the document has been saved. Nothing removed one, so the reference set only
 * ever grew and phase 5's collector had nothing it could safely collect. This
 * module is the other half: after a write, the stored content is the authority
 * on what the document references.
 *
 * Import-free on purpose, like `dragGeometry.ts` — the interesting parts are the
 * scan and the diff, and both are exercised in
 * `src/lib/__tests__/blobRefs.test.ts` without a database.
 */

/** The path form every stored reference takes (§6). */
const BLOB_URL_PREFIX = "/api/blob/";

/**
 * The `src` to store for a blob.
 *
 * Exported so the routes that hand this string to a client and the scan that
 * later reads it back out of stored JSON share one definition of the shape. They
 * have to agree exactly: a reference this scanner cannot see is a blob the
 * collector will delete out from under a document that is still using it.
 */
export const blobUrl = (hash: string): string => `${BLOB_URL_PREFIX}${hash}`;

/**
 * A blob URL anywhere inside a string.
 *
 * Deliberately not anchored, and deliberately not tied to any node's `src`
 * field. A reference can sit in an `ImageNode.src`, a link's `href`, a table
 * cell nested three containers deep, or a node type that does not exist yet —
 * matching the URL wherever it appears means new producers are covered without
 * this file learning about them, and the alternative (a list of fields per node
 * type) fails silently rather than loudly when it falls behind.
 */
const BLOB_URL_RE = /\/api\/blob\/([0-9a-f]{64})/g;

/**
 * Every blob hash referenced anywhere in `content`.
 *
 * Walks arbitrary parsed JSON rather than a Lexical tree, so it works equally on
 * an editor state, a proposal's stored `data`, and an export bundle. Iterative
 * rather than recursive because the input is attacker-supplied JSON and a
 * pathologically nested document must not be a stack overflow.
 */
export function extractBlobHashes(content: unknown): Set<string> {
  const found = new Set<string>();
  const stack: unknown[] = [content];

  while (stack.length > 0) {
    const value = stack.pop();

    if (typeof value === "string") {
      for (const match of value.matchAll(BLOB_URL_RE)) found.add(match[1]);
      continue;
    }
    if (Array.isArray(value)) {
      stack.push(...value);
      continue;
    }
    if (value !== null && typeof value === "object") {
      stack.push(...Object.values(value));
    }
  }

  return found;
}

/**
 * The value stored in `Revision.blobHashes` for a piece of content.
 *
 * Sorted, so that a revision re-saved with the same images writes the same array
 * and a diff of two revisions is readable.
 */
export function blobHashesFor(content: unknown): string[] {
  return [...extractBlobHashes(content)].sort();
}

/**
 * Replace every blob reference with the bytes themselves, making the content
 * self-contained again — docs/plans/blob-storage.md §9.
 *
 * The direction the store exists to avoid, and correct in exactly one place: a
 * document arriving in **local** storage. A guest has no session, so
 * `/api/blob/<hash>` is not a URL their browser can resolve, and IndexedDB
 * holds no blobs. Inlining at that boundary keeps a local document what it has
 * always been — self-contained — rather than a set of references to a server
 * the reader may never reach.
 *
 * `dataUriFor` returns `null` for a hash whose bytes are not to hand; that
 * reference is left alone, so the failure is a broken image rather than a
 * document that fails to import.
 *
 * **Mutates `state`**, like `rewriteToBlobUrls`, and returns how many nodes
 * changed.
 */
export function inlineBlobUrls(
  state: unknown,
  dataUriFor: (hash: string) => string | null,
): number {
  let inlined = 0;
  const stack: unknown[] = [state];

  while (stack.length > 0) {
    const value = stack.pop();
    if (Array.isArray(value)) {
      stack.push(...value);
      continue;
    }
    if (value === null || typeof value !== "object") continue;

    const node = value as Record<string, unknown>;
    if (typeof node.src === "string") {
      const match = /^\/api\/blob\/([0-9a-f]{64})$/.exec(node.src);
      const dataUri = match ? dataUriFor(match[1]) : null;
      if (dataUri) {
        node.src = dataUri;
        inlined++;
      }
    }
    stack.push(...Object.values(node));
  }

  return inlined;
}

/** What reconciliation has to write to make the stored refs match the content. */
interface BlobRefPlan {
  /** Referenced by the content, not yet recorded. */
  add: string[];
  /** Recorded, referenced by nothing, and old enough to let go of. */
  remove: string[];
}

/** A `BlobRef` row, as much of one as planning needs. */
interface RecordedRef {
  hash: string;
  createdAt: Date;
}

/**
 * How long a reference is left alone regardless of what the content says.
 *
 * A reference is created when an image is **uploaded**, which is what makes it
 * readable in the editor before anything has been saved — so between the paste
 * and the save there is a window where the reference is real and no revision
 * mentions it yet. Reconciling in that window (an agent proposing on the same
 * document, a revision being deleted in another tab) would otherwise revoke the
 * reference, and §5's collector would then take bytes the unsaved draft still
 * points at. That is the one failure in this design that cannot be repaired
 * afterwards, because the save arrives holding a URL whose object is gone.
 *
 * A day is far longer than the gap it covers — the editor autosaves in seconds —
 * and the only thing an over-long window costs is that a deleted image's bytes
 * are reclaimed a day late. This is the answer to §13's "grace period length",
 * for the reference; the collector's own window is a separate decision.
 */
export const BLOB_REF_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Diff the recorded reference set against the referenced one.
 *
 * `now` is a parameter rather than read here so the specs can drive the grace
 * period without faking timers, the same reason `rateLimit.ts` takes one.
 *
 * Sorted so a plan is comparable, which is what lets the specs assert on it
 * directly.
 */
export function planBlobRefs(
  recorded: readonly RecordedRef[],
  referenced: Iterable<string>,
  now: Date,
  graceMs: number = BLOB_REF_GRACE_MS,
): BlobRefPlan {
  const have = new Set(recorded.map((ref) => ref.hash));
  const want = new Set(referenced);
  const cutoff = now.getTime() - graceMs;

  return {
    add: [...want].filter((hash) => !have.has(hash)).sort(),
    remove: recorded
      .filter((ref) => !want.has(ref.hash) && ref.createdAt.getTime() < cutoff)
      .map((ref) => ref.hash)
      .sort(),
  };
}

/**
 * What a document references: the union over its revisions, not just the one at
 * `head`.
 *
 * That is the whole reason `Revision.blobHashes` exists. Revisions stay readable
 * and restorable (`GET /api/revisions/[id]`), so an image deleted from the
 * current draft is still needed by the history behind it — dropping the
 * reference would let the collector take bytes that a restore is about to ask
 * for, which is user work destroyed by a bookkeeping job. Answering from the
 * stored arrays makes "ask the whole document" cost a few hundred short strings
 * rather than every revision's JSON.
 */
export function unionOf(revisions: Iterable<readonly string[]>): Set<string> {
  const all = new Set<string>();
  for (const hashes of revisions) {
    for (const hash of hashes) all.add(hash);
  }
  return all;
}
