import {
  ApiError,
  optionalUser,
  requireOwner,
  requireUser,
  withApiHandler,
} from "@/lib/api-utils";
import {
  addPostToSeries,
  batchUpdateSeriesPosts,
  findPublicSeriesById,
  findSeriesById,
  removePostFromSeries,
} from "@/repositories/series";
import { findDocument, findUnownedDocumentIds } from "@/repositories/document";
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

    // The author gets every post in the series; anyone else gets the published
    // ones. This route used to return the unfiltered list to anonymous callers.
    const user = await optionalUser();
    const series = await findSeriesById(params.id);
    if (series && user && series.authorId === user.id) {
      return NextResponse.json({ data: series.posts });
    }

    const publicSeries = await findPublicSeriesById(params.id);
    if (!publicSeries) {
      throw new ApiError(404, "Series not found");
    }
    return NextResponse.json({ data: publicSeries.posts });
  },
);

// POST /api/series/[id]/posts → add post to series
export const POST = withApiHandler(
  async (request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;

    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid series id");
    }

    const user = await requireUser("Please sign in to add posts to series");

    const series = await findSeriesById(params.id);
    if (!series) {
      throw new ApiError(404, "Series not found");
    }
    requireOwner(
      series.authorId,
      user,
      "You can only add posts to your own series",
    );

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
    requireOwner(
      post.author.id,
      user,
      "You can only add your own posts to series",
    );

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

    const user = await requireUser("Please sign in to update series posts");

    const series = await findSeriesById(params.id);
    if (!series) {
      throw new ApiError(404, "Series not found");
    }
    requireOwner(
      series.authorId,
      user,
      "You can only update posts in your own series",
    );

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

    // Owning the series is not enough — every post named here must also be the
    // caller's. Without this, a well-formed request could pull another author's
    // posts into your series, or evict theirs from theirs. The single-post POST
    // above always checked this; the batch path did not.
    const unowned = await findUnownedDocumentIds(
      [...postsToAdd, ...postsToRemove],
      user.id,
    );
    if (unowned.length > 0) {
      throw new ApiError(
        403,
        "Forbidden",
        `You can only move your own posts (${unowned.length} not yours)`,
      );
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

    const user = await requireUser(
      "Please sign in to remove posts from series",
    );

    const series = await findSeriesById(params.id);
    if (!series) {
      throw new ApiError(404, "Series not found");
    }
    requireOwner(
      series.authorId,
      user,
      "You can only remove posts from your own series",
    );

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

    const post = await findDocument(postId);
    if (!post) {
      throw new ApiError(404, "Post not found");
    }
    // The comment here used to claim this checked series membership; it checked
    // only that the post existed, so any post id would be re-homed to root.
    requireOwner(
      post.author.id,
      user,
      "You can only remove your own posts from a series",
    );
    if (post.seriesId !== params.id) {
      throw new ApiError(404, "Post is not in this series");
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
