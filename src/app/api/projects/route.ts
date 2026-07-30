import { optionalUserRoute, parseBody, userRoute } from "@/lib/api-utils";
import { createProject, findProjectsByAuthorId } from "@/repositories/project";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

export const dynamic = "force-dynamic";

// `authorId` and `id` are not accepted: the session supplies the author, the
// server mints the id.
const projectCreateSchema = z.object({
  title: z.string().min(1, "Project title is required"),
  description: z.string().optional(),
}).strict();

// Projects are an authoring/organization concept, not public content, so
// unauthenticated callers get an empty list rather than every user's projects.
export const GET = optionalUserRoute(async (_request, { user }) => {
  if (!user) return NextResponse.json({ data: [] });

  const projects = await findProjectsByAuthorId(user.id);
  return NextResponse.json({ data: projects });
});

export const POST = userRoute(async (request, { user }) => {
  const body = await parseBody(request, projectCreateSchema);

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
