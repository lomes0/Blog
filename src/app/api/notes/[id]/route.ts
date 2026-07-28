import {
  ApiError,
  requireOwner,
  requireUser,
  type SessionUser,
  withApiHandler,
} from "@/lib/api-utils";
import {
  deleteNote,
  findCanvasById,
  findNoteById,
  updateNote,
} from "@/repositories/notes";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * A note belongs to a canvas, and the canvas is what carries the owner — so
 * finding the note proves nothing about who may touch it. Both handlers here
 * authenticated and then acted on whatever id was passed, which let any signed-in
 * user edit or delete anyone else's notes. The sibling `bring-to-front` route
 * always resolved the canvas first; these now do the same.
 */
async function requireOwnedNote(noteId: string, user: SessionUser) {
  const note = await findNoteById(noteId);
  if (!note) {
    throw new ApiError(404, "Not Found", "Note not found");
  }
  const canvas = await findCanvasById(note.canvasId);
  requireOwner(
    canvas?.authorId,
    user,
    "You don't have permission to modify this note",
  );
  return note;
}

// PATCH /api/notes/[id] - Update note
export const PATCH = withApiHandler(async (request, { params }) => {
  const user = await requireUser("Please sign in to update a note");

  const { id } = await params;
  const noteId = id;
  await requireOwnedNote(noteId, user);

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

  const updatedNote = await updateNote(noteId, updates);
  return NextResponse.json({ data: updatedNote });
}, { context: "Error updating note" });

// DELETE /api/notes/[id] - Delete note
export const DELETE = withApiHandler(async (_request, { params }) => {
  const user = await requireUser("Please sign in to delete a note");

  const { id } = await params;
  const noteId = id;
  await requireOwnedNote(noteId, user);

  await deleteNote(noteId);
  return NextResponse.json({ data: { success: true } });
}, { context: "Error deleting note" });
