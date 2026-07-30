import { Alert, User } from "@/types";
import { apiClient } from "@/api";
import { createApiThunk, fail } from "./createApiThunk";

export const updateUser = createApiThunk(
  "app/updateUser",
  async (arg: { id: string; partial: Partial<User> }) => {
    const { id, partial } = arg;
    const data = await apiClient.users.update(id, partial);
    if (!data) fail("failed to update user");
    const payload: User = data;
    return payload;
  },
);

export const alert = createApiThunk("app/alert", async (_arg: Alert) => {
  return await new Promise((resolve) => {
    const handler = (event: MouseEvent): void => {
      const target = event.target as HTMLElement;
      const button = target.closest("button");
      const paper = target.closest(".MuiDialog-paper");
      if (paper && !button) {
        return document.addEventListener("click", handler, { once: true });
      }
      resolve(button?.id ?? null);
    };
    setTimeout(() => {
      document.addEventListener("click", handler, { once: true });
    }, 0);
  });
});
