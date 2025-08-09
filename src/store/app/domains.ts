import { createAsyncThunk } from "@reduxjs/toolkit";
import { Domain } from "@/types";

export const fetchUserDomains = createAsyncThunk(
  "app/fetchUserDomains",
  async (_, thunkAPI) => {
    try {
      const response = await fetch("/api/domains");

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Failed to fetch domains:", errorData);
        return thunkAPI.rejectWithValue({
          title: "Failed to fetch domains",
          subtitle: errorData.message || "Unknown error",
        });
      }

      const domains = await response.json() as Domain[];
      return thunkAPI.fulfillWithValue(domains);
    } catch (error: any) {
      console.error("Error fetching domains:", error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: error.message,
      });
    }
  },
);

export const deleteDomain = createAsyncThunk(
  "app/deleteDomain",
  async (domainId: string, thunkAPI) => {
    try {
      const response = await fetch(`/api/domains/${domainId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Failed to delete domain:", errorData);
        return thunkAPI.rejectWithValue({
          title: "Failed to delete domain",
          subtitle: errorData.message || "Unknown error",
        });
      }

      // Return the deleted domain ID for the reducer to remove it from state
      return thunkAPI.fulfillWithValue(domainId);
    } catch (error: any) {
      console.error("Error deleting domain:", error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: error.message,
      });
    }
  },
);

export const reorderDomains = createAsyncThunk(
  "app/reorderDomains",
  async (domainOrders: { id: string; order: number }[], thunkAPI) => {
    try {
      const response = await fetch("/api/domains/reorder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ domainOrders }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Failed to reorder domains:", errorData);
        return thunkAPI.rejectWithValue({
          title: "Failed to reorder domains",
          subtitle: errorData.message || "Unknown error",
        });
      }

      // Return the new order for the reducer to update domain positions
      return thunkAPI.fulfillWithValue(domainOrders);
    } catch (error: any) {
      console.error("Error reordering domains:", error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: error.message,
      });
    }
  },
);
