import { optionalUserRoute } from "@/lib/api-utils";
import { findCloudStorageUsageByAuthorId } from "@/repositories/document";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Anonymous callers get an empty list rather than a 401: guest drafts live in
// IndexedDB, so "no cloud usage" is the correct answer, not an error.
export const GET = optionalUserRoute(async (_request, { user }) => {
  if (!user) return NextResponse.json({ data: [] });
  const cloudStorageUsage = await findCloudStorageUsageByAuthorId(user.id);
  return NextResponse.json({ data: cloudStorageUsage });
});
