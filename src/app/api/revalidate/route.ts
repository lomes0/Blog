import { ApiError, parseBody, userRoute } from "@/lib/api-utils";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

const revalidateSchema = z.object({
  path: z.string().optional(),
  tag: z.string().optional(),
}).strict();

export const POST = userRoute(async (request, { user }) => {
  if (user.role !== "admin") {
    throw new ApiError(
      403,
      "Unauthorized",
      "You are not authorized to revalidate cache",
    );
  }

  const { path, tag } = await parseBody(request, revalidateSchema);

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
