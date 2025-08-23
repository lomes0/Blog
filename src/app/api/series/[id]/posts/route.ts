import { authOptions } from "@/lib/auth";
import { addPostToSeries, findSeriesById } from "@/repositories/series";
import { findUserPost } from "@/repositories/post";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { validate } from "uuid";

export const dynamic = "force-dynamic";

// GET /api/series/[id]/posts → get posts in series (ordered by seriesOrder)
export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const response: { data?: any; error?: { title: string; subtitle?: string } } = {};
  
  try {
    if (!validate(params.id)) {
      response.error = { title: "Bad Request", subtitle: "Invalid series id" };
      return NextResponse.json(response, { status: 400 });
    }

    const series = await findSeriesById(params.id);
    if (!series) {
      response.error = { title: "Series not found" };
      return NextResponse.json(response, { status: 404 });
    }

    // Return posts in series ordered by seriesOrder
    response.data = series.posts;
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

// POST /api/series/[id]/posts → add post to series
export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const response: { data?: any; error?: { title: string; subtitle?: string } } = {};
  
  try {
    if (!validate(params.id)) {
      response.error = { title: "Bad Request", subtitle: "Invalid series id" };
      return NextResponse.json(response, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    if (!session) {
      response.error = {
        title: "Unauthorized",
        subtitle: "Please sign in to add posts to series",
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

    const series = await findSeriesById(params.id);
    if (!series) {
      response.error = { title: "Series not found" };
      return NextResponse.json(response, { status: 404 });
    }

    // Check if user is the author of the series
    if (user.id !== series.authorId) {
      response.error = {
        title: "Unauthorized",
        subtitle: "You can only add posts to your own series",
      };
      return NextResponse.json(response, { status: 403 });
    }

    const body = await request.json();
    const { postId, order } = body;

    if (!postId) {
      response.error = {
        title: "Bad Request",
        subtitle: "Post ID is required",
      };
      return NextResponse.json(response, { status: 400 });
    }

    if (!validate(postId)) {
      response.error = { title: "Bad Request", subtitle: "Invalid post id" };
      return NextResponse.json(response, { status: 400 });
    }

    // Check if post exists and user owns it
    const post = await findUserPost(postId);
    if (!post) {
      response.error = { title: "Post not found" };
      return NextResponse.json(response, { status: 404 });
    }

    if (user.id !== post.author.id) {
      response.error = {
        title: "Unauthorized",
        subtitle: "You can only add your own posts to series",
      };
      return NextResponse.json(response, { status: 403 });
    }

    // Add post to series with order
    await addPostToSeries(params.id, postId, order || 0);

    response.data = { seriesId: params.id, postId, order: order || 0 };
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
