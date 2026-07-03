import { authOptions } from "@/lib/auth";
import { ApiError, withApiHandler } from "@/lib/api-utils";
import {
  createDocument,
  findAllDocuments,
  findDocument,
  findDocumentsByAuthorId,
} from "@/repositories/document";
import { DocumentCreateInput } from "@/types";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { validateHandle } from "./utils";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(async (request) => {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit")
    ? parseInt(searchParams.get("limit")!)
    : undefined;
  const session = await getServerSession(authOptions);
  if (!session) {
    const allPosts = await findAllDocuments(limit);
    return NextResponse.json({ data: allPosts });
  }
  const { user } = session;
  if (user.disabled) {
    throw new ApiError(
      403,
      "Account Disabled",
      "Account is disabled for violating terms of service",
    );
  }
  const posts = await findDocumentsByAuthorId(user.id);
  return NextResponse.json({ data: posts });
});

export const POST = withApiHandler(async (request) => {
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new ApiError(
      401,
      "Unauthorized",
      "Please sign in to save your document to the cloud",
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
  const body = (await request.json()) as DocumentCreateInput;
  if (!body) {
    throw new ApiError(400, "Bad Request", "No document provided");
  }

  const userPost = await findDocument(body.id);
  if (userPost) {
    throw new ApiError(
      403,
      "Unauthorized",
      "A document with this id already exists",
    );
  }

  // rank is assigned by createDocument (appended to the document's container).
  const input: Omit<Prisma.DocumentUncheckedCreateInput, "rank"> = {
    id: body.id,
    authorId: user.id,
    name: body.name,
    createdAt: body.createdAt,
    head: body.head,
    published: body.published,
    collab: body.collab,
    private: body.private,
    parentId: body.parentId,
    type: body.type || "DOCUMENT",
    ...(body.description !== undefined && { description: body.description }),
    ...(body.tabLabel !== undefined && { tabLabel: body.tabLabel }),
    ...(body.seriesId !== undefined && { seriesId: body.seriesId }),
    revisions: {
      create: {
        id: body.head || undefined,
        data: body.data as unknown as Prisma.JsonObject,
        authorId: user.id,
        createdAt: body.updatedAt,
      },
    },
  };
  if (body.handle) {
    input.handle = body.handle.toLowerCase();
    const validationError = await validateHandle(input.handle);
    if (validationError) {
      throw new ApiError(400, validationError.title, validationError.subtitle);
    }
  }
  if (body.coauthors) {
    const documentId = body.id;
    const userEmails = body.coauthors as string[];
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
      connectOrCreate: userEmails.map((userEmail) => ({
        where: { documentId_userEmail: { documentId, userEmail } },
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

  if (body.baseId) {
    const basePost = await findDocument(body.baseId);
    if (basePost) input.baseId = body.baseId;
  }

  const data = await createDocument(input);

  revalidatePath("/");
  if (body.seriesId) {
    revalidatePath("/series");
    revalidatePath(`/series/${body.seriesId}`);
  }

  return NextResponse.json({ data });
});
