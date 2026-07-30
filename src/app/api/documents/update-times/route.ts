import { ApiError, userRoute } from "@/lib/api-utils";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface TimeUpdate {
  id: string;
  createdAt: Date | string;
}

interface UpdateTimesRequest {
  updates: TimeUpdate[];
}

/**
 * POST /api/documents/update-times
 * Update creation times for multiple documents
 * Only the author can update their documents' times
 */
export const POST = userRoute(async (request, { user }) => {
  const body: UpdateTimesRequest = await request.json();
  const { updates } = body;

  if (!updates || !Array.isArray(updates) || updates.length === 0) {
    throw new ApiError(400, "Invalid request", "No updates provided");
  }

  const userId = user.id;

  // Verify all documents belong to the current user and update them
  const results = await Promise.all(
    updates.map(async (update) => {
      const doc = await prisma.document.findUnique({
        where: { id: update.id },
        select: { id: true, authorId: true },
      });

      if (!doc) {
        return { id: update.id, success: false, error: "Document not found" };
      }

      if (doc.authorId !== userId) {
        return { id: update.id, success: false, error: "Not authorized" };
      }

      // Update the creation time
      await prisma.document.update({
        where: { id: update.id },
        data: {
          createdAt: new Date(update.createdAt),
        },
      });

      return { id: update.id, success: true };
    }),
  );

  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    return NextResponse.json(
      {
        success: false,
        message: `${failed.length} update(s) failed`,
        results,
      },
      { status: 207 }, // Multi-Status
    );
  }

  return NextResponse.json({
    success: true,
    message: `Updated ${updates.length} document(s)`,
    results,
  });
}, {
  errorLabel: "Failed to update document times",
  signInMessage: "Please sign in to update documents",
});
