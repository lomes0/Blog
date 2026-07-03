import { authOptions } from "@/lib/auth";
import { ApiError, withApiHandler } from "@/lib/api-utils";
import {
  addPostToSeries,
  batchUpdateSeriesPosts,
  findSeriesById,
  removePostFromSeries,
} from "@/repositories/series";
import { findDocument } from "@/repositories/document";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { validate } from "uuid";

export const dynamic = "force-dynamic";

// GET /api/series/[id]/posts → get posts in series (ordered by rank)
export const GET = withApiHandler(
  async (request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;

    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid series id");
    }

    const series = await findSeriesById(params.id);
    if (!series) {
      throw new ApiError(404, "Series not found");
    }

    // Return posts in series ordered by rank
    return NextResponse.json({ data: series.posts });
  },
);

// POST /api/series/[id]/posts → add post to series
export const POST = withApiHandler(
  async (request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;

    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid series id");
    }

    const session = await getServerSession(authOptions);
    if (!session) {
      throw new ApiError(
        401,
        "Unauthorized",
        "Please sign in to add posts to series",
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

    const series = await findSeriesById(params.id);
    if (!series) {
      throw new ApiError(404, "Series not found");
    }

    // Check if user is the author of the series
    if (user.id !== series.authorId) {
      throw new ApiError(
        403,
        "Unauthorized",
        "You can only add posts to your own series",
      );
    }

    const body = await request.json();
    const { postId } = body;

    if (!postId) {
      throw new ApiError(400, "Bad Request", "Post ID is required");
    }

    if (!validate(postId)) {
      throw new ApiError(400, "Bad Request", "Invalid post id");
    }

    // Check if post exists and user owns it
    const post = await findDocument(postId);
    if (!post) {
      throw new ApiError(404, "Post not found");
    }

    if (user.id !== post.author.id) {
      throw new ApiError(
        403,
        "Unauthorized",
        "You can only add your own posts to series",
      );
    }

    // Add post to the series (appended; manual order is set via rank)
    await addPostToSeries(params.id, postId);

    // Revalidate all relevant paths
    revalidatePath("/series");
    revalidatePath(`/series/${params.id}`);
    revalidatePath("/");

    return NextResponse.json({
      data: { seriesId: params.id, postId },
    });
  },
);

// PATCH /api/series/[id]/posts → batch add/remove posts atomically
export const PATCH = withApiHandler(
  async (request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;

    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid series id");
    }

    const session = await getServerSession(authOptions);
    if (!session) {
      throw new ApiError(
        401,
        "Unauthorized",
        "Please sign in to update series posts",
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

    const series = await findSeriesById(params.id);
    if (!series) {
      throw new ApiError(404, "Series not found");
    }

    if (user.id !== series.authorId) {
      throw new ApiError(
        403,
        "Unauthorized",
        "You can only update posts in your own series",
      );
    }

    const body = await request.json();
    // Accept either bare ids or legacy { postId, order } objects for add.
    const postsToAdd: string[] = (body.postsToAdd ?? []).map(
      (p: string | { postId: string }) => typeof p === "string" ? p : p.postId,
    );
    const postsToRemove: string[] = body.postsToRemove ?? [];

    for (const postId of [...postsToAdd, ...postsToRemove]) {
      if (!validate(postId)) {
        throw new ApiError(400, "Bad Request", `Invalid post id: ${postId}`);
      }
    }

    await batchUpdateSeriesPosts(params.id, postsToAdd, postsToRemove);

    revalidatePath("/series");
    revalidatePath(`/series/${params.id}`);
    revalidatePath("/");

    return NextResponse.json({
      data: {
        seriesId: params.id,
        added: postsToAdd.length,
        removed: postsToRemove.length,
      },
    });
  },
);

// DELETE /api/series/[id]/posts?postId=<uuid> → remove post from series
export const DELETE = withApiHandler(
  async (request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;

    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid series id");
    }

    const session = await getServerSession(authOptions);
    if (!session) {
      throw new ApiError(
        401,
        "Unauthorized",
        "Please sign in to remove posts from series",
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

    const series = await findSeriesById(params.id);
    if (!series) {
      throw new ApiError(404, "Series not found");
    }

    // Check if user is the author of the series
    if (user.id !== series.authorId) {
      throw new ApiError(
        403,
        "Unauthorized",
        "You can only remove posts from your own series",
      );
    }

    const { searchParams } = new URL(request.url);
    const postId = searchParams.get("postId");

    if (!postId) {
      throw new ApiError(
        400,
        "Bad Request",
        "Post ID query parameter is required",
      );
    }

    if (!validate(postId)) {
      throw new ApiError(400, "Bad Request", "Invalid post id");
    }

    // Check if post exists and belongs to this series
    const post = await findDocument(postId);
    if (!post) {
      throw new ApiError(404, "Post not found");
    }

    // Remove post from series
    await removePostFromSeries(postId);

    // Revalidate all relevant paths
    revalidatePath("/series");
    revalidatePath(`/series/${params.id}`);
    revalidatePath("/");

    return NextResponse.json({ data: { postId } });
  },
);
