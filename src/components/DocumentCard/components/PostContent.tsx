"use client";
import React from "react";
import { Box, Typography } from "@mui/material";
import { workspaceCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";
import { Post, User } from "@/types";
import { formatFullDate as formatDate } from "@/utils/dateFormat";

/**
 * Props for PostContent component
 */
interface PostContentProps {
  post?: Post;
  author?: User | null;
}

/**
 * Blog-style PostContent component
 * Follows standard blog UI conventions with title, meta info, and excerpt
 */
const PostContent: React.FC<PostContentProps> = ({
  post,
  author,
}) => {
  const run = useCommandRun();
  const document = post;
  const title = document?.name || "Untitled Post";
  const createdAt = document?.createdAt;

  // Format the date
  const formattedDate = createdAt ? formatDate(createdAt) : "";

  return (
    <Box
      sx={{
        p: { xs: 2, sm: 3 },
        display: "flex",
        flexDirection: "column",
        height: 200, // Fixed height instead of minHeight
        overflow: "hidden", // Prevent overflow
      }}
    >
      {/* Blog post title */}
      <Typography
        variant="h5"
        component="h2"
        sx={{
          fontWeight: 700,
          lineHeight: 1.2,
          color: "text.primary",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontSize: { xs: "1.25rem", sm: "1.5rem" },
          mb: 1,
          flexShrink: 0, // Don't shrink the title
          "&:hover": {
            color: "primary.main", // Unified hover blue
          },
        }}
      >
        {title}
      </Typography>

      {/* Meta information */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          flexWrap: "wrap",
          mb: 3,
          flexShrink: 0, // Don't shrink the meta info
        }}
      >
        {author && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              fontWeight: 500,
            }}
          >
            by{" "}
            <Box
              component="span"
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                run(workspaceCommands.openSection, { section: "dashboard" });
              }}
              sx={{
                color: "text.secondary",
                textDecoration: "none",
                cursor: "pointer",
                "&:hover": {
                  color: "primary.main", // Unified hover blue
                  textDecoration: "underline",
                },
              }}
            >
              {author.name || author.email}
            </Box>
          </Typography>
        )}

        {author && formattedDate && (
          <Box
            sx={{
              width: 4,
              height: 4,
              bgcolor: "text.secondary",
              borderRadius: "50%",
            }}
          />
        )}

        {formattedDate && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              fontWeight: 500,
            }}
          >
            {formattedDate}
          </Typography>
        )}
      </Box>

      {/* Excerpt/Description */}
      <Typography
        variant="body1"
        color="text.secondary"
        sx={{
          lineHeight: 1.6,
          display: "-webkit-box",
          WebkitLineClamp: 4,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textOverflow: "ellipsis",
          flex: 1,
          minHeight: 0,
        }}
      >
        {document?.description}
      </Typography>
    </Box>
  );
};

export default PostContent;
