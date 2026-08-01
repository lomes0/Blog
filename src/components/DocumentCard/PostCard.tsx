"use client";
import * as React from "react";
import { memo } from "react";
import { SxProps, Theme } from "@mui/material/styles";
import { Post, User } from "@/types";
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
  post?: Post;
  user?: User;
  sx?: SxProps<Theme>;
  /**
   * Whether to render the owner action menu (share / download / delete / edit).
   *
   * Off on the public author profile, which lives in the `(public)` route group
   * and mounts no store — the menu is built from the command registry and the
   * store thunks, and with no session it rendered an empty popup anyway.
   */
  showActions?: boolean;
}

/**
 * Simplified PostCard component for blog posts
 * Consolidates DocumentCard logic with blog-specific simplifications
 *
 * This refactored version eliminates complex memoization in favor of
 * well-structured component composition with clear data flow.
 */
const PostCard: React.FC<PostCardProps> = memo(({
  post,
  user,
  sx,
  showActions = true,
}) => {
  // Use consolidated state management hook
  const { author, postState, href, seriesInfo, ariaLabel, status } =
    usePostState(post, user);

  // If loading, show unified loading card
  if (postState.isLoading) {
    return <LoadingCard sx={sx} />;
  }

  // Simple, direct component composition without complex memoization
  return (
    <CardBase
      href={href}
      isLoading={false}
      status={status}
      topContent={
        <PostContent
          post={post}
          author={author}
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
          post={post}
          user={user}
          showActions={showActions}
        />
      }
      ariaLabel={ariaLabel}
      sx={sx}
    />
  );
});

PostCard.displayName = "PostCard";

export default PostCard;
