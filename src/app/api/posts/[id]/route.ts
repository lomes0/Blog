import { authOptions } from "@/lib/auth";
import {
  deletePost,
  findEditorPost,
  findUserPost,
  updatePost,
} from "@/repositories/post";
import {
  DeleteDocumentResponse,
  DocumentType,
  DocumentUpdateInput,
  GetDocumentResponse,
  PatchDocumentResponse,
} from "@/types";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { validate } from "uuid";
import { Prisma } from "@prisma/client";
import { validateHandle } from "../../documents/utils";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const response: GetDocumentResponse = {};
  try {
    const session = await getServerSession(authOptions);
    const userPost = await findUserPost(params.id, "all");
    if (!userPost) {
      response.error = { title: "Post not found" };
      return NextResponse.json(response, { status: 404 });
    }

    // For simple blog structure, posts can be public or private
    // Remove complex coauthor/collab logic
    if (!session && userPost.private) {
      response.error = {
        title: "This post is private",
        subtitle: "Please sign in to view it",
      };
      return NextResponse.json(response, { status: 401 });
    }

    if (session) {
      const { user } = session;
      if (user.disabled) {
        response.error = {
          title: "Account Disabled",
          subtitle: "Account is disabled for violating terms of service",
        };
        return NextResponse.json(response, { status: 403 });
      }
      const isAuthor = user.id === userPost.author.id;
      if (!isAuthor && userPost.private) {
        response.error = {
          title: "This post is private",
          subtitle: "You are not authorized to view this post",
        };
        return NextResponse.json(response, { status: 403 });
      }
    }

    const editorPost = await findEditorPost(params.id);
    if (!editorPost) {
      response.error = { title: "Post not found" };
      return NextResponse.json(response, { status: 404 });
    }
    response.data = { ...editorPost, cloudDocument: userPost };
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

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const response: PatchDocumentResponse = {};
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      response.error = {
        title: "Unauthorized",
        subtitle: "Please sign in to update your post",
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

    const userPost = await findUserPost(params.id);
    if (!userPost) {
      response.error = { title: "Post not found" };
      return NextResponse.json(response, { status: 404 });
    }

    const isAuthor = user.id === userPost.author.id;
    if (!isAuthor) {
      response.error = {
        title: "Unauthorized",
        subtitle: "You are not authorized to update this post",
      };
      return NextResponse.json(response, { status: 403 });
    }

    const body = await request.json() as DocumentUpdateInput;
    if (!body) {
      response.error = {
        title: "Bad Request",
        subtitle: "No post data provided",
      };
      return NextResponse.json(response, { status: 400 });
    }

    const input: Prisma.DocumentUncheckedUpdateInput = {
      name: body.name,
      updatedAt: body.updatedAt,
      published: body.published,
      private: body.private,
      // Ensure type remains DOCUMENT for posts
      type: "DOCUMENT" as DocumentType,
      // Remove domain/directory hierarchy
      parentId: null,
    };

    if (body.handle !== undefined) {
      if (body.handle === null) {
        input.handle = null;
      } else {
        input.handle = body.handle.toLowerCase();
        const validationError = await validateHandle(input.handle);
        if (validationError) {
          response.error = validationError;
          return NextResponse.json(response, { status: 400 });
        }
      }
    }

    // Remove coauthor complexity for simple blog structure
    // if (body.coauthors !== undefined) { ... }

    response.data = await updatePost(params.id, input);
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

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const response: DeleteDocumentResponse = {};
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      response.error = {
        title: "Unauthorized",
        subtitle: "Please sign in to delete your post",
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

    const userPost = await findUserPost(params.id);
    if (!userPost) {
      response.error = { title: "Post not found" };
      return NextResponse.json(response, { status: 404 });
    }

    const isAuthor = user.id === userPost.author.id;
    if (!isAuthor) {
      response.error = {
        title: "Unauthorized",
        subtitle: "You are not authorized to delete this post",
      };
      return NextResponse.json(response, { status: 403 });
    }

    await deletePost(params.id);
    response.data = params.id;
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
