import {
  ApiError,
  optionalUser,
  requireUser,
  withApiHandler,
} from "@/lib/api-utils";
import {
  deleteRevision,
  findRevisionAuthorId,
  getCachedRevision,
} from "@/repositories/revision";
import { findDocument } from "@/repositories/document";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * A revision's content, if the caller may read the document it belongs to.
 *
 * This route had no authorization at all: a revision id was a bearer token for
 * its content. That mattered because `head` ids travel in document and series
 * payloads, so anyone who could list series could dereference every draft in
 * the database. Access now follows the parent document, using the same rule as
 * `GET /api/documents/new/[id]`: the author, a coauthor, or anyone at all when
 * the document is published (and not private) or open for collaboration.
 */
export const GET = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const revision = await getCachedRevision(id);
  if (!revision) {
    throw new ApiError(404, "Document Revision not found");
  }

  // "all" so this read never takes the head-repair write path in findDocument.
  const document = await findDocument(revision.documentId, "all");
  if (!document) {
    throw new ApiError(404, "Document Revision not found");
  }

  const user = await optionalUser();
  const isAuthor = !!user && user.id === document.author.id;
  const isCoauthor = !!user &&
    document.coauthors.some((coauthor) => coauthor.id === user.id);
  const isPublic = (document.published && !document.private) || document.collab;

  if (!isAuthor && !isCoauthor && !isPublic) {
    throw new ApiError(
      403,
      "This document is private",
      "You are not authorized to view this revision",
    );
  }

  return NextResponse.json({ data: revision });
});

export const DELETE = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const user = await requireUser("Please sign in to delete this revision");
  const authorId = await findRevisionAuthorId(id);
  if (user.id !== authorId) {
    throw new ApiError(
      403,
      "Unauthorized",
      "You are not authorized to delete this revision",
    );
  }
  const revision = await deleteRevision(id);
  return NextResponse.json({
    data: {
      id: revision.id,
      documentId: revision.documentId,
    },
  });
});
