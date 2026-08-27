import {
  ApiError,
  optionalUserRoute,
  parseBody,
  userRoute,
} from "@/lib/api-utils";
import { requireDocument } from "@/lib/access";
import { reconcileDocumentBlobs } from "@/repositories/blob";
import { blobHashesFor } from "@/lib/blobRefs";
import {
  deleteDocument,
  findEditorDocument,
  StaleHeadError,
  updateDocument,
} from "@/repositories/document";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { validate } from "uuid";
import { Prisma } from "@prisma/client";
import { validateHandle } from "../utils";
import { documentUpdateSchema } from "../schemas";

export const dynamic = "force-dynamic";

export const GET = optionalUserRoute<{ id: string }>(
  async (request, { params, user }) => {
    // "write" rather than "read": this returns the editable document, so a
    // published-but-not-collab post is not readable here just because it is
    // public — that is what the render routes are for.
    const userPost = await requireDocument(params.id, user, "write", {
      revisions: "all",
      subtitle: "You are not authorized to Edit this document",
    });
    const editorPost = await findEditorDocument(params.id);
    if (!editorPost) {
      throw new ApiError(404, "Document not found");
    }
    return NextResponse.json({
      data: { ...editorPost, cloudDocument: userPost },
    });
  },
);

export const PATCH = userRoute<{ id: string }>(
  async (request, { params, user }) => {
    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid id");
    }
    const userPost = await requireDocument(params.id, user, "own", {
      subtitle: "You are not authorized to Edit this document",
    });

    const body = await parseBody(request, documentUpdateSchema);

    const input: Prisma.DocumentUncheckedUpdateInput = {
      name: body.name,
      head: body.head,
      handle: body.handle,
      createdAt: body.createdAt,
      published: body.published,
      collab: body.collab,
      private: body.private,
      status: body.status,
      ...(body.description !== undefined && { description: body.description }),
      ...(body.tabLabel !== undefined && { tabLabel: body.tabLabel }),
    };

    // Container changes — `parentId`, `seriesId`, `rank` — are not reachable from
    // here: they are absent from `documentUpdateSchema`, which is `.strict()`, so
    // sending one is a 400 naming the field. They go through PATCH
    // /api/documents/[id]/move, which authorizes the destination, refuses parent
    // cycles, and assigns a rank in the container the document lands in.

    if (body.handle && body.handle !== userPost.handle) {
      input.handle = body.handle.toLowerCase();
      const validationError = await validateHandle(input.handle);
      if (validationError) {
        throw new ApiError(
          400,
          validationError.title,
          validationError.subtitle,
        );
      }
    }

    if (body.coauthors) {
      const documentId = params.id;
      const userEmails = body.coauthors;
      const InvalidEmails = userEmails.filter(
        (email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      );
      if (InvalidEmails.length > 0) {
        throw new ApiError(
          400,
          "Invalid Coauthor Email",
          "One or more emails are invalid",
        );
      }
      input.coauthors = {
        deleteMany: {
          userEmail: { notIn: userEmails },
        },
        upsert: userEmails.map((userEmail) => ({
          where: { documentId_userEmail: { documentId, userEmail } },
          update: {},
          create: {
            user: {
              connectOrCreate: {
                where: { email: userEmail },
                create: {
                  name: userEmail.split("@")[0],
                  email: userEmail,
                },
              },
            },
          },
        })),
      };
    }

    // `head` names the revision the content belongs to, so content without one
    // has nowhere to go — previously it reached Prisma as `where: { id: undefined }`.
    if (body.data && body.head) {
      input.revisions = {
        connectOrCreate: {
          where: { id: body.head },
          create: {
            id: body.head,
            authorId: user.id,
            createdAt: body.updatedAt,
            data: body.data as unknown as Prisma.InputJsonObject,
            // Stamped in the same statement as the content it describes
            // (docs/plans/blob-storage.md §3). Nothing else reads `data` back to
            // work this out, so a write that stores one without the other is the
            // one way to make the collector wrong.
            blobHashes: blobHashesFor(body.data),
          },
        },
      };
    }

    // `expectedHead` is absent on a rename or a publish toggle, which writes
    // unconditionally; a content save sends the head it is replacing, and loses
    // to whoever got there first rather than overwriting them.
    let data;
    try {
      data = await updateDocument(params.id, input, body.expectedHead);
    } catch (error) {
      if (error instanceof StaleHeadError) {
        throw new ApiError(
          409,
          "Saved somewhere else first",
          "This document changed after your last save — another tab, or an " +
            "agent. Nothing was overwritten; your unsaved text is kept locally " +
            "and comes back when you reopen the document.",
        );
      }
      throw error;
    }

    // The content is committed; bring the document's blob references in line
    // with it (docs/plans/blob-storage.md §3). Only a content save can change
    // them — a rename or a publish toggle carries no `data`.
    if (body.data && body.head) {
      await reconcileDocumentBlobs(params.id);
    }

    revalidatePath("/");
    revalidatePath(`/${userPost.handle || params.id}`);
    revalidatePath(`/view/${params.id}`);
    if (userPost.seriesId) {
      revalidatePath("/series");
      revalidatePath(`/series/${userPost.seriesId}`);
    }

    return NextResponse.json({ data });
  },
  { signInMessage: "Please sign in to Edit it" },
);

export const DELETE = userRoute<{ id: string }>(
  async (request, { params, user }) => {
    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid id");
    }
    const userPost = await requireDocument(params.id, user, "own", {
      subtitle: "You are not authorized to delete this document",
    });

    // Delete post using transaction for consistency
    await deleteDocument(params.id);

    // Aggressively revalidate all affected paths
    // Using both "page" and "layout" ensures complete cache invalidation
    revalidatePath("/", "layout");
    revalidatePath("/posts", "page");
    revalidatePath("/series", "page");
    if (userPost.seriesId) {
      revalidatePath(`/series/${userPost.seriesId}`, "page");
    }

    return NextResponse.json({ data: params.id });
  },
  { signInMessage: "Please sign in to delete it" },
);
