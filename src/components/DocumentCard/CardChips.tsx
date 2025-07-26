import React from "react";
import { Avatar, Chip, Skeleton, SxProps, Theme } from "@mui/material";
import {
  CheckCircle,
  Cloud,
  CloudDone,
  CloudSync,
  MobileFriendly,
  PlayArrow,
  Public,
  Security,
  Workspaces,
} from "@mui/icons-material";
import { DocumentStatus, User } from "@/types";
import { cardTheme } from "./theme";

/**
 * Props for a single status chip
 */
interface ChipProps {
  /** Unique key for React reconciliation */
  key?: string;
  /** Icon to display in the chip */
  icon?: React.ReactElement;
  /** Text to display in the chip */
  label: string | number | React.ReactElement;
  /** Avatar to display in the chip */
  avatar?: React.ReactElement;
  /** Additional styles to apply to the chip */
  sx?: SxProps<Theme>;
  /** Whether the chip should capture pointer events */
  pointerEvents?: boolean;
  /** Color of the chip border */
  borderColor?: string;
  /** Background color of the chip */
  bgColor?: string;
  /** Text color of the chip */
  textColor?: string;
  /** Font weight of the chip label */
  fontWeight?: string | number;
  /** Size of the chip */
  size?: "small" | "medium";
  /** Variant of the chip */
  variant?: "filled" | "outlined";
  /** Click handler for the chip */
  onClick?: () => void;
}

interface StatusChipProps {
  /** State flags */
  isLocalOnly?: boolean;
  isUploaded?: boolean;
  isUpToDate?: boolean;
  isCloudOnly?: boolean;
  isPublished?: boolean;
  isCollab?: boolean;
  isPrivate?: boolean;
  hasSortOrder?: boolean;
  sortOrderValue?: number;

  /** Document status */
  documentStatus?: DocumentStatus;

  /** Author information */
  author?: User | null;
  showAuthor?: boolean;

  /** Chip customization */
  chipSize?: "small" | "medium";
  chipVariant?: "filled" | "outlined";
  sortChipStyles?: Partial<ChipProps>;
  defaultChipStyles?: Partial<ChipProps>;
  statusChipCount?: number; // Limit the number of status chips to show
}

/**
 * Create a styled chip with consistent appearance
 * Helper function for creating chips with consistent styling
 */
export const createChip = ({
  key,
  icon,
  label,
  avatar,
  sx = {},
  pointerEvents = false,
  borderColor,
  bgColor,
  textColor,
  fontWeight,
  size = "small",
  variant = "outlined",
  onClick,
}: ChipProps) => {
  // Create chip styles object
  const chipStyles: SxProps<Theme> = {
    padding: "2px 4px",
    "& .MuiChip-label": {
      padding: "0 4px",
      ...(icon && { marginLeft: "1px" }), // Add space between icon and text
    },
    "& .MuiChip-icon": {
      marginRight: 0, // Remove default right margin from icon
    },
    "& .MuiChip-avatar": {
      marginRight: 0, // Remove default right margin from avatar
    },
    ...(pointerEvents && { pointerEvents: "auto" }),
    ...(borderColor && { borderColor }),
    ...(bgColor && { bgcolor: bgColor }),
    ...(textColor && { color: textColor }),
    ...(fontWeight && { fontWeight }),
    ...sx,
  };

  return (
    <Chip
      key={key}
      size={size}
      variant={variant}
      icon={icon}
      avatar={avatar}
      label={label}
      onClick={onClick}
      sx={chipStyles}
    />
  );
};

/**
 * Generate status chips based on document/directory properties
 * Regular function - memoization should be handled by the calling component
 */
export const renderStatusChips = ({
  isLocalOnly = false,
  isUploaded = false,
  isUpToDate = false,
  isCloudOnly = false,
  isPublished = false,
  isCollab = false,
  isPrivate = false,
  hasSortOrder = false,
  sortOrderValue = 0,
  documentStatus,
  author = null,
  showAuthor = true,
  chipSize = "small",
  chipVariant = "outlined",
  sortChipStyles = {},
  defaultChipStyles = {},
  statusChipCount,
}: StatusChipProps) => {
  // Generate status chips based on state
  const statusChips: React.ReactNode[] = [];

  // Add document status chip first (highest priority)
  if (documentStatus && documentStatus !== DocumentStatus.NEUTRAL) {
    if (documentStatus === DocumentStatus.ACTIVE) {
      statusChips.push(
        createChip({
          key: "active-status-chip",
          icon: <PlayArrow />,
          label: "Active",
          size: chipSize,
          variant: chipVariant,
          bgColor: "#e3f2fd", // Light blue background
          borderColor: "#2196f3", // Blue border
          textColor: "#1976d2", // Dark blue text
          fontWeight: "bold",
          ...defaultChipStyles,
        }),
      );
    } else if (documentStatus === DocumentStatus.DONE) {
      statusChips.push(
        createChip({
          key: "done-status-chip",
          icon: <CheckCircle />,
          label: "Done",
          size: chipSize,
          variant: chipVariant,
          bgColor: "#f5f5f5", // Light gray background
          borderColor: "#9e9e9e", // Gray border
          textColor: "#616161", // Dark gray text
          fontWeight: "bold",
          ...defaultChipStyles,
        }),
      );
    }
  }

  // Add status chips based on state
  if (isLocalOnly) {
    statusChips.push(
      createChip({
        key: "local-chip",
        icon: <MobileFriendly />,
        label: "Local",
        size: chipSize,
        variant: chipVariant,
        ...defaultChipStyles,
      }),
    );
  }

  if (isUploaded) {
    statusChips.push(
      createChip({
        key: "upload-chip",
        icon: isUpToDate ? <CloudDone /> : <CloudSync />,
        label: isUpToDate ? "Synced" : "Out of Sync",
        size: chipSize,
        variant: chipVariant,
        ...defaultChipStyles,
      }),
    );
  }

  if (isCloudOnly) {
    statusChips.push(
      createChip({
        key: "cloud-chip",
        icon: <Cloud />,
        label: "Cloud",
        size: chipSize,
        variant: chipVariant,
        ...defaultChipStyles,
      }),
    );
  }

  if (isPublished) {
    statusChips.push(
      createChip({
        key: "published-chip",
        icon: <Public />,
        label: "Published",
        size: chipSize,
        variant: chipVariant,
        ...defaultChipStyles,
      }),
    );
  }

  if (isCollab) {
    statusChips.push(
      createChip({
        key: "collab-chip",
        icon: <Workspaces />,
        label: "Collab",
        size: chipSize,
        variant: chipVariant,
        ...defaultChipStyles,
      }),
    );
  }

  if (isPrivate) {
    statusChips.push(
      createChip({
        key: "private-chip",
        icon: <Security />,
        label: "Private",
        size: chipSize,
        variant: chipVariant,
        ...defaultChipStyles,
      }),
    );
  }

  // Apply chip count limit
  const displayedStatusChips = statusChipCount
    ? statusChips.slice(0, statusChipCount)
    : statusChips;

  // Generate author chip
  const authorChip = (!showAuthor || !author) ? null : (
    <Chip
      key="author-chip"
      size={chipSize}
      variant={chipVariant}
      sx={{
        pointerEvents: "auto",
        padding: "2px 4px",
        "& .MuiChip-label": {
          padding: "0 4px",
          marginLeft: "1px", // Add more space between avatar and text
        },
        "& .MuiChip-avatar": {
          marginRight: 0, // Remove default right margin from avatar
        },
        ...defaultChipStyles.sx,
      }}
      avatar={
        <Avatar
          alt={author.name ?? "Local User"}
          src={author.image ?? undefined}
        />
      }
      label={author.name ?? "Local User"}
    />
  );

  // Generate sort order chip
  const sortOrderChip = !hasSortOrder ? null : createChip({
    key: "sort-order-chip",
    label: `Sort: ${sortOrderValue}`,
    size: chipSize,
    variant: chipVariant,
    bgColor: cardTheme.colors.sortChipBg,
    borderColor: "gray",
    textColor: "gray",
    fontWeight: "bold",
    ...sortChipStyles,
  });

  return (
    <>
      {displayedStatusChips}
      {authorChip}
      {sortOrderChip}
    </>
  );
};

/**
 * Render loading skeleton chips for cards in loading state
 * Regular function - memoization should be handled by the calling component
 */
export const renderSkeletonChips = ({
  count = 2,
  sizes = [50, 70],
  chipProps = {},
}: {
  count?: number;
  sizes?: number[];
  chipProps?: object;
}) => {
  // Generate skeleton chips
  const skeletonChips = Array.from({ length: count }).map((_, index) => (
    <Chip
      key={`skeleton-chip-${index}`}
      size="small"
      variant="outlined"
      label={<Skeleton variant="text" width={sizes[index % sizes.length]} />}
      sx={{
        padding: "2px 4px",
        "& .MuiChip-label": {
          padding: "0 4px",
        },
      }}
      {...chipProps}
    />
  ));

  return <>{skeletonChips}</>;
};
