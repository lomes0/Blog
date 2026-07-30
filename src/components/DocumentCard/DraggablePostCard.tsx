"use client";
import React, { useCallback, useContext, useRef, useState } from "react";
import { Post, User } from "@/types";
import { Box, SxProps, useMediaQuery } from "@mui/material";
import { Theme, useTheme } from "@mui/material/styles";
import PostCard from "./PostCard";

import { DragContext } from "@/contexts/DragContext";
import { readDragPayload, setDragPayload } from "@/lib/dragDrop";

interface DraggablePostCardProps {
  post: Post;
  user?: User;
  sx?: SxProps<Theme>;
  onMoveComplete?: () => void;
}

/**
 * Simplified draggable wrapper for PostCard
 * Removes directory drop logic since blog only has posts
 */
const DraggablePostCard: React.FC<DraggablePostCardProps> = ({
  post,
  user,
  sx,
  onMoveComplete,
}) => {
  const theme = useTheme();
  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
  );
  const [isDragging, setIsDragging] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const { setIsDragging: setGlobalDragging } = useContext(DragContext);

  const document = post;

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    setDragPayload(e.dataTransfer, [post.id], document?.name);

    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      e.dataTransfer.setDragImage(
        cardRef.current,
        rect.width / 2,
        rect.height / 2,
      );
    }

    setIsDragging(true);
    setGlobalDragging(true);
  }, [post.id, document?.name, setGlobalDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setGlobalDragging(false);
  }, [setGlobalDragging]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dragData = readDragPayload(e.dataTransfer);
    if (dragData && dragData.id !== post.id) {
      // In a blog context, we might reorder posts or move to series
      // This would need to be implemented based on specific requirements
      onMoveComplete?.();
    }
  }, [post.id, onMoveComplete]);

  return (
    <Box
      ref={cardRef}
      draggable={true}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      aria-label={document?.name
        ? `Draggable ${document.name}`
        : "Draggable post"}
      sx={{
        cursor: "grab",
        "&:active": {
          cursor: "grabbing",
        },
        transition: prefersReducedMotion ? "none" : theme.transitions.create([
          "transform",
          "opacity",
        ], {
          duration: theme.transitions.duration.standard,
        }),
        transform: isDragging ? "scale(0.95)" : "scale(1)",
        opacity: isDragging ? 0.7 : 1,
        "&:focus-visible": {
          outline: `2px solid ${theme.palette.primary.main}`,
          outlineOffset: 2,
        },
      }}
    >
      <PostCard post={post} user={user} sx={sx} />
    </Box>
  );
};

export default DraggablePostCard;
