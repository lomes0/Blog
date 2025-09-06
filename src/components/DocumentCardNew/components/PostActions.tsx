"use client";
import React from "react";
import { Box, IconButton } from "@mui/material";
import { Edit, MoreVert, Share } from "@mui/icons-material";
import { User, UserDocument } from "@/types";
import PostActionMenu from "../PostActionMenu";
import { useRouter } from "next/navigation";

/**
 * Props for PostActions component
 */
interface PostActionsProps {
  userDocument?: UserDocument;
  user?: User;
  isLoading?: boolean;
}

/**
 * Skeleton component for action buttons when loading
 */
const ActionsSkeleton: React.FC = () => (
  <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
    <IconButton aria-label="Edit Post" size="small" disabled>
      <Edit />
    </IconButton>
    <IconButton aria-label="Share Post" size="small" disabled>
      <Share />
    </IconButton>
    <IconButton aria-label="Post Actions" size="small" disabled>
      <MoreVert />
    </IconButton>
  </Box>
);

/**
 * PostActions component responsible for rendering post action buttons
 * Handles both loading states and active states
 */
const PostActions: React.FC<PostActionsProps> = ({
  userDocument,
  user,
  isLoading = false,
}) => {
  const router = useRouter();

  // Show skeleton during loading or when no document is available
  if (isLoading || !userDocument) {
    return <ActionsSkeleton />;
  }

  // Determine if user can edit this document
  const document = userDocument.local || userDocument.cloud;
  const cloudDocument = userDocument.cloud;
  const isAuthor = cloudDocument ? cloudDocument.author.id === user?.id : true; // Local documents can always be edited
  const isCollab = cloudDocument ? cloudDocument.collab : false;
  const canEdit = isAuthor || isCollab;

  // Get the edit URL
  const handle = document?.handle || document?.id || userDocument.id;
  const editHref = `/edit/${handle}`;

  const handleEditClick = () => {
    router.push(editHref);
  };

  return (
    <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
      {canEdit && (
        <IconButton
          onClick={handleEditClick}
          aria-label="Edit Post"
          size="small"
        >
          <Edit />
        </IconButton>
      )}
      <PostActionMenu userDocument={userDocument} user={user} />
    </Box>
  );
};

export default PostActions;
