import { parseBody, userRoute } from "@/lib/api-utils";
import { requireOwnedNote } from "@/lib/access";
import { deleteNote, updateNote } from "@/repositories/notes";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const MODIFY_DENIED = "You don't have permission to modify this note";

// `canvasId` is absent on purpose: moving a note between canvases would need the
// destination authorized, which this route does not do — it proves ownership of
// the note's *current* canvas. `updateNote` spreads what it is given straight
// into Prisma, so the schema is the allowlist.
const updateNoteSchema = z.object({
  positionX: z.number(),
  positionY: z.number(),
  width: z.number(),
  height: z.number(),
  title: z.string(),
  content: z.string(),
  color: z.string(),
  zIndex: z.number().int(),
}).partial().strict();

// PATCH /api/notes/[id] - Update note
export const PATCH = userRoute<{ id: string }>(
  async (request, { params, user }) => {
    await requireOwnedNote(params.id, user, MODIFY_DENIED);

    const updates = await parseBody(request, updateNoteSchema);

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
