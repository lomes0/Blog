import { parseBody, userRoute } from "@/lib/api-utils";
import {
  createCanvas,
  findCanvasByAuthorId,
  getOrCreateDefaultCanvas,
} from "@/repositories/notes";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createCanvasSchema = z.object({
  name: z.string().default("My Notes"),
}).strict();

// GET /api/notes/canvas - Get all canvases for the user (auto-creates Default if none exist)
export const GET = userRoute(async (_request, { user }) => {
  // Ensure at least one canvas exists
  await getOrCreateDefaultCanvas(user.id);
  const canvases = await findCanvasByAuthorId(user.id);
  const summaries = canvases.map(({ id, name, createdAt, updatedAt }) => ({
    id,
    name,
    createdAt,
    updatedAt,
  }));
  return NextResponse.json({ data: summaries });
}, {
  errorLabel: "Error fetching canvases",
  signInMessage: "Please sign in to access notes",
});

// POST /api/notes/canvas - Create new canvas
export const POST = userRoute(async (request, { user }) => {
  const { name } = await parseBody(request, createCanvasSchema);

  const canvas = await createCanvas(user.id, name);
  return NextResponse.json({ data: canvas }, { status: 201 });
}, {
  errorLabel: "Error creating canvas",
  signInMessage: "Please sign in to create a canvas",
});
