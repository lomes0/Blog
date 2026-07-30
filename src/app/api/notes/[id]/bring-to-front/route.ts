import { userRoute } from "@/lib/api-utils";
import { requireOwnedNote } from "@/lib/access";
import { bringNoteToFront } from "@/repositories/notes";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/notes/[id]/bring-to-front - Update z-index to bring note to front
export const POST = userRoute<{ id: string }>(
  async (_request, { params, user }) => {
    const note = await requireOwnedNote(
      params.id,
      user,
      "You don't have permission to reorder this note",
    );

    const updatedNote = await bringNoteToFront(params.id, note.canvasId);
    return NextResponse.json({ data: updatedNote });
  },
  {
    errorLabel: "Error bringing note to front",
    signInMessage: "Please sign in to reorder notes",
  },
);
