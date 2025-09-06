"use client";
import * as React from "react";
import { memo } from "react";
import { SxProps, Theme } from "@mui/material/styles";
import { User, UserDocument } from "@/types";
import CardBase from "./CardBase";
import { usePostState } from "./hooks/usePostState";
import PostContent from "./components/PostContent";
import PostMeta from "./components/PostMeta";
import PostActions from "./components/PostActions";
import LoadingCard from "./components/LoadingCard";

/**
 * Simplified props interface for PostCard
 */
interface PostCardProps {
  userDocument?: UserDocument;
  user?: User;
  sx?: SxProps<Theme>;
}

/**
 * Simplified PostCard component for blog posts
 * Consolidates DocumentCard logic with blog-specific simplifications
 *
 * This refactored version eliminates complex memoization in favor of
 * well-structured component composition with clear data flow.
 */
const PostCard: React.FC<PostCardProps> = memo(({
  userDocument,
  user,
  sx,
}) => {
  // Use consolidated state management hook
  const { document, author, postState, href, seriesInfo, ariaLabel } =
    usePostState(userDocument, user);

  // If loading, show unified loading card
  if (postState.isLoading) {
    return <LoadingCard sx={sx} />;
  }

  // Simple, direct component composition without complex memoization
  return (
    <CardBase
      href={href}
      isLoading={false}
      topContent={
        <PostContent
          userDocument={userDocument}
        />
      }
      chipContent={
        <PostMeta
          postState={postState}
          author={author}
          series={seriesInfo.series}
          seriesOrder={seriesInfo.seriesOrder}
          options={{
            showAuthor: true,
            showSeries: true,
          }}
        />
      }
      actionContent={
        <PostActions
          userDocument={userDocument}
          user={user}
        />
      }
      ariaLabel={ariaLabel}
      sx={sx}
    />
  );
});

PostCard.displayName = "PostCard";

export default PostCard;
