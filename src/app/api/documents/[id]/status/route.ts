import { ApiError, parseBody, publicRoute, userRoute } from "@/lib/api-utils";
import { requireDocument } from "@/lib/access";
import { updateDocument } from "@/repositories/document";
import { DocumentStatus } from "@/types";
import { NextResponse } from "next/server";
import { z } from "zod";

const statusSchema = z.object({
  status: z.nativeEnum(DocumentStatus),
}).strict();

export const dynamic = "force-dynamic";

export const GET = publicRoute<{ id: string }>(
  async (_request, { params }) => {
    return NextResponse.json({
      message: "Status endpoint reached",
      id: params.id,
    });
  },
);

export const PATCH = userRoute<{ id: string }>(
  async (request, { params, user }) => {
    await requireDocument(params.id, user, "write", {
      subtitle: "You are not authorized to edit this document",
    });

    const { status } = await parseBody(request, statusSchema);

    const updatedPost = await updateDocument(params.id, {
      status,
    });

    if (!updatedPost) {
      throw new ApiError(
        500,
        "Internal Server Error",
        "Failed to update document",
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: updatedPost.id,
        status: updatedPost.status,
      },
    });
  },
);
