"use client";
import React from "react";
import { Box, Typography } from "@mui/material";
import { useRouter } from "next/navigation";
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
  // Raw router, and it has to be: this card renders on `/user/[id]`, which is
  // in the `(public)` route group and mounts no store — so there is no command
  // registry to route through (it is built from the store, see
  // `CommandProvider`). Same exemption `UserDocuments` already takes for its
  // own query-string pushes.
  const router = useRouter();
  const document = post;
  const title = document?.title || "Untitled Post";
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
                // `preventDefault`/`stopPropagation` rather than an <a>: the
                // whole card is already a link, and nesting anchors is invalid.
                e.preventDefault();
                e.stopPropagation();
                router.push(`/user/${author.handle || author.id}`);
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
