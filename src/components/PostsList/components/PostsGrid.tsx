import React from "react";
import { Grid2 as Grid, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { UserDocument } from "@/types";
import { useSelector } from "@/store";
import DocumentCard from "@/components/DocumentCardNew";

interface PostsGridProps {
  posts: UserDocument[];
}

/**
 * Simplified responsive grid component for displaying posts
 * Mobile: 1 column, Tablet: 2 columns, Desktop: 3-4 columns
 */
const PostsGrid: React.FC<PostsGridProps> = ({ posts }) => {
  const user = useSelector((state) => state.user);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isTablet = useMediaQuery(theme.breakpoints.between("sm", "md"));

  // Simple spacing based on screen size
  const getSpacing = () => {
    if (isMobile) return 2;
    if (isTablet) return 2.5;
    return 3;
  };

  return (
    <Grid
      container
      spacing={getSpacing()}
    >
      {posts.map((post) => (
        <Grid
          key={post.id}
          size={{ xs: 12, sm: 6, md: 4, lg: 3 }}
          sx={{
            display: "flex",
          }}
        >
          <DocumentCard
            userDocument={post}
            user={user}
            sx={{
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
            }}
          />
        </Grid>
      ))}
    </Grid>
  );
};

export default PostsGrid;
