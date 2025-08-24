"use client";
import React from "react";
import { IconButton } from "@mui/material";
import { MoreVert, Share } from "@mui/icons-material";
import { User, UserDocument } from "@/types";
import PostActionMenu from "../PostActionMenu";

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
  <>
    <IconButton aria-label="Share Post" size="small" disabled>
      <Share />
    </IconButton>
    <IconButton aria-label="Post Actions" size="small" disabled>
      <MoreVert />
    </IconButton>
  </>
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
  // Show skeleton during loading or when no document is available
  if (isLoading || !userDocument) {
    return <ActionsSkeleton />;
  }

  // Render the actual action menu
  return <PostActionMenu userDocument={userDocument} user={user} />;
};

export default PostActions;
