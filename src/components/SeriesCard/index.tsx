"use client";
import * as React from "react";
import { Series, User } from "@/types";
import { memo } from "react";
import { SxProps, Theme } from "@mui/material/styles";
import SeriesCard from "./SeriesCard";

// Main component for rendering a series card
const SeriesCardSelector: React.FC<
  {
    seriesData?: Series;
    user?: User;
    sx?: SxProps<Theme>;
    cardConfig?: {
      minHeight?: string;
      showAuthor?: boolean;
      maxStatusChips?: number;
      showSortOrder?: boolean;
      showPermissionChips?: boolean;
    };
  }
> = memo(({ seriesData, user, sx = {}, cardConfig = {} }) => {
  // Apply default size to all cards
  const defaultSx: SxProps<Theme> = {
    width: "100%", // Make cards take full width of their grid cell
    height: "100%", // Make sure card takes full height
    margin: 0, // Reset margin to allow Grid spacing to work
    display: "flex",
    flexDirection: "column",
  };

  // Combine with any additional styles
  const combinedSx: SxProps<Theme> = { ...defaultSx, ...(sx as any) };

  // Early return for loading state
  if (!seriesData) {
    return (
      <SeriesCard
        series={undefined}
        user={user}
        sx={combinedSx}
        cardConfig={cardConfig}
      />
    );
  }

  return (
    <SeriesCard
      series={seriesData}
      user={user}
      sx={combinedSx}
      cardConfig={cardConfig}
    />
  );
});

// Set display name for debugging
SeriesCardSelector.displayName = "SeriesCardSelector";

export default SeriesCardSelector;
