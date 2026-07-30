import React from "react";
import NextLink from "next/link";
import { Avatar, Chip, Skeleton } from "@mui/material";
import { BookOpen, Pencil, User as UserIcon } from "lucide-react";
import { DocumentStatus, Series, User } from "@/types";
import { createCardTheme } from "./theme";
import { ICON_SIZE } from "@/theme/icons";
import { MOTION, raisedShadow, SHADOW } from "@/theme/tokens";

/**
 * Simplified post state for blog
 */
export interface PostState {
  isDraft: boolean;
  isPublished: boolean;
  isLoading: boolean;
  documentStatus?: DocumentStatus; // Add document status
}

/**
 * Create modern status chip based on post state
 */
export const createStatusChip = (postState: PostState) => {
  if (postState.isLoading) return null;

  // Only show draft status, no status chip for published posts
  if (postState.isDraft) {
    return (
      <Chip
        key="draft-chip"
        size="small"
        variant="filled"
        icon={<Pencil size={ICON_SIZE.inline} />}
        label="Draft"
        sx={(theme) => {
          const ct = createCardTheme(theme);
          return {
            background: ct.colors.status.draft.bg,
            borderColor: ct.colors.status.draft.border,
            color: ct.colors.status.draft.text,
            fontWeight: 600,
            fontSize: ct.typography.metaSize,
            height: 28,
            "& .MuiChip-icon": { color: ct.colors.status.draft.icon },
            "&:hover": { background: ct.colors.status.draft.bg },
          };
        }}
      />
    );
  }

  // No chip for published posts
  return null;
};

/**
 * Modern author chip - Pill Capsule with Soft Shadow
 * Clean, tactile design with micro-shadows and hover lift effect
 */
export const createAuthorChip = (author?: User | null, showAuthor = true) => {
  if (!showAuthor || !author) return null;

  return (
    <Chip
      key="author-chip"
      size="small"
      component="a"
      href="/dashboard"
      clickable
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      aria-label={`View ${author.name ?? "author"}'s profile`}
      avatar={
        <Avatar
          alt={author.name ?? "User"}
          src={author.image ?? undefined}
          sx={{
            width: 24,
            height: 24,
            fontSize: "0.75rem",
            fontWeight: 500,
            border: (theme) => `2px solid ${theme.palette.background.paper}`,
            boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
          }}
        >
          {!author.image && <UserIcon size={ICON_SIZE.inline} />}
        </Avatar>
      }
      label={author.name ?? "User"}
      sx={(theme) => ({
        height: 32,
        borderRadius: "9999px",
        border: "1px solid transparent",
        overflow: "hidden",
        position: "relative",
        background: "rgba(0, 0, 0, 0.03)",
        boxShadow: SHADOW.raised.light,
        ...theme.applyStyles("dark", {
          background: "rgba(255, 255, 255, 0.06)",
          boxShadow: SHADOW.raised.dark,
        }),
        color: "text.secondary",
        fontWeight: 500,
        typography: "dense",
        letterSpacing: "0.01em",
        textDecoration: "none",
        cursor: "pointer",
        transition: `all ${MOTION.base}ms ${MOTION.easing}`,
        outline: "none",
        WebkitTapHighlightColor: "transparent",

        // Disable MUI's internal hover overlay (the cause of square corners)
        "&::before": {
          display: "none",
        },
        "&::after": {
          display: "none",
        },

        "& .MuiChip-label": {
          padding: "0 12px 0 6px",
          lineHeight: 1.2,
        },
        "& .MuiChip-avatar": {
          marginLeft: "4px",
          marginRight: 0,
          width: 24,
          height: 24,
        },
        // Completely hide touch ripple to prevent any rectangular effects
        "& .MuiTouchRipple-root": {
          display: "none",
        },
        // Fix for MUI's internal hover overlay (focusVisible and clickable hover)
        "& .MuiChip-action": {
          borderRadius: "inherit",
        },
        // Override MUI's clickable chip hover background
        "&.MuiChip-clickable": {
          "&:hover": {
            background: "rgba(0, 0, 0, 0.05)",
            ...theme.applyStyles("dark", {
              background: "rgba(255, 255, 255, 0.1)",
            }),
          },
        },
        // Override any ButtonBase focus styling
        "&.MuiButtonBase-root": {
          "&:focus": {
            outline: "none",
          },
        },

        "&:hover": {
          background: "rgba(0, 0, 0, 0.05)",
          ...theme.applyStyles("dark", {
            background: "rgba(255, 255, 255, 0.1)",
          }),
          borderColor: "rgba(var(--mui-palette-primary-mainChannel) / 0.5)", // Unified hover border (primary)
          color: "text.primary",
        },

        "&:active": {
          borderColor: "rgba(var(--mui-palette-primary-mainChannel) / 0.7)", // Unified hover border (primary, active)
        },

        "&:focus-visible": {
          outline: "none",
          boxShadow: (theme) =>
            `0 0 0 2px ${theme.palette.background.paper}, 0 0 0 4px ${theme.palette.primary.main}`,
        },

        "&:focus:not(:focus-visible)": {
          outline: "none",
          ...raisedShadow(theme),
        },
      })}
    />
  );
};

/**
 * Create modern series chip with enhanced navigation
 */
export const createSeriesChip = (
  series?: Series | null,
  seriesOrder?: number | null,
  showSeries = true,
) => {
  if (!showSeries || !series) return null;

  const label = seriesOrder
    ? `${series.title} (#${seriesOrder})`
    : series.title;

  return (
    <Chip
      key="series-chip"
      component={NextLink}
      href={`/posts/${series.id}`}
      size="small"
      variant="filled"
      clickable
      icon={<BookOpen size={ICON_SIZE.inline} />}
      label={label}
      sx={(theme) => {
        const ct = createCardTheme(theme);
        return {
          background: ct.colors.series.bg,
          borderColor: ct.colors.series.border,
          color: ct.colors.series.text,
          fontWeight: 600,
          fontSize: ct.typography.metaSize,
          height: 28,
          textDecoration: "none",
          "& .MuiChip-icon": { color: ct.colors.series.icon },
          "&:hover": { background: ct.colors.series.bg },
        };
      }}
    />
  );
};

/**
 * Render loading skeleton chips
 */
export const renderSkeletonChips = (count = 2) => {
  const skeletonChips = Array.from({ length: count }).map((_, index) => (
    <Chip
      key={`skeleton-chip-${index}`}
      size="small"
      variant="outlined"
      label={<Skeleton variant="text" width={index === 0 ? 60 : 80} />}
      sx={{
        "& .MuiChip-label": {
          padding: "0 4px",
        },
      }}
    />
  ));

  return <>{skeletonChips}</>;
};
