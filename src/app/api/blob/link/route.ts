import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseBody, userRoute } from "@/lib/api-utils";
import { requireDocument } from "@/lib/access";
import { linkBlobToDocument } from "@/repositories/blob";
import { isValidHash } from "@/lib/storage";
import { blobUrl } from "@/lib/blobRefs";

export const dynamic = "force-dynamic";

const linkSchema = z.object({
  /** A document id or handle — `requireDocument` resolves either. */
  documentRef: z.string().min(1),
  hash: z.string().refine(isValidHash, "Not a SHA-256 digest"),
}).strict();

/**
 * Attach an already-stored blob to a document — the deduplication fast path of
 * docs/plans/blob-storage.md §6.
 *
 * The client hashes locally and calls this before sending any bytes. A hit means
 * the image is already in the store and only the reference is new, so re-using
 * an image costs one small request instead of a megabyte. A **404 means "not
 * stored, send it"** and is the ordinary first-upload case rather than a
 * failure — the client treats it as a signal, and only a non-404 makes it give
 * up and fall back to an inline data URI.
 *
 * `requireDocument(..., "write")` and not `"own"`: inserting an image is editing
 * content, so a collaborator on a `collab` document may do it, exactly as they
 * may type. That is a deliberate difference from attachment upload, which is an
 * action on the document as an object and stays `own`.
 *
 * **Authorizing the document is what makes linking safe.** Linking is a write to
 * that document's reference set, and a caller who could link an arbitrary hash
 * to a document they control would grant themselves reads on any blob whose
 * digest they could obtain — the exact leak §4 exists to prevent.
 */
export const POST = userRoute(async (request, { user }) => {
  const { documentRef, hash } = await parseBody(request, linkSchema);

  const document = await requireDocument(documentRef, user, "write", {
    subtitle: "You are not authorized to add images to this document",
  });

  const linked = await linkBlobToDocument(hash, document.id);
  if (!linked) {
    throw new ApiError(404, "Not found", "That blob is not stored yet");
  }

  return NextResponse.json({ data: { url: blobUrl(hash), hash } });
}, {
  errorLabel: "Error linking blob",
  signInMessage: "Please sign in to add images",
});
