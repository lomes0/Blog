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

interface NewSeriesFormProps {
  onCancel?: () => void;
}

export default function NewSeriesForm({ onCancel }: NewSeriesFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
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
      const response = await fetch("/api/series", {
        method: "POST",
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
        throw new Error(errorData.error?.title || "Failed to create series");
      }

      const { data: series } = await response.json();
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

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 600 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Create New Series
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

      <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
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
          {loading ? "Creating..." : "Create Series"}
        </Button>
      </Box>
    </Box>
  );
}
