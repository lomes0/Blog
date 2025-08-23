"use client";
import React, { useCallback, useContext, useRef, useState } from "react";
import { User, UserDocument } from "@/types";
import { Box, SxProps, useMediaQuery } from "@mui/material";
import { Theme, useTheme } from "@mui/material/styles";
import PostCard from "./index";
import { actions, useDispatch } from "@/store";
import { DragContext } from "../DragContext";

interface DraggablePostCardProps {
  userDocument: UserDocument;
  user?: User;
  sx?: SxProps<Theme>;
  onMoveComplete?: () => void;
}

/**
 * Simplified draggable wrapper for PostCard
 * Removes directory drop logic since blog only has posts
 */
const DraggablePostCard: React.FC<DraggablePostCardProps> = ({
  userDocument,
  user,
  sx,
  onMoveComplete,
}) => {
  const dispatch = useDispatch();
  const theme = useTheme();
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [isDragging, setIsDragging] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const { setIsDragging: setGlobalDragging } = useContext(DragContext);

  const document = userDocument?.local || userDocument?.cloud;

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData(
      "application/matheditor-document",
      JSON.stringify({
        id: userDocument.id,
        name: document?.name,
        type: "post",
      })
    );

    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      e.dataTransfer.setDragImage(cardRef.current, rect.width / 2, rect.height / 2);
    }

    e.dataTransfer.effectAllowed = "move";
    setIsDragging(true);
    setGlobalDragging(true);
  }, [userDocument.id, document?.name, setGlobalDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setGlobalDragging(false);
  }, [setGlobalDragging]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    
    try {
      const dragData = JSON.parse(e.dataTransfer.getData("application/matheditor-document"));
      
      if (dragData.id && dragData.id !== userDocument.id) {
        // In a blog context, we might reorder posts or move to series
        // This would need to be implemented based on specific requirements
        console.log("Post drop:", dragData, "onto:", userDocument.id);
        
        onMoveComplete?.();
      }
    } catch (error) {
      console.warn("Failed to handle post drop:", error);
    }
  }, [userDocument.id, onMoveComplete]);

  return (
    <Box
      ref={cardRef}
      draggable={true}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      aria-label={document?.name ? `Draggable ${document.name}` : "Draggable post"}
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
      <PostCard userDocument={userDocument} user={user} sx={sx} />
    </Box>
  );
};

export default DraggablePostCard;
