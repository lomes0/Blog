import { NextResponse } from "next/server";
import { ApiError, userRoute } from "@/lib/api-utils";
import { requireDocument } from "@/lib/access";
import { recordBlob } from "@/repositories/blob";
import { blobExists, hashBytes, putBlob } from "@/lib/storage";
import { blobUrl } from "@/lib/blobRefs";

export const dynamic = "force-dynamic";

/** Matches the attachment upload ceiling, for one obvious limit rather than two. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * What may be stored through this route.
 *
 * Images only. This endpoint exists for the three producers in
 * docs/plans/blob-storage.md §6 — insert-image, paste/drag-drop, and sketches —
 * and every one of them handles pictures. Attachments keep their own route with
 * its own much wider allowlist, because "any file the author chose to attach"
 * and "content rendered inline in a post" are different trust problems.
 *
 * **`image/svg+xml` is here and is the one to think about**: an SVG is markup
 * and executes script when rendered inline. Sketches and graphs are SVG, so it
 * cannot simply be excluded. It is safe because of where the bytes go, not
 * because of what they are — `/api/blob/[hash]` serves every blob with
 * `Content-Security-Policy: sandbox` and `X-Content-Type-Options: nosniff`, so
 * script in a stored SVG has no origin to run in.
 */
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/svg+xml",
  "image/heic",
  "image/heif",
]);

/**
 * Store bytes as a content-addressed blob and reference them from a document.
 *
 * The hash is computed **here, from the bytes received**, and never taken from
 * the client. A client-supplied digest would let a caller store arbitrary
 * content under the digest of something else — poisoning every future dedup hit
 * for those bytes, since the whole system then trusts that key to mean that
 * content. The client hashes too, but only to ask `/api/blob/link` whether it
 * can skip the upload; nothing downstream believes it.
 *
 * Writing is idempotent for free: the key is the content. Two authors pasting
 * the same image concurrently converge on one object and one row instead of
 * racing, which is why there is no locking here.
 */
export const POST = userRoute(async (request, { user }) => {
  const formData = await request.formData();

  const file = formData.get("file");
  const documentRef = formData.get("documentRef");

  if (!(file instanceof File)) {
    throw new ApiError(400, "Bad Request", "No file uploaded");
  }
  if (typeof documentRef !== "string" || !documentRef) {
    throw new ApiError(400, "Bad Request", "Missing documentRef");
  }
  if (file.size > MAX_BYTES) {
    throw new ApiError(400, "File Too Large", "Maximum file size is 10MB");
  }

  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new ApiError(
      400,
      "Unsupported file type",
      `${mimeType} cannot be stored as an image`,
    );
  }

  // Authorize before touching the store, so an unauthorized caller cannot use
  // this endpoint to park bytes in the bucket.
  const document = await requireDocument(documentRef, user, "write", {
    subtitle: "You are not authorized to add images to this document",
  });

  const bytes = Buffer.from(await file.arrayBuffer());
  const hash = hashBytes(bytes);

  // The store is the authority on whether the object is present — a `Blob` row
  // can outlive its object if a previous upload half-failed. Skipping the PUT
  // when it is already there is the only thing this check buys; correctness
  // does not depend on it, because writing the same bytes to the same key twice
  // is a no-op.
  if (!(await blobExists(hash))) {
    await putBlob(hash, bytes, mimeType);
  }

  await recordBlob(hash, document.id, bytes.byteLength, mimeType);

  return NextResponse.json({
    data: { url: blobUrl(hash), hash, size: bytes.byteLength, mimeType },
  });
}, {
  errorLabel: "Error storing blob",
  signInMessage: "Please sign in to add images",
});
