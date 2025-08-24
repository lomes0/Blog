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

  // Animation styles
  const animationStyles = prefersReducedMotion ? {} : {
    transition: cardTheme.animation.transition,
    "&:hover": {
      transform: cardTheme.animation.hoverTransform,
      boxShadow: cardTheme.colors.shadow.hover,
    },
  };

  return (
    <Fade in={true} timeout={prefersReducedMotion ? 0 : 300}>
      <Card
        variant="outlined"
        className="post-card-base"
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: cardTheme.minHeight.post,
          // Removed maxWidth constraint to allow card to fill available space
          width: "100%",
          position: "relative",
          borderRadius: cardTheme.borderRadius,
          backgroundColor: cardTheme.colors.cardBackground,
          boxShadow: cardTheme.colors.shadow.default,
          ...animationStyles,
          "&:focus-within": {
            boxShadow: cardTheme.colors.shadow.focus,
            outline:
              `${cardTheme.accessibility.focusRingWidth}px solid ${theme.palette.primary.main}`,
            outlineOffset: "2px",
          },
          // Responsive adjustments
          [theme.breakpoints.down("sm")]: {
            minHeight: "260px",
          },
          ...sx,
        }}
      >
        {/* Top content area - flexible height */}
        <Box
          sx={{
            flex: 1, // Take up remaining space
            width: "100%",
            position: "relative",
            display: "flex",
            alignItems: "stretch", // Stretch children to full height
            justifyContent: "center",
            minHeight: "200px", // Minimum height for content
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
          {/* Action bar */}
          <Box
            sx={{
              px: cardTheme.spacing.contentPadding,
              py: 1.5,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid",
              borderColor: "divider",
              height: cardTheme.actionBar.height,
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
              }}
            >
              {chipContent}
            </Box>

            {/* Actions area */}
            <Box
              sx={{
                display: "flex",
                ml: "auto",
                gap: 0.25, // Reduced gap between buttons (2px instead of 4px)
                mr: -0.5, // Move buttons slightly more to the right
                "& button": {
                  minWidth: 36, // Reduced from 44px to make them more compact
                  minHeight: 36, // Reduced from 44px to make them more compact
                  padding: 0.5, // Reduced padding inside buttons
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
