"use client";
import * as React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Drawer,
  IconButton,
  Typography,
} from "@mui/material";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCreatePostForm } from "@/hooks/useCreatePostForm";
import PostFormFields from "../DocumentActions/PostFormFields";

interface CreatePostDrawerProps {
  open: boolean;
  onClose: () => void;
  seriesId: string;
  seriesTitle?: string;
  onSuccess?: () => void;
}

const CreatePostDrawer: React.FC<CreatePostDrawerProps> = ({
  open,
  onClose,
  seriesId,
  seriesTitle,
  onSuccess,
}) => {
  const router = useRouter();
  const form = useCreatePostForm({ seriesId });
  const { reset, submitting } = form;

  // Reset form when drawer closes
  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!seriesId?.trim()) {
      form.setError("Invalid series. Please try again.");
      return;
    }
    const result = await form.submit();
    if (!result.ok) return;
    onSuccess?.();
    onClose();
    router.refresh();
    router.push(`/edit/${result.id}`);
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        "& .MuiDrawer-paper": {
          width: { xs: "100%", sm: 600, md: 700 },
          maxWidth: "100vw",
        },
      }}
    >
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{ height: "100%", display: "flex", flexDirection: "column" }}
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
          <Box>
            <Typography variant="h6" component="h2">Create New Post</Typography>
            {seriesTitle && (
              <Typography variant="body2" color="text.secondary">
                in {seriesTitle}
              </Typography>
            )}
          </Box>
          <IconButton
            onClick={onClose}
            edge="end"
            aria-label="close"
            disabled={submitting}
          >
            <X />
          </IconButton>
        </Box>

        {/* Form Content */}
        <Box sx={{ flex: 1, overflowY: "auto", p: 3 }}>
          {form.error && (
            <Alert
              severity="error"
              sx={{ mb: 2 }}
              onClose={() => form.setError(null)}
            >
              {form.error}
            </Alert>
          )}
          <PostFormFields form={form} disabled={submitting} />
        </Box>

        {/* Footer */}
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
          <Button onClick={onClose} disabled={submitting} variant="outlined">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            startIcon={submitting ? <CircularProgress size={20} /> : <Plus />}
            disabled={!form.canSubmit}
          >
            {submitting ? "Creating..." : "Create Post"}
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
};

export default CreatePostDrawer;
