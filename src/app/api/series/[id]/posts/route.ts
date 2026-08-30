import {
  ApiError,
  optionalUserRoute,
  parseBody,
  userRoute,
} from "@/lib/api-utils";
import { requireDocument, requireOwnedSeries } from "@/lib/access";
import {
  addPostToSeries,
  batchUpdateSeriesPosts,
  findPublicSeriesById,
  findSeriesById,
  removePostFromSeries,
} from "@/repositories/series";
import { findUnownedDocumentIds } from "@/repositories/document";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { validate } from "uuid";
import { z } from "zod";

export const dynamic = "force-dynamic";

const addPostSchema = z.object({
  postId: z.string().uuid("Invalid post id"),
}).strict();

// `postsToAdd` accepts bare ids or legacy `{ postId, order }` objects; `order` is
// ignored either way, since position within a series is the series'
// `postOrder` (docs/plans/ordering-simplification.md §2).
const batchPostsSchema = z.object({
  postsToAdd: z
    .array(
      z.union([
        z.string().uuid(),
        z.object({ postId: z.string().uuid() }).passthrough(),
      ]),
    )
    .default([]),
  postsToRemove: z.array(z.string().uuid()).default([]),
}).strict();

// GET /api/series/[id]/posts → get posts in series (in its `postOrder`)
export const GET = optionalUserRoute<{ id: string }>(
  async (_request, { params, user }) => {
    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid series id");
    }

    // The author gets every post in the series; anyone else gets the published
    // ones. This route used to return the unfiltered list to anonymous callers.
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
export const POST = userRoute<{ id: string }>(
  async (request, { params, user }) => {
    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid series id");
    }

    await requireOwnedSeries(
      params.id,
      user,
      "You can only add posts to your own series",
    );

    const { postId } = await parseBody(request, addPostSchema);

    await requireDocument(postId, user, "own", {
      subtitle: "You can only add your own posts to series",
    });

    // Add post to the series (appended; manual order is a separate write)
    await addPostToSeries(params.id, postId);

    // Revalidate all relevant paths
    revalidatePath("/series");
    revalidatePath(`/series/${params.id}`);
    revalidatePath("/");

    return NextResponse.json({
      data: { seriesId: params.id, postId },
    });
  },
  { signInMessage: "Please sign in to add posts to series" },
);

// PATCH /api/series/[id]/posts → batch add/remove posts atomically
export const PATCH = userRoute<{ id: string }>(
  async (request, { params, user }) => {
    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid series id");
    }

    await requireOwnedSeries(
      params.id,
      user,
      "You can only update posts in your own series",
    );

    const body = await parseBody(request, batchPostsSchema);
    const postsToAdd = body.postsToAdd.map((p) =>
      typeof p === "string" ? p : p.postId
    );
    const postsToRemove = body.postsToRemove;

    // Owning the series is not enough — every post named here must also be the
    // caller's. Without this, a well-formed request could pull another author's
    // posts into your series, or evict theirs from theirs. The single-post POST
    // above always checked this; the batch path did not. One query answers for
    // the whole batch, so checking only the first is not an available mistake.
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
  { signInMessage: "Please sign in to update series posts" },
);

// DELETE /api/series/[id]/posts?postId=<uuid> → remove post from series
export const DELETE = userRoute<{ id: string }>(
  async (request, { params, user }) => {
    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid series id");
    }

    await requireOwnedSeries(
      params.id,
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

    const post = await requireDocument(postId, user, "own", {
      subtitle: "You can only remove your own posts from a series",
    });
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
  { signInMessage: "Please sign in to remove posts from series" },
);
