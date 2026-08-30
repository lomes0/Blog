import {
  ApiError,
  optionalUserRoute,
  parseBody,
  userRoute,
} from "@/lib/api-utils";
import { requireOwnedSeries } from "@/lib/access";
import {
  deleteSeries,
  findPublicSeriesById,
  findSeriesById,
  updateSeries,
} from "@/repositories/series";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export const dynamic = "force-dynamic";

// `projectId` is absent, and so is any position: a series' container is set by
// PATCH /api/series/[id]/move, which authorizes the destination project and
// appends the series to it, and its place within that container is the
// container's own order array (docs/plans/ordering-simplification.md §4).
const seriesUpdateSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  createdAt: z
    .string()
    .refine(
      (value) => !Number.isNaN(Date.parse(value)),
      "must be a valid date",
    ),
}).partial().strict();

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

    const body = await parseBody(request, seriesUpdateSchema);

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
