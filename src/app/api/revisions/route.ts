import { ApiError, userRoute } from "@/lib/api-utils";
import { requireDocument } from "@/lib/access";
import { createRevision, findRevisionDocumentId } from "@/repositories/revision";
import { Revision } from "@/types";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export const POST = userRoute(async (request, { user }) => {
  const body = (await request.json()) as Revision;
  if (!body) {
    throw new ApiError(400, "Bad Request", "No revision provided");
  }

  await requireDocument(body.documentId, user, "write", {
    subtitle: "You are not authorized to Edit this document",
  });

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
}, { signInMessage: "Please sign in to save your revision to the cloud" });
