import { Box, Skeleton } from "@mui/material";

/**
 * Simplified thumbnail skeleton for loading state
 */
const PostThumbnailSkeleton = () => {
  return (
    <Box
      className="post-thumbnail-skeleton"
      sx={{ 
        display: "flex", 
        flexDirection: "column",
        gap: 1,
        p: 1,
      }}
    >
      {/* Title skeleton */}
      <Skeleton
        variant="text"
        width="70%"
        height={24}
        sx={{ alignSelf: "center" }}
      />
      
      {/* Content lines */}
      <Skeleton variant="text" width="90%" height={16} />
      <Skeleton variant="text" width="75%" height={16} />
      <Skeleton variant="text" width="85%" height={16} />
      
      {/* Optional content block (table, image, etc.) */}
      <Skeleton
        variant="rectangular"
        width="100%"
        height={60}
        sx={{ mt: 1, borderRadius: 1 }}
      />
    </Box>
  );
};

export default PostThumbnailSkeleton;
