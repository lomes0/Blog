"use client";
import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  TextField,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { Series } from "@/types";
import { actions, useDispatch } from "@/store";
import { seriesCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";

interface EditSeriesFormProps {
  series: Series;
  onCancel?: () => void;
}

export default function EditSeriesForm(
  { series, onCancel }: EditSeriesFormProps,
) {
  const [title, setTitle] = useState(series.title);
  const [description, setDescription] = useState(series.description || "");
  const [createdAt, setCreatedAt] = useState(() => {
    const date = typeof series.createdAt === "string"
      ? new Date(series.createdAt)
      : series.createdAt;
    // Format to datetime-local format (YYYY-MM-DDTHH:MM)
    return date.toISOString().slice(0, 16);
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const run = useCommandRun();
  const dispatch = useDispatch();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await dispatch(actions.updateSeries({
        id: series.id,
        data: {
          title: title.trim(),
          description: description.trim() || undefined,
          createdAt: new Date(createdAt).toISOString(),
        },
      })).unwrap();

      run(seriesCommands.open, { id: series.id });
    } catch (err) {
      // The thunk announced the failure globally; this is the inline copy.
      setError(err instanceof Error ? err.message : "Failed to update series");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.back();
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        "Are you sure you want to delete this series? This action cannot be undone.",
      )
    ) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await dispatch(actions.deleteSeries(series.id)).unwrap();

      // Left as a raw push: `/series` is a listing that does not exist (only
      // `/series/[id]`, itself a 308 to `/posts/[id]`), so this is a broken
      // destination rather than a command. Where a deleted series sends you is
      // a behaviour question, and Phase 1 changes no behaviour — see
      // docs/plans/workspace-panes.md §7.
      router.push("/series");
    } catch (err) {
      // The thunk announced the failure globally; this is the inline copy.
      setError(err instanceof Error ? err.message : "Failed to delete series");
      setLoading(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 600 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Edit
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <TextField
        fullWidth
        label="Series Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Enter series title..."
        required
        disabled={loading}
        sx={{ mb: 3 }}
      />

      <TextField
        fullWidth
        label="Description (Optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Describe what this series is about..."
        multiline
        rows={4}
        disabled={loading}
        sx={{ mb: 3 }}
      />

      <TextField
        fullWidth
        label="Creation Date"
        type="datetime-local"
        value={createdAt}
        onChange={(e) => setCreatedAt(e.target.value)}
        disabled={loading}
        sx={{ mb: 4 }}
        InputLabelProps={{
          shrink: true,
        }}
      />

      <Box sx={{ display: "flex", gap: 2, justifyContent: "space-between" }}>
        <Button
          variant="outlined"
          color="error"
          onClick={handleDelete}
          disabled={loading}
        >
          Delete Series
        </Button>

        <Box sx={{ display: "flex", gap: 2 }}>
          <Button
            variant="outlined"
            onClick={handleCancel}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading || !title.trim()}
            startIcon={loading ? <CircularProgress size={20} /> : null}
          >
            {loading ? "Updating..." : "Update Series"}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
