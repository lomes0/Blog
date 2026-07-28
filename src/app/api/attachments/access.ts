import { ApiError, optionalUser, requireUser } from "@/lib/api-utils";
import { findDocument } from "@/repositories/document";
import path from "path";
import { validate as isUuid } from "uuid";

/**
 * Authorization for attachment files.
 *
 * Attachments are written to disk as `attach_<documentId>_<random>.<ext>` (see
 * `POST /api/documents/[id]/attachments`), so the owning document is recoverable
 * from the filename alone. That is what makes these routes authorizable at all:
 * before this, both the download and the *overwrite* endpoint ran with no
 * session check whatsoever, and a random-looking filename was the only thing
 * standing between an anonymous caller and the file.
 *
 * Access follows the parent document, matching the rule used for revisions:
 * reading needs read access to the document, writing needs to be its author.
 */

const ATTACHMENT_NAME = /^attach_([0-9a-fA-F-]{36})_/;

/** The upload directory. Callers pass a filename that has already been checked
 * for traversal; this resolves it and re-verifies containment as a backstop. */
export const ATTACHMENTS_DIR = path.join(
  process.cwd(),
  "public/uploads/attachments",
);

/** Reject anything that could escape the attachments directory. */
export function assertSafeFilename(filename: string): void {
  if (
    filename.includes("..") || filename.includes("/") ||
    filename.includes("\\")
  ) {
    throw new ApiError(400, "Invalid filename");
  }
}

/** Absolute path for `filename`, verified to stay inside the upload directory. */
export function attachmentPath(filename: string): string {
  assertSafeFilename(filename);
  const resolved = path.resolve(ATTACHMENTS_DIR, filename);
  if (
    resolved !== ATTACHMENTS_DIR &&
    !resolved.startsWith(ATTACHMENTS_DIR + path.sep)
  ) {
    throw new ApiError(400, "Invalid filename");
  }
  return resolved;
}

/** The document id encoded in an attachment filename, if it has one. */
function documentIdOf(filename: string): string | null {
  const match = ATTACHMENT_NAME.exec(filename);
  if (!match) return null;
  return isUuid(match[1]) ? match[1] : null;
}

/**
 * The document an attachment belongs to, or a thrown `ApiError` when the name
 * does not encode one. An unaddressable file cannot be authorized, so it is
 * refused rather than served on the assumption that it is harmless.
 */
async function documentFor(filename: string) {
  const documentId = documentIdOf(filename);
  if (!documentId) {
    throw new ApiError(
      403,
      "Forbidden",
      "This attachment is not associated with a document",
    );
  }
  // "all" so an authorization check never takes findDocument's head-repair
  // write path.
  const document = await findDocument(documentId, "all");
  if (!document) {
    throw new ApiError(404, "File not found");
  }
  return document;
}

/** Allow reading `filename`: author, coauthor, or a publicly readable document. */
export async function requireAttachmentRead(filename: string): Promise<void> {
  const document = await documentFor(filename);
  const user = await optionalUser();

  const isAuthor = !!user && user.id === document.author.id;
  const isCoauthor = !!user &&
    document.coauthors.some((coauthor) => coauthor.id === user.id);
  const isPublic = (document.published && !document.private) || document.collab;

  if (!isAuthor && !isCoauthor && !isPublic) {
    throw new ApiError(
      403,
      "Forbidden",
      "You are not authorized to view this attachment",
    );
  }
}

/** Allow overwriting `filename`: the document's author only. */
export async function requireAttachmentWrite(filename: string): Promise<void> {
  const document = await documentFor(filename);
  const user = await requireUser("Please sign in to edit attachments");
  if (user.id !== document.author.id) {
    throw new ApiError(
      403,
      "Forbidden",
      "You are not authorized to edit this attachment",
    );
  }
}
