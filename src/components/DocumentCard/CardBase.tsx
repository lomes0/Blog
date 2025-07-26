"use client";
import * as React from "react";
import { ReactNode } from "react";
import { SxProps, Theme, useTheme } from "@mui/material/styles";
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Fade,
  Skeleton,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import Link from "next/link";
import { cardTheme } from "./theme";
import { DocumentStatus } from "@/types";

interface CardBaseProps {
  /** Title of the card - can be a string or React node (like a Skeleton) */
  title: string | ReactNode;

  /** URL that the card links to */
  href: string;

  /** Whether the card is in a loading state */
  isLoading?: boolean;

  /** Content to display in the top section of the card */
  topContent: ReactNode;

  /** Content to display in the chip area (bottom left) */
  chipContent: ReactNode;

  /** Content to display in the actions area (bottom right) */
  actionContent: ReactNode;

  /** Document status for visual styling */
  documentStatus?: DocumentStatus;

  /** Height of the card - defaults to 260px if not specified */
  minHeight?: string;

  /** Additional styles to apply to the card */
  sx?: SxProps<Theme>;

  /** CSS class name for the card */
  className?: string;

  /** Accessible label for the card */
  ariaLabel?: string;

  /** Additional props for the card content area */
  contentProps?: {
    /** Padding for the title area */
    titlePadding?: {
      top?: number;
      bottom?: number;
      left?: number;
      right?: number;
    };
    /** Whether to display a space below the title */
    showSubheaderSpace?: boolean;
    /** Height of the space below the title */
    subheaderSpaceHeight?: string;
  };

  /** Additional props for the action bar */
  actionBarProps?: {
    /** Height of the action bar */
    height?: string;
    /** Padding for the action bar */
    padding?: {
      x?: number;
      y?: number;
    };
  };

  /** Optional subtitle or description */
  subtitle?: string | ReactNode;
}

/**
 * Shared base component for both DocumentCard and DirectoryCard
 * to ensure consistent styling and behavior
 */
const CardBase: React.FC<CardBaseProps> = ({
  title,
  href,
  isLoading = false,
  topContent,
  chipContent,
  actionContent,
  documentStatus = DocumentStatus.NEUTRAL,
  minHeight = cardTheme.minHeight.document,
  sx = {},
  className = "card-base",
  ariaLabel = "Open item",
  contentProps = {},
  actionBarProps = {},
  subtitle,
}) => {
  const theme = useTheme();
  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
  );

  // Check if we should show the title section
  const shouldShowTitle = Boolean(
    title && (
      (typeof title === "string" && title.trim().length > 0) ||
      (typeof title !== "string")
    ),
  );

  // Default values for content area
  const {
      titlePadding = {
        top: cardTheme.spacing.titleMargin,
        bottom: cardTheme.spacing.titleMargin,
        left: cardTheme.spacing.contentPadding,
        right: cardTheme.spacing.contentPadding,
      },
      showSubheaderSpace = true,
      subheaderSpaceHeight = "12px", // Increased for better visual rhythm
    } = contentProps,
    // Default values for action bar
    {
      height = cardTheme.actionBar.height,
      padding = {
        x: cardTheme.spacing.contentPadding,
        y: 1.5, // Slightly more vertical padding
      },
    } = actionBarProps,
    // Calculate the height of the top section based on whether there's a title
    topSectionHeight = shouldShowTitle
      ? cardTheme.contentRatio.top
      : "calc(100% - 56px)", // Use fixed height for action bar when no title
    bottomSectionHeight = shouldShowTitle
      ? cardTheme.contentRatio.bottom
      : "56px"; // Fixed height for action bar

  // Create a formatted title that's safe for tooltips
  const formattedTitle = typeof title === "string" ? title : "Document";

  // Status-based styling
  const getStatusStyles = () => {
    switch (documentStatus) {
      case DocumentStatus.ACTIVE:
        return {
          borderColor: "#ff9800",
          borderWidth: 2,
          backgroundColor: "#fffbf0", // Light yellow background
          boxShadow: "0 2px 8px rgba(255, 152, 0, 0.1)",
          "&:hover": {
            borderColor: "#f57c00",
            backgroundColor: "#fff8e1", // Slightly deeper yellow on hover
            boxShadow: "0 4px 12px rgba(255, 152, 0, 0.15)",
          },
        };
      case DocumentStatus.DONE:
        return {
          borderColor: "#9e9e9e",
          borderWidth: 2,
          backgroundColor: "#f5f5f5", // Gray background
          boxShadow: "0 2px 8px rgba(158, 158, 158, 0.1)",
          filter: "grayscale(20%)", // Add slight grayscale effect
          "&:hover": {
            borderColor: "#757575",
            backgroundColor: "#eeeeee", // Slightly deeper gray on hover
            boxShadow: "0 4px 12px rgba(158, 158, 158, 0.15)",
            filter: "grayscale(10%)", // Less grayscale on hover
          },
        };
      default:
        return {
          borderColor: cardTheme.colors.border,
          borderWidth: 1,
        };
    }
  };

  // Dynamic styles based on user preferences
  const animationStyles = prefersReducedMotion
    ? cardTheme.accessibility.reducedMotion
    : {
      transition: cardTheme.animation.transition,
      "&:hover": {
        transform: cardTheme.animation.hoverTransform,
        boxShadow: cardTheme.colors.shadow.hover,
      },
      "&:focus-within": {
        transform: cardTheme.animation.focusTransform,
      },
    };

  return (
    <Fade in={true} timeout={prefersReducedMotion ? 0 : 300}>
      <Card
        variant="outlined"
        className={className}
        sx={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height: "100%",
          minHeight,
          maxWidth: cardTheme.maxWidth,
          width: "100%",
          position: "relative",
          borderRadius: cardTheme.borderRadius,
          ...getStatusStyles(),
          backgroundColor: getStatusStyles().backgroundColor ||
            cardTheme.colors.cardBackground,
          boxShadow: getStatusStyles().boxShadow ||
            cardTheme.colors.shadow.default,
          ...animationStyles,
          "&:focus-within": {
            boxShadow: cardTheme.colors.shadow.focus,
            outline:
              `${cardTheme.accessibility.focusRingWidth}px solid ${theme.palette.primary.main}`,
            outlineOffset: cardTheme.accessibility.focusRingOffset,
            ...(!prefersReducedMotion && {
              transform: cardTheme.animation.focusTransform,
            }),
          },
          // Improve accessibility for high contrast mode
          "@media (prefers-contrast: high)": {
            borderWidth: 2,
            borderColor: "text.primary",
          },
          // Responsive adjustments
          [theme.breakpoints.down("sm")]: {
            minHeight: "clamp(240px, 15vw, 280px)",
          },
          ...sx,
        }}
      >
        {/* Top section */}
        <Box
          sx={{
            height: topSectionHeight,
            width: "100%",
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: getStatusStyles().backgroundColor || "background.paper",
            py: 2.5, // Add vertical padding to create space from top/bottom edges
            ...(shouldShowTitle && {
              borderBottom: "1px solid",
              borderColor: cardTheme.colors.border,
            }),
            // Ensure minimum touch target size for accessibility
            minHeight:
              `max(${cardTheme.accessibility.minimumTouchTarget}px, calc(${minHeight} * ${
                parseFloat(topSectionHeight) / 100
              }))`,
          }}
        >
          {topContent}
        </Box>

        {/* Clickable area */}
        <Tooltip
          title={formattedTitle}
          enterDelay={prefersReducedMotion ? 0 : 700}
          placement="top"
          aria-hidden={true} // Hide from screen readers to avoid redundancy
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
              bottom: height,
              zIndex: 1,
              borderRadius:
                `${cardTheme.borderRadius}px ${cardTheme.borderRadius}px 0 0`,
              "&:hover": {
                backgroundColor: "transparent",
              },
              "&:focus-visible": {
                boxShadow: `0 0 0 2px ${theme.palette.primary.main}`,
                borderRadius: cardTheme.borderRadius,
              },
              // Improve touch targets for mobile
              minHeight: cardTheme.accessibility.minimumTouchTarget,
            }}
          />
        </Tooltip>

        {/* Bottom section */}
        <Box
          sx={{
            height: bottomSectionHeight,
            display: "flex",
            flexDirection: "column",
            position: "relative",
            zIndex: 2,
          }}
        >
          {shouldShowTitle && (
            <CardContent
              sx={{
                pt: titlePadding.top,
                pb: titlePadding.bottom,
                pl: titlePadding.left,
                pr: titlePadding.right,
                flexGrow: 1,
                display: "flex",
                alignItems: "center", // Vertically center all content
                position: "relative",
                overflow: "hidden", // Prevent overflow issues
                bgcolor: getStatusStyles().backgroundColor || "transparent",
                // Better responsive padding
                [theme.breakpoints.down("sm")]: {
                  px: 1.5,
                  py: 1,
                },
              }}
            >
              <Box
                sx={{
                  width: "100%",
                  textAlign: "left", // Keep text left-aligned within the centered box
                }}
              >
                {typeof title === "string"
                  ? (
                    <Tooltip
                      title={title}
                      enterDelay={prefersReducedMotion ? 0 : 1000}
                      placement="top"
                      aria-hidden={true} // Hide from screen readers to avoid redundancy
                    >
                      <Typography
                        variant="h6"
                        component="div"
                        sx={{
                          fontWeight: cardTheme.typography.titleWeight,
                          fontSize: cardTheme.typography.titleSize,
                          lineHeight: cardTheme.typography.titleLineHeight,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          mb: subtitle || showSubheaderSpace ? 1 : 0,
                          // Responsive font sizing
                          [theme.breakpoints.down("sm")]: {
                            fontSize: "1rem",
                          },
                        }}
                      >
                        {title}
                      </Typography>
                    </Tooltip>
                  )
                  : (
                    <Typography
                      variant="h6"
                      component="div"
                      sx={{
                        fontWeight: cardTheme.typography.titleWeight,
                        fontSize: cardTheme.typography.titleSize,
                        lineHeight: cardTheme.typography.titleLineHeight,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        mb: subtitle || showSubheaderSpace ? 1 : 0,
                        // Responsive font sizing
                        [theme.breakpoints.down("sm")]: {
                          fontSize: "1rem",
                        },
                      }}
                    >
                      {title}
                    </Typography>
                  )}

                {subtitle && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      fontSize: cardTheme.typography.subtitleSize,
                      lineHeight: cardTheme.typography.subtitleLineHeight,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      mb: 1,
                      // Responsive font sizing
                      [theme.breakpoints.down("sm")]: {
                        fontSize: "0.75rem",
                      },
                    }}
                  >
                    {subtitle}
                  </Typography>
                )}

                {!subtitle && showSubheaderSpace &&
                  (isLoading
                    ? <Skeleton variant="text" width={150} height={20} />
                    : <Box sx={{ height: subheaderSpaceHeight }} />)}
              </Box>
            </CardContent>
          )}

          <Box
            sx={{
              px: padding.x,
              py: padding.y,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid",
              borderColor: cardTheme.colors.border,
              backgroundColor: getStatusStyles().backgroundColor ||
                "transparent",
              zIndex: 3,
              height,
              minHeight: cardTheme.actionBar.minHeight,
              mt: "auto",
              "& button:first-of-type": { ml: "auto !important" },
              "& .MuiChip-root:last-of-type": { mr: 1 },
              pointerEvents: "auto",
              // Responsive padding
              [theme.breakpoints.down("sm")]: {
                px: 1.5,
                py: 1,
              },
            }}
          >
            <Box
              sx={{
                display: "flex",
                gap: cardTheme.spacing.chipGap,
                flexWrap: "nowrap",
                overflow: "hidden",
                alignItems: "center",
                flex: "1 1 auto",
                minWidth: 0, // Allow flex shrinking
              }}
            >
              {chipContent}
            </Box>

            <Box
              sx={{
                display: "flex",
                ml: "auto",
                gap: 0.5, // Add gap between action buttons
                "& button": {
                  minWidth: cardTheme.accessibility.minimumTouchTarget,
                  minHeight: cardTheme.accessibility.minimumTouchTarget,
                  transition: prefersReducedMotion
                    ? "none"
                    : "transform 0.2s ease-in-out",
                  "&:hover": !prefersReducedMotion
                    ? {
                      transform: "scale(1.1)",
                    }
                    : {},
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
