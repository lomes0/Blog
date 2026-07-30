import { parseBody, userRoute } from "@/lib/api-utils";
import { requireCanvas } from "@/lib/access";
import {
  createNote,
  findNotesByCanvasId,
  getOrCreateDefaultCanvas,
} from "@/repositories/notes";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

// `canvasId` is optional: without one the note goes to the caller's default
// canvas. With one, the route proves they own it first.
const createNoteSchema = z.object({
  positionX: z.number(),
  positionY: z.number(),
  width: z.number(),
  height: z.number(),
  content: z.string(),
  title: z.string().optional(),
  color: z.string().optional(),
  zIndex: z.number().int().optional(),
  canvasId: z.string().uuid().optional(),
}).strict();

// GET /api/notes - Get all notes for user's default canvas
export const GET = userRoute(async (_request, { user }) => {
  const canvas = await getOrCreateDefaultCanvas(user.id);
  const notes = await findNotesByCanvasId(canvas.id);
  return NextResponse.json({ data: notes });
}, {
  errorLabel: "Error fetching notes",
  signInMessage: "Please sign in to access notes",
});

// POST /api/notes - Create new note
export const POST = userRoute(async (request, { user }) => {
  const {
    positionX,
    positionY,
    width,
    height,
    title,
    content,
    color,
    zIndex,
    canvasId,
  } = await parseBody(request, createNoteSchema);

  // Resolve the target canvas
  let targetCanvasId: string;
  if (canvasId) {
    await requireCanvas(
      canvasId,
      user,
      "You don't have permission to add notes to this canvas",
    );
    targetCanvasId = canvasId;
  } else {
    // Fall back to the user's default canvas
    const canvas = await getOrCreateDefaultCanvas(user.id);
    targetCanvasId = canvas.id;
  }

  const note = await createNote({
    canvasId: targetCanvasId,
    positionX,
    positionY,
    width,
    height,
    title,
    content,
    color,
    zIndex,
  });

  return NextResponse.json({ data: note }, { status: 201 });
}, {
  errorLabel: "Error creating note",
  signInMessage: "Please sign in to create a note",
});
