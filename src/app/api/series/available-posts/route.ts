import { userRoute } from "@/lib/api-utils";
import { getAvailablePostsForSeries } from "@/repositories/series";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/series/available-posts → get user's posts not in any series
export const GET = userRoute(async (_request, { user }) => {
  const posts = await getAvailablePostsForSeries(user.id);
  return NextResponse.json({ data: posts });
}, { signInMessage: "Please sign in to view available posts" });
