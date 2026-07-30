import { userRoute } from "@/lib/api-utils";
import { requireOwnedNote } from "@/lib/access";
import { deleteNote, updateNote } from "@/repositories/notes";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MODIFY_DENIED = "You don't have permission to modify this note";

// PATCH /api/notes/[id] - Update note
export const PATCH = userRoute<{ id: string }>(
  async (request, { params, user }) => {
    await requireOwnedNote(params.id, user, MODIFY_DENIED);

    const body = await request.json();
    const {
      positionX,
      positionY,
      width,
      height,
      title,
      content,
      color,
      zIndex,
    } = body;

    const updates: Record<string, number | string | undefined> = {};
    if (typeof positionX === "number") updates.positionX = positionX;
    if (typeof positionY === "number") updates.positionY = positionY;
    if (typeof width === "number") updates.width = width;
    if (typeof height === "number") updates.height = height;
    if (title !== undefined) updates.title = title;
    if (typeof content === "string") updates.content = content;
    if (typeof color === "string") updates.color = color;
    if (typeof zIndex === "number") updates.zIndex = zIndex;

    const updatedNote = await updateNote(params.id, updates);
    return NextResponse.json({ data: updatedNote });
  },
  {
    errorLabel: "Error updating note",
    signInMessage: "Please sign in to update a note",
  },
);

// DELETE /api/notes/[id] - Delete note
export const DELETE = userRoute<{ id: string }>(
  async (_request, { params, user }) => {
    await requireOwnedNote(params.id, user, MODIFY_DENIED);

    await deleteNote(params.id);
    return NextResponse.json({ data: { success: true } });
  },
  {
    errorLabel: "Error deleting note",
    signInMessage: "Please sign in to delete a note",
  },
);
