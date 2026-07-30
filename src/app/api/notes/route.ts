import { ApiError, userRoute } from "@/lib/api-utils";
import { requireCanvas } from "@/lib/access";
import {
  createNote,
  findNotesByCanvasId,
  getOrCreateDefaultCanvas,
} from "@/repositories/notes";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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
    canvasId,
  } = body;

  // Validate required fields
  if (
    typeof positionX !== "number" ||
    typeof positionY !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    typeof content !== "string"
  ) {
    throw new ApiError(
      400,
      "Invalid Input",
      "Missing or invalid required fields",
    );
  }

  // Resolve the target canvas
  let targetCanvasId: string;
  if (canvasId && typeof canvasId === "string") {
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
