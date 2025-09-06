import React from "react";
import { Box, Chip, Typography } from "@mui/material";
import { UserDocument } from "@/types";

/**
 * Props for PostContent component
 */
interface PostContentProps {
  userDocument?: UserDocument;
}

/**
 * Simple date formatter
 */
const formatDate = (dateString: string | Date): string => {
  const date = typeof dateString === "string"
    ? new Date(dateString)
    : dateString;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
};

/**
 * Blog-style PostContent component
 * Follows standard blog UI conventions with title, meta info, and excerpt
 */
export const PostContent: React.FC<PostContentProps> = ({
  userDocument,
}) => {
  const document = userDocument?.cloud || userDocument?.local;
  const title = document?.name || "Untitled Post";
  const createdAt = document?.createdAt;
  const author = userDocument?.cloud?.author;

  // Format the date
  const formattedDate = createdAt ? formatDate(createdAt) : "";

  return (
    <Box
      sx={{
        p: { xs: 2, sm: 3 },
        display: "flex",
        flexDirection: "column",
        gap: 2,
        minHeight: 160,
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
          "&:hover": {
            color: "primary.main",
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
          mb: 1,
        }}
      >
        {formattedDate && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            {formattedDate}
          </Typography>
        )}

        {author && (
          <>
            <Box
              sx={{
                width: 4,
                height: 4,
                bgcolor: "text.secondary",
                borderRadius: "50%",
              }}
            />
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              by {author.name || author.email}
            </Typography>
          </>
        )}

        {
          /* <Chip
          label="Article"
          size="small"
          variant="outlined"
          sx={{
            height: 20,
            fontSize: "0.75rem",
            fontWeight: 500,
            color: "primary.main",
            borderColor: "primary.main",
            opacity: 0.8
          }}
        /> */
        }
      </Box>

      {/* Excerpt/Description */}
      <Typography
        variant="body1"
        color="text.secondary"
        sx={{
          lineHeight: 1.6,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontSize: "1rem",
          mt: "auto",
        }}
      >
        Click to read this article and discover the insights shared within...
      </Typography>

      {/* Read more indicator */}
      <Typography
        variant="body2"
        color="primary.main"
        sx={{
          fontWeight: 600,
          fontSize: "0.875rem",
          mt: 1,
          alignSelf: "flex-start",
        }}
      >
        Read more →
      </Typography>
    </Box>
  );
};

export default PostContent;
