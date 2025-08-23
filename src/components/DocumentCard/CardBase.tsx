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
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import Link from "next/link";
import { cardTheme } from "./theme";

/**
 * Simplified props interface for blog posts
 */
interface SimplifiedCardBaseProps {
  /** Title of the post */
  title: string | ReactNode;
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

  // Check if we should show the title
  const shouldShowTitle = Boolean(
    title && (
      (typeof title === "string" && title.trim().length > 0) ||
      (typeof title !== "string")
    ),
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
          maxWidth: cardTheme.maxWidth,
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
        {/* Top content area (70%) */}
        <Box
          sx={{
            height: cardTheme.contentRatio.top,
            width: "100%",
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            py: 2,
            ...(shouldShowTitle && {
              borderBottom: "1px solid",
              borderColor: "divider",
            }),
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
              bottom: cardTheme.actionBar.height,
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

        {/* Bottom section (30%) */}
        <Box
          sx={{
            height: cardTheme.contentRatio.bottom,
            display: "flex",
            flexDirection: "column",
            position: "relative",
            zIndex: 2,
          }}
        >
          {/* Title area */}
          {shouldShowTitle && (
            <CardContent
              sx={{
                pt: cardTheme.spacing.titleMargin,
                pb: cardTheme.spacing.titleMargin,
                px: cardTheme.spacing.contentPadding,
                flexGrow: 1,
                display: "flex",
                alignItems: "center",
                "&:last-child": { pb: cardTheme.spacing.titleMargin },
              }}
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
                  width: "100%",
                }}
              >
                {title}
              </Typography>
            </CardContent>
          )}

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
                gap: 0.5,
                "& button": {
                  minWidth: cardTheme.accessibility.minimumTouchTarget,
                  minHeight: cardTheme.accessibility.minimumTouchTarget,
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
