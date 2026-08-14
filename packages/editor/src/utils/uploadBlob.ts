import { getDocumentRefFromUrl } from "./documentContext";

/**
 * Put an image into the content-addressed blob store and get back a URL to
 * reference it by — docs/plans/blob-storage.md §6.
 *
 * This replaces embedding a base64 data URI in the node's `src`, which is what
 * made six distinct images occupy 13.6 MB across 141 copies: a data URI is
 * serialized into every revision, so re-saving a document re-stored every image
 * in it. A blob URL is 74 characters and never grows.
 *
 * ## Hash first, upload second
 *
 * The client hashes the bytes and asks the server to *link* that hash before
 * sending anything. Re-pasting an image the server already has therefore costs
 * one small round trip and no bytes at all — which is the common case, since
 * the duplication being fixed here came from the same handful of images being
 * used over and over.
 *
 * ## Falling back to a data URI is not a failure path to remove
 *
 * Guest drafts live in IndexedDB and have no server document to attach a blob
 * to, so there is nothing to upload *to* until phase 4 gives `localBackend` its
 * own blob store. Until then, and for any transient failure, the old data-URI
 * behaviour is kept: the image still lands, in the shape that always worked.
 * Callers get the data URI back and cannot tell the difference.
 */

/** Lowercase hex SHA-256 of a file's bytes, computed in the browser. */
export async function hashFile(file: File | Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Store `file` as a blob and return its URL, or `null` when it could not be
 * stored — in which case the caller should keep using the data URI it already
 * has.
 *
 * Never throws. A blob upload failing must not cost the user their paste.
 */
export async function uploadBlob(file: File | Blob): Promise<string | null> {
  try {
    const documentRef = getDocumentRefFromUrl();
    if (!documentRef) return null;

    const hash = await hashFile(file);

    // Ask before sending. A hit here is the dedup win.
    const linked = await fetch("/api/blob/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentRef, hash }),
    });
    if (linked.ok) {
      const { data } = await linked.json();
      return data.url as string;
    }
    // 404 means "not stored yet, send it". Anything else — 401 on a guest
    // draft, 403, a network error — means fall back rather than retry.
    if (linked.status !== 404) return null;

    const form = new FormData();
    form.append("file", file);
    form.append("documentRef", documentRef);

    const uploaded = await fetch("/api/blob", { method: "POST", body: form });
    if (!uploaded.ok) return null;

    const { data } = await uploaded.json();
    return data.url as string;
  } catch (error) {
    console.warn("Blob upload failed, keeping the inline data URI", error);
    return null;
  }
}

/**
 * The `src` to store for an image: a blob URL when one could be created,
 * otherwise the data URI passed in.
 *
 * The single call site shape for all three producers, so the fallback rule
 * lives in one place rather than being re-decided at each of them.
 */
export async function blobSrcOrFallback(
  file: File | Blob,
  dataUri: string,
): Promise<string> {
  return (await uploadBlob(file)) ?? dataUri;
}
