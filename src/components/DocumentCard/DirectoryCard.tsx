"use client";
import * as React from "react";
import { memo, useMemo } from "react";
import { SxProps, Theme } from "@mui/material/styles";
import { Avatar, Badge, Box, IconButton, Skeleton } from "@mui/material";
import { Folder, MoreVert, Share } from "@mui/icons-material";
import { User, UserDocument } from "@/types";
import DocumentActionMenu from "./DocumentActionMenu";
import CardBase from "./CardBase";
import { renderSkeletonChips, renderStatusChips } from "./CardChips";
import { cardTheme } from "./theme";
import { useDocumentURL } from "../DocumentURLContext";

// Define proper interface for component props
interface DirectoryCardProps {
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
 * Directory card component representing a folder of documents
 * Optimized for performance and accessibility
 */
const DirectoryCard: React.FC<DirectoryCardProps> = memo(({
  userDocument,
  user,
  sx,
  cardConfig = {},
}) => {
  // Apply default configuration with overrides
  const config = useMemo(() => ({
    minHeight: cardConfig.minHeight || cardTheme.minHeight.directory,
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

  // Memoize permission state calculations
  const permissionState = useMemo(() => {
    const { cloudDocument } = documentState;
    const isPublished = documentState.isCloud && cloudDocument?.published &&
      config.showPermissionChips;
    const isCollab = documentState.isCloud && cloudDocument?.collab &&
      config.showPermissionChips;
    const isPrivate = documentState.isCloud && cloudDocument?.private &&
      config.showPermissionChips;
    const isAuthor = documentState.isCloud
      ? cloudDocument?.author?.id === user?.id
      : true;
    const isCoauthor = documentState.isCloud
      ? cloudDocument?.coauthors?.some((u) => u.id === user?.id)
      : false;

    return {
      isPublished,
      isCollab,
      isPrivate,
      isAuthor,
      isCoauthor,
    };
  }, [documentState, user?.id, config.showPermissionChips]);

  // Memoize the document to display
  const document = useMemo(() => {
    return documentState.isCloudOnly
      ? documentState.cloudDocument
      : documentState.localDocument;
  }, [documentState]);

  // Memoize navigation and metadata
  const navigationData = useMemo(() => {
    const handle = documentState.cloudDocument?.handle ??
      documentState.localDocument?.handle ??
      document?.id;
    const author = documentState.cloudDocument?.author ?? user;
    const backgroundImage = document?.background_image;

    return { handle, author, backgroundImage };
  }, [documentState, document, user]);

  // Get URL from context
  const { getDocumentUrl } = useDocumentURL();
  const href = useMemo(() => {
    return document && userDocument ? getDocumentUrl(userDocument) : "/";
  }, [document, userDocument, getDocumentUrl]);

  // Memoize sort order calculations
  const sortOrderData = useMemo(() => {
    const sortOrderValue = documentState.localDocument?.sort_order ??
      documentState.cloudDocument?.sort_order ?? 0;
    const hasSortOrder = sortOrderValue > 0 && config.showSortOrder;

    return { sortOrderValue, hasSortOrder };
  }, [documentState, config.showSortOrder]);

  // Rendering helpers
  const isLoading = !userDocument;

  // Memoize top content with background image or folder icon
  const topContent = useMemo(() => (
    <Box
      sx={{
        width: "100%",
        height: "100%", // This ensures the box takes up all available height
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: navigationData.backgroundImage
          ? `url(${navigationData.backgroundImage})`
          : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        position: "absolute", // Position absolute to fill the entire container
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: "hidden",
        // Remove the fixed minHeight - let it fill the parent container
      }}
    >
      {!navigationData.backgroundImage && (
        <Box
          sx={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            zIndex: 1,
          }}
        >
          <Badge badgeContent={0} color="secondary">
            <Avatar
              sx={{
                width: cardTheme.iconSizes.folderAvatar,
                height: cardTheme.iconSizes.folderAvatar,
                bgcolor: "primary.main",
                boxShadow: cardTheme.colors.shadow.default,
              }}
              aria-label="Folder icon"
            >
              <Folder sx={{ fontSize: cardTheme.iconSizes.folderIcon }} />
            </Avatar>
          </Badge>
        </Box>
      )}
    </Box>
  ), [navigationData.backgroundImage]);

  // Memoize chip content based on document status
  const chipContent = useMemo(() => {
    if (isLoading) return renderSkeletonChips({});

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
      hasSortOrder: sortOrderData.hasSortOrder,
      sortOrderValue: sortOrderData.sortOrderValue,
      author: navigationData.author,
      showAuthor: config.showAuthor,
      statusChipCount: config.maxStatusChips,
    });
  }, [
    isLoading,
    documentState,
    permissionState,
    document?.status,
    sortOrderData,
    navigationData.author,
    config.showAuthor,
    config.maxStatusChips,
  ]);

  // Memoize action content for better performance
  const actionContent = useMemo(() => {
    if (isLoading) {
      return (
        <>
          <IconButton
            aria-label="Share Directory"
            size="small"
            disabled
          >
            <Share />
          </IconButton>
          <IconButton
            aria-label="Directory Actions"
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
    return document ? `Open ${document.name} directory` : "Loading directory";
  }, [document]);

  return (
    <CardBase
      title={titleContent}
      href={href}
      isLoading={isLoading}
      topContent={topContent}
      chipContent={chipContent}
      actionContent={actionContent}
      documentStatus={document?.status}
      minHeight={config.minHeight}
      className="directory-card"
      ariaLabel={ariaLabel}
      sx={{
        borderWidth: 2,
        borderColor: "divider",
        // Move title down visually without changing layout
        "& .MuiTypography-h6": {
          transform: "translateY(11px)",
        },
        ...sx,
      }}
      contentProps={{
        titlePadding: {
          top: cardTheme.spacing.titleMargin,
          bottom: cardTheme.spacing.titleMargin,
        },
        showSubheaderSpace: true,
      }}
    />
  );
});

// Set display name for debugging purposes
DirectoryCard.displayName = "DirectoryCard";

export default DirectoryCard;
