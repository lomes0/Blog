import { authOptions } from "@/lib/auth";
import { ApiError, withApiHandler } from "@/lib/api-utils";
import {
  deleteDocument,
  findDocument,
  findEditorDocument,
  updateDocument,
} from "@/repositories/document";
import { PostUpdateInput } from "@/types";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { validate } from "uuid";
import { Prisma } from "@prisma/client";
import { validateHandle } from "../utils";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  async (request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const session = await getServerSession(authOptions);
    const userPost = await findDocument(params.id, "all");
    if (!userPost) {
      throw new ApiError(404, "Document not found");
    }
    const isCollab = userPost.collab;
    if (!session && !isCollab) {
      throw new ApiError(
        401,
        "This document is private",
        "Please sign in to Edit it",
      );
    }
    if (session) {
      const { user } = session;
      if (user.disabled) {
        throw new ApiError(
          403,
          "Account Disabled",
          "Account is disabled for violating terms of service",
        );
      }
      const isAuthor = user.id === userPost.author.id;
      const isCoauthor = userPost.coauthors.some(
        (coauthor: { id: string }) => coauthor.id === user.id,
      );
      if (!isAuthor && !isCoauthor && !isCollab) {
        throw new ApiError(
          403,
          "This document is private",
          "You are not authorized to Edit this document",
        );
      }
    }
    const editorPost = await findEditorDocument(params.id);
    if (!editorPost) {
      throw new ApiError(404, "Document not found");
    }
    return NextResponse.json({
      data: { ...editorPost, cloudDocument: userPost },
    });
  },
);

export const PATCH = withApiHandler(
  async (request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid id");
    }
    const session = await getServerSession(authOptions);
    if (!session) {
      throw new ApiError(
        401,
        "This document is private",
        "Please sign in to Edit it",
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
    const userPost = await findDocument(params.id);
    if (!userPost) {
      throw new ApiError(404, "Document not found");
    }
    if (user.id !== userPost.author.id) {
      throw new ApiError(
        403,
        "This document is private",
        "You are not authorized to Edit this document",
      );
    }

    const body: PostUpdateInput = await request.json();
    if (!body) {
      throw new ApiError(400, "Bad Request", "Invalid request body");
    }

    const input: Prisma.DocumentUncheckedUpdateInput = {
      name: body.name,
      head: body.head,
      handle: body.handle,
      createdAt: body.createdAt,
      published: body.published,
      collab: body.collab,
      private: body.private,
      parentId: body.parentId,
      background_image: body.background_image,
      status: body.status,
      ...(body.description !== undefined && { description: body.description }),
      ...(body.tabLabel !== undefined && { tabLabel: body.tabLabel }),
    };

    // Series membership changes go through PATCH /api/documents/[id]/move,
    // which also assigns a rank in the destination container.

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

    if (body.data) {
      input.revisions = {
        connectOrCreate: {
          where: { id: body.head },
          create: {
            id: body.head,
            authorId: user.id,
            createdAt: body.updatedAt,
            data: body.data as unknown as Prisma.InputJsonObject,
          },
        },
      };
    }

    const data = await updateDocument(params.id, input);

    revalidatePath("/");
    revalidatePath(`/${userPost.handle || params.id}`);
    revalidatePath(`/view/${params.id}`);
    if (userPost.seriesId) {
      revalidatePath("/series");
      revalidatePath(`/series/${userPost.seriesId}`);
    }

    return NextResponse.json({ data });
  },
);

export const DELETE = withApiHandler(
  async (request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid id");
    }
    const session = await getServerSession(authOptions);
    if (!session) {
      throw new ApiError(
        401,
        "This document is private",
        "Please sign in to delete it",
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
    const userPost = await findDocument(params.id);
    if (!userPost) {
      throw new ApiError(404, "Document not found");
    }
    if (user.id !== userPost.author.id) {
      throw new ApiError(
        403,
        "This document is private",
        "You are not authorized to delete this document",
      );
    }

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
);
