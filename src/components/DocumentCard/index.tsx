"use client";
import * as React from "react";
import { User, UserDocument } from "@/types";
import { memo } from "react";
import { SxProps, Theme } from "@mui/material/styles";
import PostCard from "./PostCard";

/**
 * Props for the DocumentCard component
 */
interface DocumentCardProps {
  userDocument?: UserDocument;
  user?: User;
  sx?: SxProps<Theme>;
}

/**
 * DocumentCard - Main entry point for blog post cards
 * 
 * This component provides a simplified interface for rendering blog post cards.
 * It wraps the PostCard component with default responsive styling and maintains
 * backward compatibility with the original DocumentCard API.
 * 
 * @param userDocument - The user document to display
 * @param user - The current user context  
 * @param sx - Additional Material-UI styling
 * @returns A properly styled post card component
 */
const DocumentCard: React.FC<DocumentCardProps> = memo(({ 
  userDocument, 
  user, 
  sx = {} 
}) => {
  // Apply default responsive styles that work well in grid layouts
  const defaultSx: SxProps<Theme> = {
    width: "100%",
    height: "100%",
    margin: 0,
    display: "flex",
    flexDirection: "column",
  };

  // Combine default styles with custom styles
  const combinedSx: SxProps<Theme> = { ...defaultSx, ...(sx as any) };

  return (
    <PostCard
      userDocument={userDocument}
      user={user}
      sx={combinedSx}
    />
  );
});

DocumentCard.displayName = "DocumentCard";

export default DocumentCard;
