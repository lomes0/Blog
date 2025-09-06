"use client";
import * as React from "react";
import { ReactNode } from "react";
import { alpha, SxProps, Theme, useTheme } from "@mui/material/styles";
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
 * Modern BlogCard Base Component
 * Enhanced for contemporary blog design with improved aesthetics and UX
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

  // Modern blog card styles with enhanced visual appeal
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
    border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
    overflow: "hidden",

    // Simplified hover effects (no animations)
    "&:hover": {
      boxShadow: cardTheme.colors.shadow.hover,
      borderColor: alpha(theme.palette.primary.main, 0.3),
      backgroundColor: cardTheme.colors.hover.cardBackground,
    },

    // Enhanced focus states
    "&:focus-within": {
      boxShadow: cardTheme.colors.shadow.focus,
      outline: `${cardTheme.accessibility.focusRingWidth}px solid ${
        alpha(theme.palette.primary.main, 0.4)
      }`,
      outlineOffset: cardTheme.accessibility.focusRingOffset,
    },

    // Responsive design improvements
    [theme.breakpoints.down("md")]: {
      minHeight: "350px",
      borderRadius: 5, // Slightly less rounded on tablets
    },
    [theme.breakpoints.down("sm")]: {
      minHeight: "330px",
      borderRadius: 4, // Even less rounded on mobile
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
        {/* Enhanced content area with modern blog styling */}
        <Box
          className="content-area"
          sx={{
            flex: 1,
            width: "100%",
            position: "relative",
            display: "flex",
            flexDirection: "column",
            // Calculated height: total card height minus action bar height
            minHeight:
              `calc(${cardTheme.minHeight.post} - ${cardTheme.actionBar.totalHeight})`,
            padding: cardTheme.spacing.contentPadding,
            paddingBottom: cardTheme.spacing.sectionGap,
            overflow: "hidden",

            // Simplified image styling (no animations)
            "& .post-image": {
              borderRadius: cardTheme.image.borderRadius,
              overflow: "hidden",
            },

            // Better text rendering
            "& h1, & h2, & h3": {
              fontSize: cardTheme.typography.titleSize,
              fontWeight: cardTheme.typography.titleWeight,
              lineHeight: cardTheme.typography.titleLineHeight,
              color: cardTheme.colors.textPrimary,
              marginBottom: cardTheme.spacing.titleMargin,
            },

            "& p": {
              fontSize: cardTheme.typography.excerptSize,
              lineHeight: cardTheme.typography.excerptLineHeight,
              color: cardTheme.colors.textSecondary,
            },
          }}
        >
          {topContent}
        </Box>

        {/* Enhanced clickable area with better accessibility */}
        <Tooltip
          title={formattedTitle}
          enterDelay={prefersReducedMotion ? 0 : 500}
          placement="top"
          arrow
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
              bottom: cardTheme.actionBar.totalHeight, // Use theme value for consistency
              zIndex: 1,
              borderRadius:
                `${cardTheme.borderRadius}px ${cardTheme.borderRadius}px 0 0`,

              "&:hover": {
                backgroundColor: "transparent",
              },

              "&:focus-visible": {
                outline:
                  `${cardTheme.accessibility.focusRingWidth}px solid ${theme.palette.primary.main}`,
                outlineOffset: cardTheme.accessibility.focusRingOffset,
                borderRadius: cardTheme.borderRadius,
              },

              // Better touch targets on mobile
              [theme.breakpoints.down("sm")]: {
                "&:focus-visible": {
                  outline: `2px solid ${theme.palette.primary.main}`,
                },
              },
            }}
          />
        </Tooltip>

        {/* Modern blog action bar with enhanced design */}
        <Box
          sx={{
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            position: "relative",
            zIndex: 2,
          }}
        >
          <Box
            className="action-bar"
            sx={{
              px: cardTheme.spacing.contentPadding,
              py: 1.5, // Reduced padding (12px total)
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
              backgroundColor: "transparent", // No background
              height: cardTheme.actionBar.totalHeight, // Use theme value for consistency
              zIndex: 3,
              pointerEvents: "auto",
            }}
          >
            {/* Enhanced chips area with better spacing */}
            <Box
              sx={{
                display: "flex",
                gap: cardTheme.spacing.chipGap,
                overflow: "hidden",
                alignItems: "center",
                flex: "1 1 auto",
                minWidth: 0,
                flexWrap: "wrap",

                // Simplified chip styling (no animations)
                "& .MuiChip-root": {
                  // No hover effects
                },
              }}
            >
              {chipContent}
            </Box>

            {/* Enhanced actions area */}
            <Box
              sx={{
                display: "flex",
                ml: "auto",
                gap: 0.5, // Reduced gap for tighter spacing
                mr: 0, // Minimal margin to move icons closer to the right edge

                "& button": {
                  minWidth: cardTheme.accessibility.minimumTouchTarget,
                  minHeight: cardTheme.accessibility.minimumTouchTarget,
                  padding: 1,
                  borderRadius: 2,

                  // Simplified button styles (no animations)
                  "&:hover": {
                    backgroundColor: alpha(theme.palette.primary.main, 0.08),
                  },

                  "&:focus-visible": {
                    outline: `2px solid ${theme.palette.primary.main}`,
                    outlineOffset: 2,
                  },
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
