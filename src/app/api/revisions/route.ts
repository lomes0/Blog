import { ApiError, withApiHandler } from "@/lib/api-utils";
import { authOptions } from "@/lib/auth";
import { createRevision, findRevisionDocumentId } from "@/repositories/revision";
import { Revision } from "@/types";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { findDocument } from "@/repositories/document";

export const dynamic = "force-dynamic";

export const POST = withApiHandler(async (request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new ApiError(
      401,
      "Unauthorized",
      "Please sign in to save your revision to the cloud",
    );
  }
  const { user } = session;
  if (user.disabled) {
    throw new ApiError(
      403,
      "Account Disabled",
      "Account is disabled for violating terms of service",
    );
  }
  const body = (await request.json()) as Revision;
  if (!body) {
    throw new ApiError(400, "Bad Request", "No revision provided");
  }

  const cloudDocument = await findDocument(body.documentId);
  if (!cloudDocument) {
    throw new ApiError(404, "Document not found");
  }
  const isAuthor = user.id === cloudDocument.author.id;
  // Remove coauthor logic for simple blog structure
  const isCollab = cloudDocument.collab;

  if (!isAuthor && !isCollab) {
    throw new ApiError(
      403,
      "This document is private",
      "You are not authorized to Edit this document",
    );
  }

  // Re-posting a known id now rewrites that revision (the editor folds a run of
  // autosaves into one), so an id belonging to a different document must be
  // refused — otherwise it would be a way to overwrite another post's history.
  const existingDocumentId = await findRevisionDocumentId(body.id);
  if (existingDocumentId && existingDocumentId !== body.documentId) {
    throw new ApiError(
      403,
      "Unauthorized",
      "That revision belongs to a different document",
    );
  }

  const input: Prisma.RevisionUncheckedCreateInput = {
    id: body.id,
    authorId: user.id,
    documentId: body.documentId,
    createdAt: body.createdAt,
    data: body.data as unknown as Prisma.JsonObject,
  };

  const revision = await createRevision(input);
  return NextResponse.json({
    data: {
      id: revision.id,
      documentId: revision.documentId,
      createdAt: revision.createdAt,
      author: {
        id: user.id,
        handle: user.handle,
        name: user.name,
        image: user.image,
        email: user.email,
      },
    },
  });
});
