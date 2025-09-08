import { authOptions } from "@/lib/auth";
import { findUserPost, updatePost } from "@/repositories/post";
import { DocumentStatus } from "@/types";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  return NextResponse.json({ message: "Status endpoint reached", id: params.id });
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  
  console.log('Status API called with ID:', params.id);
  
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: { title: "Unauthorized", subtitle: "Please sign in" } },
        { status: 401 }
      );
    }

    const { user } = session;
    if (user.disabled) {
      return NextResponse.json(
        {
          error: {
            title: "Account Disabled",
            subtitle: "Account is disabled for violating terms of service",
          },
        },
        { status: 403 }
      );
    }

    // Find the document
    const userPost = await findUserPost(params.id);
    if (!userPost) {
      return NextResponse.json(
        { error: { title: "Document not found" } },
        { status: 404 }
      );
    }

    // Check if user can edit this document
    const isAuthor = user.id === userPost.author.id;
    const isCollab = userPost.collab;
    const canEdit = isAuthor || isCollab;

    if (!canEdit) {
      return NextResponse.json(
        {
          error: {
            title: "Forbidden",
            subtitle: "You are not authorized to edit this document",
          },
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { status } = body;

    console.log('Received request body:', body);
    console.log('Status to update:', status);

    // Validate status
    if (!status || !Object.values(DocumentStatus).includes(status)) {
      return NextResponse.json(
        {
          error: {
            title: "Bad Request",
            subtitle: "Invalid status value",
          },
        },
        { status: 400 }
      );
    }

    // Update the document status
    const updatedPost = await updatePost(params.id, {
      status,
      updatedAt: new Date(),
    });

    if (!updatedPost) {
      return NextResponse.json(
        {
          error: {
            title: "Internal Server Error",
            subtitle: "Failed to update document",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: updatedPost.id,
        status: updatedPost.status,
      },
    });
  } catch (error) {
    console.error("Error updating document status:", error);
    return NextResponse.json(
      {
        error: {
          title: "Internal Server Error",
          subtitle: "Failed to update document status",
        },
      },
      { status: 500 }
    );
  }
}
