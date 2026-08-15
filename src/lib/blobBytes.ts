/**
 * Fetching the bytes behind a document's blob references — the half of
 * docs/plans/blob-storage.md §9 that both consumers share.
 *
 * A .docx embeds its pictures and a backup bundle carries them, so both need
 * actual bytes rather than a URL. Neither can ask `/api/blob/[hash]` for them:
 * one runs inside a synchronous editor read, the other is already the server.
 *
 * **There is no authorization here.** Callers pass hashes they read out of
 * content they have already proven they may have (`requireRevision`, a
 * `userRoute` over the caller's own documents), which is the same rule
 * `findBlobMeta` states — the reference is what authorizes, and it was
 * authorized upstream.
 */
import { findBlobMeta } from "@/repositories/blob";
import { getBlob } from "@/lib/storage";

export interface LoadedBlob {
  bytes: Buffer;
  mimeType: string;
}

/**
 * Bytes for each hash, skipping any the store cannot produce.
 *
 * Missing is not an error: a row can outlive its object if an upload half
 * failed, and every caller here has something better to do than fail — export
 * a bundle without one picture, or export the alt text. What must not happen is
 * that a missing blob takes a whole document's export with it, so the map is
 * simply short and the caller notices.
 */
export async function loadBlobs(
  hashes: Iterable<string>,
): Promise<Map<string, LoadedBlob>> {
  const loaded = new Map<string, LoadedBlob>();

  await Promise.all(
    [...new Set(hashes)].map(async (hash) => {
      try {
        const [bytes, meta] = await Promise.all([
          getBlob(hash),
          findBlobMeta(hash),
        ]);
        loaded.set(hash, {
          bytes,
          mimeType: meta?.mimeType ?? "application/octet-stream",
        });
      } catch (error) {
        console.warn(`Could not load blob ${hash}`, error);
      }
    }),
  );

  return loaded;
}
