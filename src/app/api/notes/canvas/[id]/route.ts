import { parseBody, userRoute } from "@/lib/api-utils";
import { requireCanvas } from "@/lib/access";
import { deleteCanvas, updateCanvas } from "@/repositories/notes";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

// `updateCanvas` passes its `data` argument straight to Prisma, so this schema is
// the list of columns a rename may touch.
const updateCanvasSchema = z.object({ name: z.string() }).strict();

// GET /api/notes/canvas/[id] - Get a single canvas with its notes
export const GET = userRoute<{ id: string }>(
  async (_request, { params, user }) => {
    const canvas = await requireCanvas(
      params.id,
      user,
      "You don't have permission to access this canvas",
    );
    return NextResponse.json({ data: canvas });
  },
  {
    errorLabel: "Error fetching canvas",
    signInMessage: "Please sign in to access notes",
  },
);

// PATCH /api/notes/canvas/[id] - Update canvas name
export const PATCH = userRoute<{ id: string }>(
  async (request, { params, user }) => {
    await requireCanvas(
      params.id,
      user,
      "You don't have permission to update this canvas",
    );

    const { name } = await parseBody(request, updateCanvasSchema);

    const updatedCanvas = await updateCanvas(params.id, { name });
    return NextResponse.json({ data: updatedCanvas });
  },
  {
    errorLabel: "Error updating canvas",
    signInMessage: "Please sign in to update a canvas",
  },
);

// DELETE /api/notes/canvas/[id] - Delete canvas
export const DELETE = userRoute<{ id: string }>(
  async (_request, { params, user }) => {
    await requireCanvas(
      params.id,
      user,
      "You don't have permission to delete this canvas",
    );

    await deleteCanvas(params.id);
    return NextResponse.json({ data: { success: true } });
  },
  {
    errorLabel: "Error deleting canvas",
    signInMessage: "Please sign in to delete a canvas",
  },
);
