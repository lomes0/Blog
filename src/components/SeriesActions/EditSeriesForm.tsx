"use client";
import React, { useState } from "react";
import { 
  Box, 
  TextField, 
  Button, 
  Typography, 
  Alert,
  CircularProgress 
} from "@mui/material";
import { useRouter } from "next/navigation";
import { Series } from "@/types";

interface EditSeriesFormProps {
  series: Series;
  onCancel?: () => void;
}

export default function EditSeriesForm({ series, onCancel }: EditSeriesFormProps) {
  const [title, setTitle] = useState(series.title);
  const [description, setDescription] = useState(series.description || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/series/${series.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.title || "Failed to update series");
      }

      router.push(`/series/${series.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
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
    if (!confirm("Are you sure you want to delete this series? This action cannot be undone.")) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/series/${series.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.title || "Failed to delete series");
      }

      router.push("/series");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoading(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 600 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Edit Series
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
        sx={{ mb: 4 }}
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
