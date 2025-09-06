"use client";
import * as React from "react";
import { ReactNode } from "react";
import { SxProps, Theme } from "@mui/material/styles";
import { Box, Card, CardActionArea } from "@mui/material";
import Link from "next/link";

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
 * Simple Blog Card Base Component
 * Clean, minimal design focused on content readability
 */
const CardBase: React.FC<SimplifiedCardBaseProps> = ({
  href,
  topContent,
  chipContent,
  actionContent,
  sx = {},
  ariaLabel = "Open post",
}) => {
  const cardStyles: SxProps<Theme> = {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    borderRadius: 2,
    backgroundColor: "background.paper",
    border: "1px solid",
    borderColor: "divider",
    overflow: "hidden",
    transition: "box-shadow 0.2s ease, border-color 0.2s ease",

    // Simple hover effects for blog cards
    "&:hover": {
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
      borderColor: "primary.light",
    },

    // Simple focus states
    "&:focus-within": {
      boxShadow: "0 0 0 2px rgba(25, 118, 210, 0.2)",
      borderColor: "primary.main",
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
        </Box>
        <Box sx={{ display: "flex", alignItems: "center" }}>
          {actionContent}
        </Box>
      </Box>
    </Card>
  );
};

export default CardBase;
