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
import { v4 as uuidv4 } from "uuid";
import { useRouter } from "next/navigation";
import useOnlineStatus from "@/hooks/useOnlineStatus";
import type { DocumentCreateInput, User } from "@/types";
import { useHandleValidation } from "@/components/DocumentActions/hooks/useHandleValidation";
import { getEditorData } from "@/utils/getEditorData";
import PostCloudOptions from "../posts/PostCloudOptions";
import { useCreatePostActions } from "@/hooks/useCreatePostActions";

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
  const { user, fetchNextSeriesOrder, createPost } = useCreatePostActions();
  const router = useRouter();
  const isOnline = useOnlineStatus();

  const [input, setInput] = useState<Partial<DocumentCreateInput>>({
    published: true,
    private: false,
    collab: false,
  });
  const [saveToCloud, setSaveToCloud] = useState(true);
  const [nextSeriesOrder, setNextSeriesOrder] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateInput = (partial: Partial<DocumentCreateInput>) => {
    setInput((prev) => ({ ...prev, ...partial }));
  };

  const updateCoauthors = (users: (User | string)[]) => {
    updateInput({
      coauthors: users.map((u) => (typeof u === "string" ? u : u.email)),
    });
  };

  const {
    validating,
    validationErrors,
    hasErrors,
    updateHandle,
    resetValidation,
  } = useHandleValidation(
    null,
    (value) => updateInput({ handle: value }),
  );

  // Fetch next series order when drawer opens
  React.useEffect(() => {
    if (!open || !seriesId) return;
    fetchNextSeriesOrder(seriesId).then(setNextSeriesOrder);
  }, [open, seriesId, fetchNextSeriesOrder]);

  // Reset form when drawer closes
  React.useEffect(() => {
    if (!open) {
      setInput({ published: true, private: false, collab: false });
      resetValidation();
      setError(null);
      setSaveToCloud(true);
    }
  }, [open, resetValidation]);

  // Disable cloud saving when offline or logged out
  React.useEffect(() => {
    if (!isOnline || !user) setSaveToCloud(false);
  }, [isOnline, user]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    if (!seriesId?.trim()) {
      setError("Invalid series. Please try again.");
      setIsSubmitting(false);
      return;
    }
    try {
      const name = input.name || "Untitled Document";
      const createdAt = new Date().toISOString();
      const postId = uuidv4();
      const payload: DocumentCreateInput = {
        ...input,
        id: postId,
        head: uuidv4(),
        name,
        data: input.data ??
          (getEditorData() as DocumentCreateInput["data"]),
        type: "DOCUMENT",
        parentId: null,
        seriesId,
        seriesOrder: nextSeriesOrder,
        createdAt,
        updatedAt: createdAt,
      };

      const result = await createPost(payload, { saveToCloud, isOnline });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSuccess?.();
      onClose();
      router.refresh();
      if (result.cloudSaved) {
        router.push(`/edit/${postId}`);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
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
            disabled={isSubmitting}
          >
            <X />
          </IconButton>
        </Box>

        {/* Form Content */}
        <Box sx={{ flex: 1, overflowY: "auto", p: 3 }}>
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
            label="Title"
            placeholder="Enter post title"
            fullWidth
            value={input.name || ""}
            onChange={(e) => updateInput({ name: e.target.value })}
            required
            sx={{ mb: 2 }}
            disabled={isSubmitting}
          />
          <TextField
            label="Handle"
            placeholder="url-slug-for-post"
            fullWidth
            value={input.handle || ""}
            onChange={updateHandle}
            error={!!validationErrors.handle}
            helperText={validationErrors.handle ||
              "Optional: Custom URL for this post"}
            sx={{ mb: 2 }}
            disabled={isSubmitting}
            InputProps={{
              endAdornment: validating && <CircularProgress size={20} />,
            }}
          />
          <PostCloudOptions
            input={input}
            saveToCloud={saveToCloud}
            isOnline={isOnline}
            user={user}
            isSubmitting={isSubmitting}
            onSaveToCloudChange={setSaveToCloud}
            onUpdateInput={updateInput}
            onUpdateCoauthors={updateCoauthors}
          />
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
          <Button onClick={onClose} disabled={isSubmitting} variant="outlined">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            startIcon={isSubmitting ? <CircularProgress size={20} /> : <Plus />}
            disabled={hasErrors || validating || isSubmitting}
          >
            {isSubmitting ? "Creating..." : "Create Post"}
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
};

export default CreatePostDrawer;
