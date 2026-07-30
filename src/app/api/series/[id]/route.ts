import { ApiError, optionalUserRoute, userRoute } from "@/lib/api-utils";
import { requireOwnedSeries } from "@/lib/access";
import {
  deleteSeries,
  findPublicSeriesById,
  findSeriesById,
  updateSeries,
} from "@/repositories/series";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

interface SeriesUpdateInput {
  title?: string;
  description?: string;
  createdAt?: string;
}

export const GET = optionalUserRoute<{ id: string }>(
  async (_request, { params, user }) => {
    // The author sees their series whole; everyone else sees only what is
    // published. This route previously returned the unfiltered record to
    // anonymous callers, exposing every member post's metadata and `head`.
    const series = await findSeriesById(params.id);
    if (series && user && series.authorId === user.id) {
      return NextResponse.json({ data: series });
    }

    const publicSeries = await findPublicSeriesById(params.id);
    if (!publicSeries) {
      throw new ApiError(404, "Series not found");
    }
    return NextResponse.json({ data: publicSeries });
  },
);

export const PATCH = userRoute<{ id: string }>(
  async (request, { params, user }) => {
    await requireOwnedSeries(
      params.id,
      user,
      "You are not authorized to update this series",
    );

    const body = (await request.json()) as SeriesUpdateInput;
    if (!body) {
      throw new ApiError(400, "Bad Request", "No series data provided");
    }

    const data = await updateSeries(params.id, body);

    // Revalidate all relevant paths
    revalidatePath("/series");
    revalidatePath(`/series/${params.id}`);
    revalidatePath("/posts");
    revalidatePath(`/posts/${params.id}`);
    revalidatePath("/");

    return NextResponse.json({ data });
  },
  { signInMessage: "Please sign in to update the series" },
);

export const DELETE = userRoute<{ id: string }>(
  async (_request, { params, user }) => {
    await requireOwnedSeries(
      params.id,
      user,
      "You are not authorized to delete this series",
    );

    await deleteSeries(params.id);

    // Revalidate all relevant paths
    revalidatePath("/series");
    revalidatePath(`/series/${params.id}`);
    revalidatePath("/posts");
    revalidatePath(`/posts/${params.id}`);
    revalidatePath("/");

    return NextResponse.json({ data: params.id });
  },
  { signInMessage: "Please sign in to delete the series" },
);
