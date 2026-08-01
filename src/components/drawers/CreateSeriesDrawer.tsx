"use client";
import * as React from "react";
import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Drawer,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { actions, useDispatch } from "@/store";
import { seriesCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";

interface CreateSeriesDrawerProps {
  /** Whether the drawer is open */
  open: boolean;
  /** Callback when drawer should close */
  onClose: () => void;
  /** Callback after successful creation */
  onSuccess?: () => void;
}

/**
 * Drawer component for creating a new series
 * Slides in from the right side with a form to create a series
 */
const CreateSeriesDrawer: React.FC<CreateSeriesDrawerProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const router = useRouter();
  const run = useCommandRun();
  const dispatch = useDispatch();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when drawer opens/closes
  React.useEffect(() => {
    if (!open) {
      setTitle("");
      setDescription("");
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const series = await dispatch(actions.createSeries({
        title: title.trim(),
        description: description.trim() || undefined,
      })).unwrap();

      if (!series) throw new Error("Failed to create series");

      // Success - close drawer and navigate or refresh
      onSuccess?.();
      onClose();
      run(seriesCommands.open, { id: series.id });
      router.refresh();
    } catch (err) {
      // The thunk announced the failure globally; this is the inline copy.
      setError(
        err instanceof Error ? err.message : "Failed to create series",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        "& .MuiDrawer-paper": {
          width: { xs: "100%", sm: 500, md: 600 },
          maxWidth: "100vw",
        },
      }}
    >
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <Box
          sx={{
            p: 2,
            borderBottom: 1,
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Typography variant="h6" component="h2">
            Create New Series
          </Typography>
          <IconButton
            onClick={onClose}
            edge="end"
            aria-label="close"
            disabled={loading}
          >
            <X />
          </IconButton>
        </Box>

        {/* Form Content */}
        <Box
          sx={{
            flex: 1,
            overflowY: "auto",
            p: 3,
          }}
        >
          {error && (
            <Alert
              severity="error"
              sx={{ mb: 2 }}
              onClose={() => setError(null)}
            >
              {error}
            </Alert>
          )}

          <TextField
            autoFocus
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
            rows={6}
            disabled={loading}
            helperText="Optional: Add a description to help readers understand what this series covers"
          />
        </Box>

        {/* Footer with actions */}
        <Box
          sx={{
            p: 2,
            borderTop: 1,
            borderColor: "divider",
            display: "flex",
            gap: 2,
            justifyContent: "flex-end",
          }}
        >
          <Button
            onClick={onClose}
            disabled={loading}
            variant="outlined"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading || !title.trim()}
            startIcon={loading ? <CircularProgress size={20} /> : <Plus />}
          >
            {loading ? "Creating..." : "Create Series"}
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
};

export default CreateSeriesDrawer;
