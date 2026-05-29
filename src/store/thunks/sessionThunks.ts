import { createAsyncThunk } from "@reduxjs/toolkit";
import { apiClient } from "@/api";

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";

export const loadSession = createAsyncThunk(
  "app/loadSession",
  async (_, thunkAPI) => {
    try {
      const data = await apiClient.auth.getSession();
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "session not found",
        });
      }
      if (!data.user) return thunkAPI.fulfillWithValue(undefined);
      const user = {
        id: data.user.id,
        handle: data.user.handle,
        name: data.user.name,
        email: data.user.email,
        image: data.user.image,
      };
      return thunkAPI.fulfillWithValue(user);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);
