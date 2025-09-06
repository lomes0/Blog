import React from "react";
import { Box, Skeleton, Typography } from "@mui/material";
import { Article } from "@mui/icons-material";

interface PostsHeaderProps {
  totalCount: number;
  loading: boolean;
}

/**
 * Header component displaying page title and posts count
 * with modern blog styling
 */
const PostsHeader: React.FC<PostsHeaderProps> = ({ totalCount, loading }) => {
  return (
    <Box
      sx={{
        mb: 6,
        pt: 2,
        textAlign: { xs: "center", md: "left" },
        borderBottom: "1px solid",
        borderColor: "divider",
        pb: 4,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: { xs: "center", md: "flex-start" },
          gap: 2,
          mb: 2,
        }}
      >
        <Article
          sx={{
            fontSize: 40,
            color: "primary.main",
            display: { xs: "none", sm: "block" },
          }}
        />
        <Typography
          variant="h1"
          component="h1"
          sx={{
            fontSize: { xs: "2rem", sm: "2.5rem", md: "3rem" },
            fontWeight: 700,
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          All Posts
        </Typography>
      </Box>

      {loading
        ? (
          <Skeleton
            variant="text"
            width={140}
            height={28}
            sx={{ mx: { xs: "auto", md: 0 } }}
          />
        )
        : (
          <Typography
            variant="subtitle1"
            color="text.secondary"
            sx={{
              fontSize: "1.1rem",
              fontWeight: 500,
            }}
          >
            {totalCount} {totalCount === 1 ? "post" : "posts"} total
          </Typography>
        )}
    </Box>
  );
};

export default PostsHeader;
