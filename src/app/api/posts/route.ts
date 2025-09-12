import { authOptions } from "@/lib/auth";
import {
  createPost,
  findAllPosts,
  findPostsByAuthorId,
  findUserPost,
} from "@/repositories/post";
import {
  DocumentCreateInput,
  DocumentType,
  GetDocumentsResponse,
  PostDocumentsResponse,
} from "@/types";
import {
  PartitionedPostsResponse,
  PartitionGranularity,
  PostsQueryParams,
} from "@/types/partitioning";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { validateHandle } from "../documents/utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // Parse query parameters for partitioning
  const queryParams: PostsQueryParams = {
    groupBy: (searchParams.get("groupBy") as PartitionGranularity) || "month",
    limit: searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!)
      : undefined,
    offset: searchParams.get("offset")
      ? parseInt(searchParams.get("offset")!)
      : undefined,
    published: searchParams.get("published")
      ? searchParams.get("published") === "true"
      : undefined,
  };

  const response: GetDocumentsResponse = {};
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      const allPosts = await findAllPosts(queryParams.limit);
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
        subtitle: "Please sign in to save your post to the cloud",
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
        subtitle: "No post provided",
      };
      return NextResponse.json(response, { status: 400 });
    }

    const userPost = await findUserPost(body.id);
    if (userPost) {
      response.error = {
        title: "Unauthorized",
        subtitle: "A post with this id already exists",
      };
      return NextResponse.json(response, { status: 403 });
    }

    const input: Prisma.DocumentUncheckedCreateInput = {
      id: body.id,
      authorId: user.id,
      name: body.name,
      createdAt: body.createdAt,
      updatedAt: body.updatedAt,
      head: body.head,
      published: body.published,
      collab: body.collab,
      private: body.private,
      // Blog posts use flat structure - no parentId
      parentId: null,
      type: "DOCUMENT" as DocumentType, // Always DOCUMENT for posts
      revisions: {
        create: {
          id: body.head || undefined,
          data: body.data as unknown as Prisma.JsonObject,
          authorId: user.id,
          createdAt: body.updatedAt,
        },
      },
    };

    // Add series support if provided
    if (body.seriesId) {
      (input as any).seriesId = body.seriesId;
    }
    if (body.seriesOrder !== undefined) {
      (input as any).seriesOrder = body.seriesOrder;
    }

    if (body.handle) {
      input.handle = body.handle.toLowerCase();
      const validationError = await validateHandle(input.handle);
      if (validationError) {
        response.error = validationError;
        return NextResponse.json(response, { status: 400 });
      }
    }

    // Remove coauthor complexity for simple blog structure
    // if (body.coauthors) { ... }

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
