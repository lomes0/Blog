import { authOptions } from "@/lib/auth";
import { ApiError, withApiHandler } from "@/lib/api-utils";
import { findProjectById } from "@/repositories/project";
import { moveProjectTx } from "@/repositories/ordering";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { validate } from "uuid";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Neighbour ranks to drop the project between in the root list; omit to append.
const moveSchema = z.object({
  between: z
    .object({
      afterRank: z.string().nullish(),
      beforeRank: z.string().nullish(),
    })
    .optional(),
});

// PATCH /api/projects/[id]/move → reorder a project within the root list
export const PATCH = withApiHandler(
  async (request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid id");
    }

    const session = await getServerSession(authOptions);
    if (!session) {
      throw new ApiError(401, "Unauthorized", "Please sign in to reorder");
    }
    const { user } = session;
    if (user.disabled) {
      throw new ApiError(
        403,
        "Account Disabled",
        "Account is disabled for violating terms of service",
      );
    }

    const project = await findProjectById(params.id);
    if (!project) {
      throw new ApiError(404, "Project not found");
    }
    if (project.authorId !== user.id) {
      throw new ApiError(
        403,
        "Unauthorized",
        "You can only reorder your own projects",
      );
    }

    const parsed = moveSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiError(
        400,
        "Bad Request",
        parsed.error.issues[0]?.message ?? "Invalid request body",
      );
    }

    await moveProjectTx({ id: params.id, between: parsed.data.between });

    revalidatePath("/");
    revalidatePath("/posts");

    const updated = await findProjectById(params.id);
    return NextResponse.json({ data: updated });
  },
);
