"use client";
import * as React from "react";
import { ReactNode } from "react";
import { SxProps, Theme, useTheme } from "@mui/material/styles";
import {
  Box,
  Card,
  CardActionArea,
  Fade,
  Tooltip,
  useMediaQuery,
} from "@mui/material";
import Link from "next/link";
import { cardTheme } from "./theme";

/**
 * Simplified props interface for blog posts
 */
interface SimplifiedCardBaseProps {
  /** Title of the post (optional, used for tooltip) */
  title?: string | ReactNode;
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
  /** Additional styles */
  sx?: SxProps<Theme>;
  /** Accessible label */
  ariaLabel?: string;
}

/**
 * Simplified CardBase for blog posts
 * Removes complex configuration options while keeping core functionality
 */
const CardBase: React.FC<SimplifiedCardBaseProps> = ({
  title,
  href,
  isLoading = false,
  topContent,
  chipContent,
  actionContent,
  sx = {},
  ariaLabel = "Open post",
}) => {
  const theme = useTheme();
  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
  );

  // Format title for tooltips
  const formattedTitle = typeof title === "string" ? title : "Post";

  // Blog-oriented card styles with subtle interactions
  const cardStyles = {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: cardTheme.minHeight.post,
    maxHeight: cardTheme.maxHeight?.post,
    width: "100%",
    position: "relative",
    borderRadius: cardTheme.borderRadius,
    backgroundColor: cardTheme.colors.cardBackground,
    boxShadow: cardTheme.colors.shadow.default,
    border: `1px solid ${theme.palette.divider}`,
    overflow: "hidden",
    transition: theme.transitions.create([
      'box-shadow', 
      'transform', 
      'border-color'
    ], {
      duration: theme.transitions.duration.standard,
    }),
    "&:hover": !prefersReducedMotion ? {
      transform: "translateY(-4px)",
      boxShadow: cardTheme.colors.shadow.hover,
      borderColor: theme.palette.primary.light,
    } : {},
    "&:focus-within": {
      boxShadow: cardTheme.colors.shadow.focus,
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: "2px",
    },
    // Responsive adjustments for blog layout
    [theme.breakpoints.down("md")]: {
      minHeight: "340px",
    },
    [theme.breakpoints.down("sm")]: {
      minHeight: "320px",
    },
    ...sx,
  };

  return (
    <Fade in={true} timeout={prefersReducedMotion ? 0 : 300}>
      <Card
        variant="outlined"
        className="post-card-base"
        sx={{
          ...cardStyles,
        } as SxProps<Theme>}
      >
        {/* Top content area - optimized for blog content */}
        <Box
          sx={{
            flex: 1,
            width: "100%",
            position: "relative",
            display: "flex",
            flexDirection: "column",
            minHeight: "240px", // Adequate height for blog content
            padding: cardTheme.spacing.contentPadding,
            paddingBottom: cardTheme.spacing.sectionGap,
          }}
        >
          {topContent}
        </Box>

        {/* Clickable area for navigation */}
        <Tooltip
          title={formattedTitle}
          enterDelay={prefersReducedMotion ? 0 : 700}
          placement="top"
        >
          <CardActionArea
            component={Link}
            href={href}
            prefetch={false}
            aria-label={ariaLabel}
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: cardTheme.actionBar.height, // Leave space for action bar
              zIndex: 1,
              borderRadius:
                `${cardTheme.borderRadius}px ${cardTheme.borderRadius}px 0 0`,
              "&:hover": {
                backgroundColor: "transparent",
              },
              "&:focus-visible": {
                outline: `2px solid ${theme.palette.primary.main}`,
                outlineOffset: 2,
              },
            }}
          />
        </Tooltip>

        {/* Bottom section - Action bar only */}
        <Box
          sx={{
            flexShrink: 0, // Don't shrink
            display: "flex",
            flexDirection: "column",
            position: "relative",
            zIndex: 2,
          }}
        >
          {/* Blog-style action bar */}
          <Box
            sx={{
              px: cardTheme.spacing.contentPadding,
              py: 2, // More generous padding for blog layout
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid",
              borderColor: "divider",
              backgroundColor: theme.palette.background.default,
              minHeight: "72px", // Adequate height for blog metadata
              zIndex: 3,
              pointerEvents: "auto",
            }}
          >
            {/* Chips area */}
            <Box
              sx={{
                display: "flex",
                gap: cardTheme.spacing.chipGap,
                overflow: "hidden",
                alignItems: "center",
                flex: "1 1 auto",
                minWidth: 0,
                flexWrap: "wrap", // Allow wrapping on smaller screens
              }}
            >
              {chipContent}
            </Box>

            {/* Actions area */}
            <Box
              sx={{
                display: "flex",
                ml: "auto",
                gap: 0.5, // Slightly larger gap for blog actions
                mr: -0.5,
                "& button": {
                  minWidth: 40, // Slightly larger for better touch targets
                  minHeight: 40,
                  padding: 0.75,
                },
              }}
            >
              {actionContent}
            </Box>
          </Box>
        </Box>
      </Card>
    </Fade>
  );
};

export default CardBase;
