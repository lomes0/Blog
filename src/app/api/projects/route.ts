import { ApiError, withApiHandler } from "@/lib/api-utils";
import { authOptions } from "@/lib/auth";
import { createProject, findProjectsByAuthorId } from "@/repositories/project";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

interface ProjectCreateInput {
  title: string;
  description?: string;
}

export const GET = withApiHandler(async () => {
  const session = await getServerSession(authOptions);
  // Projects are an authoring/organization concept, not public content, so
  // unauthenticated callers get an empty list rather than every user's projects.
  if (!session) {
    return NextResponse.json({ data: [] });
  }

  const { user } = session;
  if (user.disabled) {
    throw new ApiError(
      403,
      "Account Disabled",
      "Account is disabled for violating terms of service",
    );
  }

  const projects = await findProjectsByAuthorId(user.id);
  return NextResponse.json({ data: projects });
});

export const POST = withApiHandler(async (request) => {
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new ApiError(
      401,
      "Unauthorized",
      "Please sign in to create a project",
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
});
