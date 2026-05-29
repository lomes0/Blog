import { createAsyncThunk } from "@reduxjs/toolkit";
import { Alert, User } from "@/types";
import { apiClient } from "@/api";

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";

export const updateUser = createAsyncThunk(
  "app/updateUser",
  async (
    arg: { id: string; partial: Partial<User> },
    thunkAPI,
  ) => {
    try {
      const { id, partial } = arg;
      const data = await apiClient.users.update(id, partial);
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "failed to update user",
        });
      }
      const payload: User = data;
      return thunkAPI.fulfillWithValue(payload);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const alert = createAsyncThunk(
  "app/alert",
  async (arg: Alert, thunkAPI) => {
    try {
      const id = await new Promise((resolve) => {
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
      return thunkAPI.fulfillWithValue(id);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);
