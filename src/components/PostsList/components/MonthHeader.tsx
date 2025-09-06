import React from "react";
import { Box, Chip, Typography } from "@mui/material";
import { CalendarMonth } from "@mui/icons-material";

interface MonthHeaderProps {
  monthLabel: string;
  postCount: number;
  monthKey?: string;
}

/**
 * Header component for each month section showing the month and post count
 * Format: "January 2024" with count chip
 */
const MonthHeader: React.FC<MonthHeaderProps> = (
  { monthLabel, postCount, monthKey },
) => {
  const headerId = monthKey ? `month-header-${monthKey}` : undefined;

  return (
    <Box
      sx={{
        mb: 4,
        display: "flex",
        alignItems: "center",
        gap: 2,
        flexWrap: "wrap",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <CalendarMonth
          sx={{
            fontSize: 28,
            color: "primary.main",
            opacity: 0.8,
          }}
          aria-hidden="true"
        />
        <Typography
          id={headerId}
          variant="h2"
          component="h2"
          sx={{
            fontSize: { xs: "1.5rem", sm: "1.75rem", md: "2rem" },
            fontWeight: 600,
            color: "text.primary",
            letterSpacing: "-0.025em",
          }}
        >
          {monthLabel}
        </Typography>
      </Box>

      {
        /* <Chip
        label={`${postCount} ${postCount === 1 ? "post" : "posts"}`}
        size="medium"
        variant="outlined"
        aria-label={`${postCount} posts in ${monthLabel}`}
        sx={{
          fontWeight: 500,
          borderColor: "primary.main",
          backgroundColor: "primary.main",
          color: "primary.contrastText",
          "& .MuiChip-label": {
            px: 1.5
          }
        }}
      /> */
      }
    </Box>
  );
};

export default MonthHeader;
