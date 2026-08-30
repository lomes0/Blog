import { parseBody, userRoute } from "@/lib/api-utils";
import { requireOwnedProject } from "@/lib/access";
import { deleteProject, updateProject } from "@/repositories/project";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export const dynamic = "force-dynamic";

// `authorId` is absent, and so is any position: ownership is fixed, and a
// project's place in the author's root list lives in `User.rootOrder`, written
// by PATCH /api/users/me/root-order (docs/plans/ordering-simplification.md §4).
const projectUpdateSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  createdAt: z
    .string()
    .refine(
      (value) => !Number.isNaN(Date.parse(value)),
      "must be a valid date",
    ),
}).partial().strict();

// Projects are an authoring/organization concept, not public content — the same
// reasoning the list route at `/api/projects` already applied to anonymous
// callers. This one served any project to anyone who knew its id.
export const GET = userRoute<{ id: string }>(
  async (_request, { params, user }) => {
    const project = await requireOwnedProject(
      params.id,
      user,
      "You are not authorized to view this project",
    );

    return NextResponse.json({ data: project });
  },
);

export const PATCH = userRoute<{ id: string }>(
  async (request, { params, user }) => {
    await requireOwnedProject(
      params.id,
      user,
      "You are not authorized to update this project",
    );

    const body = await parseBody(request, projectUpdateSchema);

    const data = await updateProject(params.id, body);

    revalidatePath("/posts");
    revalidatePath("/");

    return NextResponse.json({ data });
  },
  { signInMessage: "Please sign in to update the project" },
);

export const DELETE = userRoute<{ id: string }>(
  async (_request, { params, user }) => {
    await requireOwnedProject(
      params.id,
      user,
      "You are not authorized to delete this project",
    );

    await deleteProject(params.id);

    revalidatePath("/posts");
    revalidatePath("/");

    return NextResponse.json({ data: params.id });
  },
  { signInMessage: "Please sign in to delete the project" },
);
