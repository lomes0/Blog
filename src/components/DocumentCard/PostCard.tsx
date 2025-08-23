"use client";
import * as React from "react";
import { memo, Suspense, useMemo } from "react";
import { SxProps, Theme } from "@mui/material/styles";
import { Badge, IconButton, Skeleton } from "@mui/material";
import { MoreVert, Share } from "@mui/icons-material";
import { User, UserDocument } from "@/types";
import PostActionMenu from "./PostActionMenu";
import PostThumbnail from "./PostThumbnail";
import PostThumbnailSkeleton from "./PostThumbnailSkeleton";
import CardBase from "./CardBase";
import { PostState, renderPostChips } from "./PostChips";
import { cardTheme } from "./theme";
import { useDocumentURL } from "../DocumentURLContext";

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
 */
const PostCard: React.FC<PostCardProps> = memo(({
  userDocument,
  user,
  sx,
}) => {
  // Simplified state calculation for blog posts
  const postState = useMemo((): PostState => {
    if (!userDocument) {
      return { isDraft: false, isPublished: false, isLoading: true };
    }

    const localDocument = userDocument.local;
    const cloudDocument = userDocument.cloud;
    const hasLocal = Boolean(localDocument);
    const hasCloud = Boolean(cloudDocument);

    return {
      isDraft: hasLocal && !hasCloud,
      isPublished: hasCloud,
      isLoading: false,
    };
  }, [userDocument]);

  // Get the document to display (prefer local if available)
  const document = useMemo(() => {
    if (!userDocument) return null;
    return userDocument.local || userDocument.cloud;
  }, [userDocument]);

  // Navigation and metadata
  const { getDocumentUrl } = useDocumentURL();
  const href = useMemo(() => {
    return document && userDocument ? getDocumentUrl(userDocument) : "/";
  }, [document, userDocument, getDocumentUrl]);

  // Get author (from cloud document or current user)
  const author = useMemo(() => {
    return userDocument?.cloud?.author ?? user;
  }, [userDocument?.cloud?.author, user]);

  // Series information (if available)
  const seriesInfo = useMemo(() => {
    const cloudDoc = userDocument?.cloud as any; // Type assertion for series fields
    return {
      series: cloudDoc?.series || null,
      seriesOrder: cloudDoc?.seriesOrder || null,
    };
  }, [userDocument?.cloud]);

  // Memoize top content (thumbnail)
  const topContent = useMemo(
    () => (
      <Badge badgeContent={0} color="secondary">
        <Suspense fallback={<PostThumbnailSkeleton />}>
          <PostThumbnail userDocument={userDocument} />
        </Suspense>
      </Badge>
    ),
    [userDocument],
  );

  // Memoize chip content
  const chipContent = useMemo(() => {
    return renderPostChips({
      postState,
      author,
      series: seriesInfo.series,
      seriesOrder: seriesInfo.seriesOrder,
      showAuthor: true,
      showSeries: true,
    });
  }, [postState, author, seriesInfo.series, seriesInfo.seriesOrder]);

  // Memoize action content
  const actionContent = useMemo(() => {
    if (postState.isLoading || !userDocument) {
      return (
        <>
          <IconButton aria-label="Share Post" size="small" disabled>
            <Share />
          </IconButton>
          <IconButton aria-label="Post Actions" size="small" disabled>
            <MoreVert />
          </IconButton>
        </>
      );
    }

    return <PostActionMenu userDocument={userDocument} user={user} />;
  }, [postState.isLoading, userDocument, user]);

  // Memoize title content
  const titleContent = useMemo(() => {
    return document?.name || <Skeleton variant="text" width={190} />;
  }, [document?.name]);

  // Memoize aria label
  const ariaLabel = useMemo(() => {
    return document ? `Open ${document.name} post` : "Loading post";
  }, [document]);

  return (
    <CardBase
      title={titleContent}
      href={href}
      isLoading={postState.isLoading}
      topContent={topContent}
      chipContent={chipContent}
      actionContent={actionContent}
      ariaLabel={ariaLabel}
      sx={sx}
    />
  );
});

PostCard.displayName = "PostCard";

export default PostCard;
