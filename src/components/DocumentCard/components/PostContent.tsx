import React, { Suspense } from "react";
import { Badge, Box, Skeleton } from "@mui/material";
import { UserDocument } from "@/types";
import PostThumbnail from "../PostThumbnail";

/**
 * Props for PostContent component
 */
interface PostContentProps {
  userDocument?: UserDocument;
}

/**
 * Simple skeleton for content loading (used in Suspense fallback)
 */
const ContentSkeleton: React.FC = () => (
  <Box
    sx={{
      display: "flex",
      flexDirection: "column",
      gap: 1,
      p: 1,
    }}
  >
    <Skeleton variant="text" width="70%" height={24} />
    <Skeleton variant="text" width="90%" height={16} />
    <Skeleton variant="text" width="75%" height={16} />
    <Skeleton variant="rectangular" width="100%" height={60} sx={{ mt: 1 }} />
  </Box>
);

/**
 * PostContent component handles the main content display logic
 *
 * This component consolidates the thumbnail logic from PostCard
 * and provides a clear separation of content concerns.
 *
 * Main loading state is handled by LoadingCard, this component
 * only handles content-specific async loading (Suspense).
 */
export const PostContent: React.FC<PostContentProps> = ({
  userDocument,
}) => {
  return (
    <Badge badgeContent={0} color="secondary">
      <Suspense fallback={<ContentSkeleton />}>
        <PostThumbnail userDocument={userDocument} />
      </Suspense>
    </Badge>
  );
};

export default PostContent;
