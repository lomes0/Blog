import { authOptions } from "@/lib/auth";
import {
  createPost,
  findAllPosts,
  findPostsByAuthorId,
  findUserPost,
} from "@/repositories/post";
import {
  DocumentCreateInput,
  GetDocumentsResponse,
  PostDocumentsResponse,
} from "@/types";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { validateHandle } from "./utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const response: GetDocumentsResponse = {};
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      const allPosts = await findAllPosts();
      response.data = allPosts;
      return NextResponse.json(response, { status: 200 });
    }
    const { user } = session;
    if (user.disabled) {
      response.error = {
        title: "Account Disabled",
        subtitle: "Account is disabled for violating terms of service",
      };
      return NextResponse.json(response, { status: 403 });
    }
    const posts = await findPostsByAuthorId(user.id);
    response.data = posts;
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.log(error);
    response.error = {
      title: "Something went wrong",
      subtitle: "Please try again later",
    };
    return NextResponse.json(response, { status: 500 });
  }
}

export async function POST(request: Request) {
  const response: PostDocumentsResponse = {};
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      response.error = {
        title: "Unauthorized",
        subtitle: "Please sign in to save your document to the cloud",
      };
      return NextResponse.json(response, { status: 401 });
    }
    const { user } = session;
    if (user.disabled) {
      response.error = {
        title: "Account Disabled",
        subtitle: "Account is disabled for violating terms of service",
      };
      return NextResponse.json(response, { status: 403 });
    }
    const body = await request.json() as DocumentCreateInput;
    if (!body) {
      response.error = {
        title: "Bad Request",
        subtitle: "No document provided",
      };
      return NextResponse.json(response, { status: 400 });
    }

    const userPost = await findUserPost(body.id);
    if (userPost) {
      response.error = {
        title: "Unauthorized",
        subtitle: "A document with this id already exists",
      };
      return NextResponse.json(response, { status: 403 });
    }

    const input: Prisma.DocumentUncheckedCreateInput = {
      id: body.id,
      authorId: user.id,
      name: body.name,
      description: body.description,
      createdAt: body.createdAt,
      updatedAt: body.updatedAt,
      head: body.head,
      published: body.published,
      collab: body.collab,
      private: body.private,
      parentId: body.parentId, // Include parentId when creating document
      type: body.type || "DOCUMENT", // Ensure posts are created as DOCUMENT type
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
        response.error = validationError;
        return NextResponse.json(response, { status: 400 });
      }
    }
    if (body.coauthors) {
      const documentId = body.id;
      const userEmails = body.coauthors as string[];
      const InvalidEmails = userEmails.filter((email) =>
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      );
      if (InvalidEmails.length > 0) {
        response.error = {
          title: "Invalid Coauther Email",
          subtitle: "One or more emails are invalid",
        };
        return NextResponse.json(response, { status: 400 });
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
      const basePost = await findUserPost(body.baseId);
      if (basePost) input.baseId = body.baseId;
    }

    response.data = await createPost(input);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.log(error);
    response.error = {
      title: "Something went wrong",
      subtitle: "Please try again later",
    };
    return NextResponse.json(response, { status: 500 });
  }
}
