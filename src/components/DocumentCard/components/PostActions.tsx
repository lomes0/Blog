"use client";
import React from "react";
import { Box, IconButton } from "@mui/material";
import { MoreVertical, Share2 } from "lucide-react";

import { Post, User } from "@/types";
import PostActionMenu from "../PostActionMenu";

/**
 * Props for PostActions component
 */
interface PostActionsProps {
  post?: Post;
  user?: User;
  isLoading?: boolean;
  /** See `PostCard`'s `showActions`. */
  showActions?: boolean;
}

/**
 * Skeleton component for action buttons when loading
 */
const ActionsSkeleton: React.FC = () => (
  <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
    <IconButton aria-label="Share Post" size="small" disabled>
      <Share2 />
    </IconButton>
    <IconButton aria-label="Post Actions" size="small" disabled>
      <MoreVertical />
    </IconButton>
  </Box>
);

/**
 * PostActions component responsible for rendering post action buttons
 * Handles both loading states and active states
 */
const PostActions: React.FC<PostActionsProps> = ({
  post,
  user,
  isLoading = false,
  showActions = true,
}) => {
  // Nothing at all, not a skeleton: the caller has said this surface has no
  // owner actions, so a placeholder would just be a hole in the card.
  if (!showActions) return null;

  // Show skeleton during loading or when no document is available
  if (isLoading || !post) {
    return <ActionsSkeleton />;
  }

  return (
    <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
      <PostActionMenu post={post} user={user} />
    </Box>
  );
};

export default PostActions;
