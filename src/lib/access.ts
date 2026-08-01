import { ApiError, requireOwner, type SessionUser } from "@/lib/api-utils";
import { findDocument } from "@/repositories/document";
import { findCanvasById, findNoteById } from "@/repositories/notes";
import { findProjectById } from "@/repositories/project";
import { getCachedRevision } from "@/repositories/revision";
import { findSeriesById } from "@/repositories/series";
import type { CloudPost } from "@/types";

/**
 * Authorized fetches: every one of these returns the row *and* proves the caller
 * may have it, so a route cannot obtain the data without the check having run.
 * Forgetting to authorize stops being an omission a reviewer has to spot and
 * becomes a variable that does not exist.
 *
 * This replaces ~25 hand-rolled `find… then compare author ids` sequences spread
 * across the route layer, several of which compared nothing at all.
 */

// ─── Documents ───────────────────────────────────────────────────────────────

/**
 * What a caller intends to do with a document.
 *
 * - `own`   — acts on the document as an object: rename, delete, change its
 *             handle or visibility, attach files, move it between containers.
 * - `write` — edits the document's *content*: open it in the editor, save a
 *             revision, flip its status.
 * - `read`  — views rendered content: thumbnails, forking a copy.
 */
export type DocumentAccess = "own" | "write" | "read";

/**
 * The access rule itself, without the fetch.
 *
 * Exported for the one shape `requireDocument` cannot express: deciding what a
 * caller *may* do with a document it has already been authorized to hold, so a
 * route can offer or withhold a capability instead of throwing. The Copilot
 * route uses it that way — a reader of someone else's published post gets the
 * agent's read tools and not its edit tools.
 *
 * This is not a way to authorize by hand. It takes a `CloudPost` that an
 * authorized fetch already returned; obtaining the row is still the check.
 */
export const permitsDocument = (
  doc: CloudPost,
  user: SessionUser | null,
  access: DocumentAccess,
): boolean => {
  const isAuthor = !!user && user.id === doc.author?.id;
  if (isAuthor) return true;
  if (access === "own") return false;

  // `coauthors` is populated for series queries but hardcoded to `[]` by
  // `findDocument` today, so this branch is currently unreachable for documents.
  // It is written out anyway so that restoring the coauthor read path is a
  // one-line repository change and not a hunt through the route layer.
  const isCoauthor = !!user &&
    doc.coauthors.some((coauthor) => coauthor.id === user.id);
  if (isCoauthor) return true;

  // `collab` means "anyone holding the link may edit", so it satisfies write.
  if (doc.collab) return true;
  if (access === "write") return false;

  // Both flags are checked: they are independent, and a post can be published
  // *and* private, which must stay unreadable.
  return !!doc.published && !doc.private;
};

/**
 * Fetch a document and authorize the caller for it, or throw.
 *
 * Throws 404 when there is no such document, 401 when an anonymous caller needs
 * to sign in, and 403 when a signed-in caller is not permitted.
 *
 * @param id       Document id or handle, as accepted by `findDocument`.
 * @param user     The caller, or null for an anonymous request.
 * @param access   See {@link DocumentAccess}.
 * @param options  `revisions` is forwarded to `findDocument`: `"all"` for the
 *                 full history, a revision id to pin one, omitted for `head`.
 *                 `subtitle` overrides the error copy shown to the caller.
 */
export async function requireDocument(
  id: string,
  user: SessionUser | null,
  access: DocumentAccess,
  options?: { revisions?: "all" | string | null; subtitle?: string },
): Promise<CloudPost> {
  const doc = await findDocument(id, options?.revisions);
  if (!doc) throw new ApiError(404, "Document not found");

  if (!permitsDocument(doc, user, access)) {
    if (!user) {
      throw new ApiError(
        401,
        "Unauthorized",
        options?.subtitle ?? "Please sign in to view this document",
      );
    }
    throw new ApiError(
      403,
      "Forbidden",
      options?.subtitle ?? "You are not authorized to access this document",
    );
  }

  return doc;
}

/**
 * Fetch a revision and authorize the caller against the document it belongs to.
 *
 * A revision id used to be a bearer token for its own content — and `head` ids
 * travel in document and series payloads, so anyone who could list series could
 * dereference every draft in the database. Access follows the parent document.
 *
 * `revisions: "all"` on the parent lookup keeps this read off the head-repair
 * write path inside `findDocument`.
 */
export async function requireRevision(
  revisionId: string,
  user: SessionUser | null,
  access: DocumentAccess,
  subtitle?: string,
) {
  const revision = await getCachedRevision(revisionId);
  if (!revision) {
    throw new ApiError(404, "Document Revision not found");
  }
  await requireDocument(revision.documentId, user, access, {
    revisions: "all",
    subtitle,
  });
  return revision;
}

// ─── Notes and canvases ──────────────────────────────────────────────────────

/**
 * Fetch a canvas and authorize the caller for it, or throw. Canvases have no
 * sharing model, so ownership is the only rule there is.
 */
export async function requireCanvas(
  canvasId: string,
  user: SessionUser,
  subtitle: string,
) {
  const canvas = await findCanvasById(canvasId);
  if (!canvas) {
    throw new ApiError(404, "Not Found", "Canvas not found");
  }
  requireOwner(canvas.authorId, user, subtitle);
  return canvas;
}

/**
 * Fetch a note and authorize the caller for it, or throw.
 *
 * A note belongs to a canvas, and the canvas is what carries the owner — so
 * finding the note proves nothing about who may touch it. Several handlers
 * authenticated and then acted on whatever id was passed, which let any
 * signed-in user edit or delete anyone else's notes.
 */
export async function requireOwnedNote(
  noteId: string,
  user: SessionUser,
  subtitle: string,
) {
  const note = await findNoteById(noteId);
  if (!note) {
    throw new ApiError(404, "Not Found", "Note not found");
  }
  await requireCanvas(note.canvasId, user, subtitle);
  return note;
}

// ─── Series and projects ─────────────────────────────────────────────────────

/**
 * Fetch a series whole and authorize the caller as its author, or throw.
 *
 * `findSeriesById` returns member posts unfiltered, so it must only ever reach a
 * proven author — anonymous and third-party reads go through
 * `findPublicSeriesById` instead.
 */
export async function requireOwnedSeries(
  seriesId: string,
  user: SessionUser,
  subtitle: string,
) {
  const series = await findSeriesById(seriesId);
  if (!series) {
    throw new ApiError(404, "Series not found");
  }
  requireOwner(series.authorId, user, subtitle);
  return series;
}

/**
 * Fetch a project and authorize the caller as its author, or throw. Projects are
 * an authoring concept with no public surface, so ownership is the only rule.
 */
export async function requireOwnedProject(
  projectId: string,
  user: SessionUser,
  subtitle: string,
) {
  const project = await findProjectById(projectId);
  if (!project) {
    throw new ApiError(404, "Project not found");
  }
  requireOwner(project.authorId, user, subtitle);
  return project;
}
