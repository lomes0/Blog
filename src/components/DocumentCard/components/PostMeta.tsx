import React from "react";
import { Box } from "@mui/material";
import { User } from "@/types";
import { PostState } from "../PostChips";
import { usePostMeta, PostMetaOptions } from "../hooks/usePostMeta";

/**
 * Props for PostMeta component
 */
export interface PostMetaProps {
  postState: PostState;
  author?: User | null;
  series?: any | null; // Using any for now to match existing series type
  seriesOrder?: number | null;
  options?: PostMetaOptions;
}

/**
 * PostMeta component handles the metadata chips display
 * 
 * This component consolidates the metadata chip logic from PostCard
 * and provides a clear separation of metadata concerns.
 * 
 * @param postState - The current post state
 * @param author - The post author
 * @param series - The series information (if any)
 * @param seriesOrder - The order within the series (if any)
 * @param options - Display options for controlling which chips to show
 */
export const PostMeta: React.FC<PostMetaProps> = ({
  postState,
  author,
  series,
  seriesOrder,
  options = {},
}) => {
  const chips = usePostMeta({
    postState,
    author,
    series,
    seriesOrder,
    options,
  });

  return (
    <Box 
      sx={{ 
        display: "flex", 
        gap: 0.75, 
        overflow: "hidden",
        flexWrap: "wrap"
      }}
    >
      {chips}
    </Box>
  );
};

export default PostMeta;
