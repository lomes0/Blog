import { authOptions } from "@/lib/auth";
import { ApiError, withApiHandler } from "@/lib/api-utils";
import {
  deleteProject,
  findProjectById,
  updateProject,
} from "@/repositories/project";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

interface ProjectUpdateInput {
  title?: string;
  description?: string;
  createdAt?: string;
}

export const GET = withApiHandler(
  async (request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const project = await findProjectById(params.id);
    if (!project) {
      throw new ApiError(404, "Project not found");
    }

    return NextResponse.json({ data: project });
  },
);

export const PATCH = withApiHandler(
  async (request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const session = await getServerSession(authOptions);
    if (!session) {
      throw new ApiError(
        401,
        "Unauthorized",
        "Please sign in to update the project",
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

    const project = await findProjectById(params.id);
    if (!project) {
      throw new ApiError(404, "Project not found");
    }

    if (user.id !== project.authorId) {
      throw new ApiError(
        403,
        "Unauthorized",
        "You are not authorized to update this project",
      );
    }

    const body = (await request.json()) as ProjectUpdateInput;
    if (!body) {
      throw new ApiError(400, "Bad Request", "No project data provided");
    }

    const data = await updateProject(params.id, body);

    revalidatePath("/posts");
    revalidatePath("/");

    return NextResponse.json({ data });
  },
);

export const DELETE = withApiHandler(
  async (request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const session = await getServerSession(authOptions);
    if (!session) {
      throw new ApiError(
        401,
        "Unauthorized",
        "Please sign in to delete the project",
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

    const project = await findProjectById(params.id);
    if (!project) {
      throw new ApiError(404, "Project not found");
    }

    if (user.id !== project.authorId) {
      throw new ApiError(
        403,
        "Unauthorized",
        "You are not authorized to delete this project",
      );
    }

    await deleteProject(params.id);

    revalidatePath("/posts");
    revalidatePath("/");

    return NextResponse.json({ data: params.id });
  },
);
