import { ApiError, userRoute } from "@/lib/api-utils";
import { revalidatePath, revalidateTag } from "next/cache";

export const POST = userRoute(async (request, { user }) => {
  if (user.role !== "admin") {
    throw new ApiError(
      403,
      "Unauthorized",
      "You are not authorized to revalidate cache",
    );
  }

  const body = await request.json();
  const { path, tag } = body;

  if (path) {
    revalidatePath(path);
    return Response.json({ revalidated: path, now: Date.now() });
  }

  if (tag) {
    revalidateTag(tag);
    return Response.json({ revalidated: tag, now: Date.now() });
  }

  return Response.json({
    revalidated: false,
    now: Date.now(),
    message: "Missing path or tag to revalidate",
  });
}, { signInMessage: "Please sign in to revalidate cache" });
