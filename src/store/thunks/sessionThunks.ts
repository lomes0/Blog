import { apiClient } from "@/api";
import { createApiThunk, fail } from "./createApiThunk";

export const loadSession = createApiThunk("app/loadSession", async () => {
  const data = await apiClient.auth.getSession();
  if (!data) fail("session not found");
  if (!data.user) return undefined;
  return {
    id: data.user.id,
    handle: data.user.handle,
    name: data.user.name,
    email: data.user.email,
    image: data.user.image,
    // The author's root list order
    // (docs/plans/archive/ordering-simplification.md §2). Carried on the
    // session because that is where the `User` row already arrives — the
    // alternative was a route whose only job was to serve one column.
    rootOrder: data.user.rootOrder,
  };
});
