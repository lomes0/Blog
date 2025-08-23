"use client";
import * as React from "react";
import { Series, User } from "@/types";
import { Box, Typography } from "@mui/material";
import Grid from "@mui/material/Grid2";
import SeriesCardSelector from "../SeriesCard";

interface SeriesListProps {
  series: Series[];
  user?: User;
  title?: string;
  emptyMessage?: string;
}

/**
 * Series list component for displaying a list of series
 * Uses vertical layout with larger cards
 */
const SeriesList: React.FC<SeriesListProps> = ({
  series,
  user,
  title = "Series",
  emptyMessage = "No series found",
}) => {
  if (series.length === 0) {
    return (
      <Box sx={{ textAlign: "center", py: 4 }}>
        <Typography variant="h6" color="text.secondary">
          {emptyMessage}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {title && (
        <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>
          {title}
        </Typography>
      )}

      <Grid container spacing={2} sx={{ width: "100%" }}>
        {series.map((seriesItem) => (
          <Grid
            key={seriesItem.id}
            size={{ xs: 12, sm: 6, md: 4, lg: 3 }}
          >
            <SeriesCardSelector
              seriesData={seriesItem}
              user={user}
              cardConfig={{
                showAuthor: true,
                showPermissionChips: false,
                showSortOrder: false,
              }}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default SeriesList;
