import { ApiError, optionalUserRoute, userRoute } from "@/lib/api-utils";
import { createProject, findProjectsByAuthorId } from "@/repositories/project";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

interface ProjectCreateInput {
  title: string;
  description?: string;
}

// Projects are an authoring/organization concept, not public content, so
// unauthenticated callers get an empty list rather than every user's projects.
export const GET = optionalUserRoute(async (_request, { user }) => {
  if (!user) return NextResponse.json({ data: [] });

  const projects = await findProjectsByAuthorId(user.id);
  return NextResponse.json({ data: projects });
});

export const POST = userRoute(async (request, { user }) => {
  const body = (await request.json()) as ProjectCreateInput;
  if (!body || !body.title) {
    throw new ApiError(400, "Bad Request", "Project title is required");
  }

  const data = await createProject({
    id: uuidv4(),
    title: body.title,
    description: body.description,
    authorId: user.id,
  });

  revalidatePath("/posts");
  revalidatePath("/");

  return NextResponse.json({ data });
}, { signInMessage: "Please sign in to create a project" });
