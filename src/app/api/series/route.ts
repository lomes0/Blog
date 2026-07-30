import { optionalUserRoute, parseBody, userRoute } from "@/lib/api-utils";
import { requireOwnedProject } from "@/lib/access";
import {
  createSeries,
  findAllSeries,
  findSeriesByAuthorId,
} from "@/repositories/series";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

export const dynamic = "force-dynamic";

// `authorId` and `id` are not accepted: the session supplies the author, the
// server mints the id. `projectId` *is* accepted — a project is a series' only
// container, so creating one inside a project needs no `/move` to disambiguate
// — but it is a destination the caller named, so the handler proves ownership
// of it before writing.
const seriesCreateSchema = z.object({
  title: z.string().min(1, "Series title is required"),
  description: z.string().optional(),
  projectId: z.string().uuid().nullish(),
}).strict();

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
  const body = await parseBody(request, seriesCreateSchema);

  // Naming someone else's project must not file a series into it.
  if (body.projectId) {
    await requireOwnedProject(
      body.projectId,
      user,
      "You can only add a series to your own project",
    );
  }

  const seriesData = {
    id: uuidv4(),
    title: body.title,
    description: body.description,
    authorId: user.id,
    projectId: body.projectId ?? null,
  };

  const data = await createSeries(seriesData);

  // Revalidate series list page
  revalidatePath("/series");
  revalidatePath("/");

  return NextResponse.json({ data });
}, { signInMessage: "Please sign in to create a series" });
