"use client";
import * as React from "react";
import { ReactNode } from "react";
import { alpha, SxProps, Theme } from "@mui/material/styles";
import { Box, Card, CardActionArea, Tooltip } from "@mui/material";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { DocumentStatus } from "@/types";
import { ICON_SIZE } from "@/theme/icons";

/**
 * Simplified props interface for blog posts
 */
interface SimplifiedCardBaseProps {
  /** URL that the card links to */
  href: string;
  /** Whether the card is in a loading state */
  isLoading?: boolean;
  /** Content to display in the top section */
  topContent: ReactNode;
  /** Chip content for the bottom */
  chipContent: ReactNode;
  /** Action buttons for the bottom right */
  actionContent: ReactNode;
  /** Status of the document (affects visual styling) */
  status?: DocumentStatus;
  /** Whether local version is ahead of cloud (unsaved to cloud) */
  isDirty?: boolean;
  /** Additional styles */
  sx?: SxProps<Theme>;
  /** Accessible label */
  ariaLabel?: string;
}

/**
 * Simple Blog Card Base Component
 * Clean, minimal design focused on content readability
 */
const CardBase: React.FC<SimplifiedCardBaseProps> = ({
  href,
  topContent,
  chipContent,
  actionContent,
  status,
  isDirty,
  sx = {},
  ariaLabel = "Open post",
}) => {
  const isDone = status === DocumentStatus.DONE;

  const cardStyles: SxProps<Theme> = {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    borderRadius: 2,
    backgroundColor: "background.paper",
    border: "2px solid",
    // A done card is marked by a stronger neutral border than `divider`.
    // That was `grey.800`/`grey.600`, but MUI's grey scale is spread outside
    // the light/dark blocks and so is the same in both schemes: #424242 is
    // *darker* than the dark-mode paper it sits on, which inverted the signal
    // — done cards read as borderless while active ones kept a visible
    // `divider`. text.secondary/text.disabled are within a few points of the
    // old greys in light and step the right way in dark.
    borderColor: isDone ? "text.secondary" : "divider",
    overflow: "hidden",
    transition: "box-shadow 0.2s ease, border-color 0.2s ease",

    // Simple hover effects for blog cards
    "&:hover": {
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
      borderColor: isDone ? "text.disabled" : "primary.light",
    },

    // Simple focus states
    "&:focus-within": {
      boxShadow: (theme: Theme) =>
        `0 0 0 2px ${alpha(theme.palette.primary.main, 0.2)}`,
      borderColor: isDone ? "text.disabled" : "primary.main",
    },

    ...sx,
  };

  return (
    <Card
      variant="outlined"
      className="post-card-base"
      sx={cardStyles}
    >
      {/* Main clickable content area */}
      <CardActionArea
        component={Link}
        href={href}
        prefetch={false}
        aria-label={ariaLabel}
        sx={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          alignItems: "stretch",
          "&:hover": {
            backgroundColor: "transparent",
          },
        }}
      >
        {topContent}
      </CardActionArea>

      {/* Simple action bar at bottom */}
      <Box
        sx={{
          px: 2,
          py: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: "1px solid",
          borderColor: "divider",
          backgroundColor: "background.default",
          minHeight: 48,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {chipContent}
          {isDirty && (
            <Tooltip title="Unsaved changes" arrow placement="top">
              <Pencil
                size={ICON_SIZE.inline}
                style={{
                  color: "var(--mui-palette-primary-main)",
                  opacity: 0.75,
                  flexShrink: 0,
                }}
              />
            </Tooltip>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center" }}>
          {actionContent}
        </Box>
      </Box>
    </Card>
  );
};

export default CardBase;
