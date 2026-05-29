"use client";
import { MoreVertical, Share2 } from "lucide-react";
import { IconButton } from "@mui/material";
import dynamic from "next/dynamic";

/**
 * Simplified post action menu
 * Same functionality as DocumentActionMenu but renamed for clarity
 */
const PostActionMenu = dynamic(
  () => import("@/components/DocumentActions/ActionMenu"),
  {
    loading: () => (
      <>
        <IconButton
          aria-label="Share Post"
          size="small"
          disabled
        >
          <Share2 />
        </IconButton>
        <IconButton
          aria-label="Post Actions"
          size="small"
          disabled
        >
          <MoreVertical />
        </IconButton>
      </>
    ),
  },
);

export default PostActionMenu;
