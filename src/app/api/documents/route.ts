import { ApiError, userRoute } from "@/lib/api-utils";
import {
  createDocument,
  findDocument,
  findDocumentsByAuthorId,
} from "@/repositories/document";
import { PostCreateInput } from "@/types";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { validateHandle } from "./utils";

export const dynamic = "force-dynamic";

// This route serves the signed-in author their own library. It used to fall back
// to `findAllDocuments`, which filters on neither `published` nor `private` and
// selects author emails — so an anonymous caller could read every draft in the
// database. Public listings are rendered server-side from
// `findPublishedDocuments` instead; there is no anonymous read here, which is
// why this is a `userRoute` and not an `optionalUserRoute`.
export const GET = userRoute(async (request, { user }) => {
  const { searchParams } = new URL(request.url);
  const rawLimit = searchParams.get("limit");
  const parsedLimit = rawLimit === null ? undefined : Number(rawLimit);
  if (
    parsedLimit !== undefined &&
    (!Number.isInteger(parsedLimit) || parsedLimit < 1)
  ) {
    throw new ApiError(400, "Bad Request", "`limit` must be a positive integer");
  }
  const cursor = searchParams.get("cursor") ?? undefined;

  // Paged: the repository caps `take`, so an author with thousands of posts can
  // no longer force one unbounded scan. Callers that want the whole list follow
  // `nextCursor` until it comes back null.
  const { documents, nextCursor } = await findDocumentsByAuthorId(user.id, {
    cursor,
    take: parsedLimit,
  });
  return NextResponse.json({ data: { documents, nextCursor } });
}, { signInMessage: "Please sign in to list your documents" });

export const POST = userRoute(async (request, { user }) => {
  const body = (await request.json()) as PostCreateInput;
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
}, { signInMessage: "Please sign in to save your document to the cloud" });
