/**
 * The bytes behind a `/api/blob/<hash>` `src`, for the one converter that needs
 * them — docs/plans/blob-storage.md §9, phase 4.
 *
 * A .docx embeds pictures; it cannot reference them. So the converter needs the
 * actual bytes, and it runs inside `editorState.read()`, which is synchronous.
 * Fetching is not available to it at all.
 *
 * The resolution therefore happens **before** the read, by whoever has a store
 * to fetch from, and arrives here as a map. That is also what keeps this
 * package free of the app's storage module: `generateDocx` takes the bytes as an
 * argument, and `src/app/api/docx/[id]/route.ts` is what knows where bytes come
 * from.
 *
 * Module-level state, set around the read, matching how `listNodes` in
 * `./index.ts` already carries state across one conversion.
 */

export interface ResolvedBlob {
  bytes: Uint8Array;
  mimeType: string;
}

/** hash → bytes, for the duration of one conversion. */
export type BlobBytes = ReadonlyMap<string, ResolvedBlob>;

const BLOB_SRC = /^\/api\/blob\/([0-9a-f]{64})$/;

let current: BlobBytes = new Map();

/**
 * Run `convert` with `blobs` available to {@link resolveBlobSrc}.
 *
 * Restores what was there before rather than clearing, so a nested conversion —
 * a sticky note, a caption — cannot blank the outer one's map on the way out.
 */
export function withBlobBytes<T>(blobs: BlobBytes, convert: () => T): T {
  const previous = current;
  current = blobs;
  try {
    return convert();
  } finally {
    current = previous;
  }
}

/**
 * The bytes for a blob `src`, or `null` if this is not one.
 *
 * `undefined` and `null` are deliberately the same answer here: an unresolvable
 * blob is not a reason to fail an export of a whole document, and the caller
 * degrades to the image's alt text instead.
 */
export function resolveBlobSrc(src: string): ResolvedBlob | null {
  const match = BLOB_SRC.exec(src);
  if (!match) return null;
  return current.get(match[1]) ?? null;
}

/** Whether a `src` names a blob at all, however this conversion was set up. */
export function isBlobSrc(src: string): boolean {
  return BLOB_SRC.test(src);
}
