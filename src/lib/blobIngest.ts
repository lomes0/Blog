/**
 * Content arriving from outside with its images still inline —
 * docs/plans/blob-storage.md §8 and §9, phase 4.
 *
 * Two paths still deliver data URIs to the server, and both are ones the
 * editor's own producers never touch:
 *
 * - **A guest draft signing in.** Local documents stay self-contained on
 *   purpose (a signed-out browser has no session, so `/api/blob/<hash>` is not
 *   a URL it can resolve), so a draft uploads holding its pictures.
 * - **An old backup bundle**, written before bundles carried blobs.
 *
 * Without this, both would put back exactly what phase 3 took out — and the
 * duplication would resume growing on every save, which is the mechanism §1
 * describes. Normalizing at the door is what makes "the cloud stores an image
 * once" a property rather than a hope.
 *
 * It reuses the migration's walk, so the same rule about which node types may
 * be rewritten applies here: `image` only, never `sketch` or `graph` (§10.1).
 */
import { prisma } from "@/lib/prisma";
import { blobsToStore, rewriteToBlobUrls } from "@/lib/blobMigration";
import { blobUrl } from "@/lib/blobRefs";
import { blobExists, isStorageConfigured, putBlob } from "@/lib/storage";

/**
 * Store any inline images in `state` as blobs and point the nodes at them.
 *
 * **Mutates `state`.** Returns how many nodes were rewritten, which is zero
 * whenever there is nothing to do — including when no object store is
 * configured, where the content is left exactly as it arrived. That fallback is
 * the same one `uploadBlob` makes in the browser and for the same reason: a
 * store that is not there must cost a deployment its deduplication, never its
 * user's picture.
 *
 * No `BlobRef` is created here. The rows this writes are the blobs themselves;
 * references belong to a document, which on the create path does not exist yet,
 * and `reconcileDocumentBlobs` makes them from the stored content afterwards.
 */
export async function ingestInlineBlobs(state: unknown): Promise<number> {
  if (!isStorageConfigured()) return 0;

  const blobs = blobsToStore(state);
  if (blobs.size === 0) return 0;

  try {
    for (const [hash, blob] of blobs) {
      if (!(await blobExists(hash))) {
        await putBlob(hash, blob.bytes, blob.mimeType);
      }
      await prisma.blob.upsert({
        where: { hash },
        create: { hash, size: blob.bytes.byteLength, mimeType: blob.mimeType },
        update: {},
      });
    }
  } catch (error) {
    // Bytes that did not make it into the store must not be referenced by a
    // rewritten document — that would trade a large document for a broken one.
    console.warn("Could not ingest inline images; leaving them inline", error);
    return 0;
  }

  return rewriteToBlobUrls(state, blobUrl);
}
