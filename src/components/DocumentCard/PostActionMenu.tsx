"use client";
import { MoreVert, Share } from "@mui/icons-material";
import { IconButton } from "@mui/material";
import dynamic from "next/dynamic";

/**
 * Simplified post action menu
 * Same functionality as DocumentActionMenu but renamed for clarity
 */
const PostActionMenu = dynamic(
  () => import("@/components/DocumentActions/ActionMenu"),
  {
    ssr: false,
    loading: () => (
      <>
        <IconButton 
          aria-label="Share Post" 
          size="small"
          disabled
        >
          <Share />
        </IconButton>
        <IconButton 
          aria-label="Post Actions" 
          size="small"
          disabled
        >
          <MoreVert />
        </IconButton>
      </>
    ),
  },
);

export default PostActionMenu;
