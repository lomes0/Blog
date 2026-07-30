import { userRoute } from "@/lib/api-utils";
import {
  createCanvas,
  findCanvasByAuthorId,
  getOrCreateDefaultCanvas,
} from "@/repositories/notes";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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
  const body = await request.json();
  const { name = "My Notes" } = body;

  const canvas = await createCanvas(user.id, name);
  return NextResponse.json({ data: canvas }, { status: 201 });
}, {
  errorLabel: "Error creating canvas",
  signInMessage: "Please sign in to create a canvas",
});
