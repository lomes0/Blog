"use client";
import * as React from "react";
import { memo, Suspense, useMemo } from "react";
import { SxProps, Theme } from "@mui/material/styles";
import { Badge, IconButton, Skeleton } from "@mui/material";
import { MoreVert, Share } from "@mui/icons-material";
import { User, UserDocument } from "@/types";
import DocumentActionMenu from "./DocumentActionMenu";
import DocumentThumbnail from "./DocumentThumbnail";
import ThumbnailSkeleton from "./ThumbnailSkeleton";
import CardBase from "./CardBase";
import { renderSkeletonChips, renderStatusChips } from "./CardChips";
import { cardTheme } from "./theme";
import { useDocumentURL } from "../DocumentURLContext";

// Define proper interface for component props
interface DocumentCardProps {
  /** The document data */
  userDocument?: UserDocument;
  /** The current user */
  user?: User;
  /** Additional styles to apply */
  sx?: SxProps<Theme>;
  /** Card configuration */
  cardConfig?: {
    /** Min height of the card */
    minHeight?: string;
    /** Whether to show the author chip */
    showAuthor?: boolean;
    /** Max number of status chips to display */
    maxStatusChips?: number;
    /** Whether to show the sort order chip */
    showSortOrder?: boolean;
    /** Whether to show permission chips (published, collab, private) */
    showPermissionChips?: boolean;
  };
}

/**
 * Document card component representing a document in the system
 * Optimized for performance and accessibility
 */
const DocumentCard: React.FC<DocumentCardProps> = memo(({
  userDocument,
  user,
  sx,
  cardConfig = {},
}) => {
  // Apply default configuration with overrides
  const config = useMemo(() => ({
    minHeight: cardConfig.minHeight || cardTheme.minHeight.document,
    showAuthor: cardConfig.showAuthor !== false,
    maxStatusChips: cardConfig.maxStatusChips,
    showSortOrder: cardConfig.showSortOrder !== false,
    showPermissionChips: cardConfig.showPermissionChips !== false,
  }), [cardConfig]);

  // Memoize document state calculations for performance
  const documentState = useMemo(() => {
    const localDocument = userDocument?.local;
    const cloudDocument = userDocument?.cloud;
    const isLocal = Boolean(localDocument);
    const isCloud = Boolean(cloudDocument);
    const isLocalOnly = isLocal && !isCloud;
    const isCloudOnly = !isLocal && isCloud;
    const isUploaded = isLocal && isCloud;
    const isUpToDate = isUploaded &&
      localDocument?.head === cloudDocument?.head;

    return {
      localDocument,
      cloudDocument,
      isLocal,
      isCloud,
      isLocalOnly,
      isCloudOnly,
      isUploaded,
      isUpToDate,
    };
  }, [userDocument]);

  // Memoize permission and status calculations
  const permissionState = useMemo(() => {
    const { cloudDocument, isCloud } = documentState;

    return {
      isPublished: isCloud && cloudDocument?.published &&
        config.showPermissionChips,
      isCollab: isCloud && cloudDocument?.collab && config.showPermissionChips,
      isPrivate: isCloud && cloudDocument?.private &&
        config.showPermissionChips,
      isAuthor: isCloud ? cloudDocument?.author?.id === user?.id : true,
      isCoauthor: isCloud
        ? cloudDocument?.coauthors?.some((u) => u.id === user?.id)
        : false,
    };
  }, [documentState, user?.id, config.showPermissionChips]);

  // Get the document to display (prefer local if available)
  const document = documentState.isCloudOnly
    ? documentState.cloudDocument
    : documentState.localDocument;

  // Navigation and metadata
  const { getDocumentUrl } = useDocumentURL();
  const handle = documentState.cloudDocument?.handle ??
    documentState.localDocument?.handle ??
    document?.id;

  // Get the URL from context if document exists, or fallback to root
  const href = document && userDocument ? getDocumentUrl(userDocument) : "/";
  const author = documentState.cloudDocument?.author ?? user;

  // Sort order for display
  const sortOrderValue = documentState.localDocument?.sort_order ??
    documentState.cloudDocument?.sort_order ?? 0;
  const hasSortOrder = sortOrderValue > 0 && config.showSortOrder;

  // Determine the badge content (if any)
  const revisionsBadgeContent = 0; // This appears to be unused currently

  // Rendering helpers
  const isLoading = !userDocument;

  // Memoize top content to prevent unnecessary re-renders
  const topContent = useMemo(
    () => (
      <Badge badgeContent={revisionsBadgeContent} color="secondary">
        <Suspense fallback={<ThumbnailSkeleton />}>
          <DocumentThumbnail userDocument={userDocument} />
        </Suspense>
      </Badge>
    ),
    [revisionsBadgeContent, userDocument],
  );

  // Memoize chip content based on document status
  const chipContent = useMemo(() => {
    if (isLoading) return renderSkeletonChips({});

    // Check if this is a post with series information
    const cloudDoc = documentState.cloudDocument as any; // Type assertion for series fields
    const hasSeriesInfo = cloudDoc?.seriesId || cloudDoc?.series;

    return renderStatusChips({
      isLocalOnly: documentState.isLocalOnly,
      isUploaded: documentState.isUploaded,
      isUpToDate: documentState.isUpToDate,
      isCloudOnly: documentState.isCloudOnly &&
        (permissionState.isAuthor || permissionState.isCoauthor),
      isPublished: permissionState.isPublished,
      isCollab: permissionState.isCollab,
      isPrivate: permissionState.isPrivate,
      documentStatus: document?.status,
      hasSortOrder,
      sortOrderValue,
      author,
      showAuthor: config.showAuthor,
      series: hasSeriesInfo ? cloudDoc?.series : null,
      seriesOrder: hasSeriesInfo ? cloudDoc?.seriesOrder : null,
      showSeries: hasSeriesInfo,
      statusChipCount: config.maxStatusChips,
    });
  }, [
    isLoading,
    documentState,
    permissionState,
    document?.status,
    hasSortOrder,
    sortOrderValue,
    author,
    config.showAuthor,
    config.maxStatusChips,
  ]);

  // Memoize action content for better performance
  const actionContent = useMemo(() => {
    if (isLoading) {
      return (
        <>
          <IconButton
            aria-label="Share Document"
            size="small"
            disabled
          >
            <Share />
          </IconButton>
          <IconButton
            aria-label="Document Actions"
            size="small"
            disabled
          >
            <MoreVert />
          </IconButton>
        </>
      );
    }

    return (
      <DocumentActionMenu
        userDocument={userDocument}
        user={user}
      />
    );
  }, [isLoading, userDocument, user]);

  // Memoize title content
  const titleContent = useMemo(() => {
    return document?.name || <Skeleton variant="text" width={190} />;
  }, [document?.name]);

  // Memoize aria label for better accessibility
  const ariaLabel = useMemo(() => {
    return document ? `Open ${document.name} document` : "Loading document";
  }, [document]);

  return (
    <CardBase
      title=""
      href={href}
      isLoading={isLoading}
      topContent={topContent}
      chipContent={chipContent}
      actionContent={actionContent}
      documentStatus={document?.status}
      minHeight={config.minHeight}
      className="document-card"
      ariaLabel={ariaLabel}
      sx={sx}
      contentProps={{
        showSubheaderSpace: false,
      }}
    />
  );
});

// Set display name for debugging purposes
DocumentCard.displayName = "DocumentCard";

export default DocumentCard;
