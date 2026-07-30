import { ApiError, optionalUserRoute, userRoute } from "@/lib/api-utils";
import {
  createSeries,
  findAllSeries,
  findSeriesByAuthorId,
} from "@/repositories/series";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

interface SeriesCreateInput {
  title: string;
  description?: string;
}

export const GET = optionalUserRoute(async (_request, { user }) => {
  if (!user) {
    // Anonymous callers get the public listing: published, non-private posts
    // only, no author emails. `findAllSeries` used to be unfiltered, so this
    // branch served every author's drafts along with each draft's `head`
    // revision id — which `GET /api/revisions/[id]` would then dereference.
    const allSeries = await findAllSeries();
    return NextResponse.json({ data: allSeries });
  }

  // Return user's series
  const userSeries = await findSeriesByAuthorId(user.id);
  return NextResponse.json({ data: userSeries });
});

export const POST = userRoute(async (request, { user }) => {
  const body = (await request.json()) as SeriesCreateInput;
  if (!body || !body.title) {
    throw new ApiError(400, "Bad Request", "Series title is required");
  }

  const seriesData = {
    id: uuidv4(),
    title: body.title,
    description: body.description,
    authorId: user.id,
  };

  const data = await createSeries(seriesData);

  // Revalidate series list page
  revalidatePath("/series");
  revalidatePath("/");

  return NextResponse.json({ data });
}, { signInMessage: "Please sign in to create a series" });
