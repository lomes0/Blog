import React from "react";
import { Box, Chip, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { CalendarMonth, TrendingUp } from "@mui/icons-material";

interface MonthHeaderProps {
  monthLabel: string;
  postCount: number;
  monthKey?: string;
  isLatest?: boolean;
}

/**
 * Header component for each month section showing the month
 * Clean, minimal design focused on the month name
 */
const MonthHeader: React.FC<MonthHeaderProps> = (
  { monthLabel, postCount, monthKey, isLatest = false },
) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const headerId = monthKey ? `month-header-${monthKey}` : undefined;

  return (
    <Box
      sx={{
        mb: 4,
        display: "flex",
        alignItems: "center",
        gap: 2,
        flexWrap: "wrap",
        position: "relative",
        // Add subtle animation
        animation: isLatest ? "slideInFromLeft 0.5s ease-out" : "none",
        "@keyframes slideInFromLeft": {
          "0%": {
            opacity: 0,
            transform: "translateX(-20px)",
          },
          "100%": {
            opacity: 1,
            transform: "translateX(0)",
          },
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        {/* Month icon with latest indicator */}
        <Box
          sx={{
            position: "relative",
            display: "flex",
            alignItems: "center",
          }}
        >
          <CalendarMonth
            sx={{
              fontSize: 28,
              color: isLatest ? "primary.main" : "text.secondary",
              opacity: isLatest ? 1 : 0.8,
              transition: "all 0.3s ease",
            }}
            aria-hidden="true"
          />
          {/* Latest indicator */}
          {isLatest && (
            <TrendingUp
              sx={{
                position: "absolute",
                top: -4,
                right: -4,
                fontSize: 12,
                color: "success.main",
                bgcolor: "background.paper",
                borderRadius: "50%",
                p: 0.25,
              }}
            />
          )}
        </Box>

        <Typography
          id={headerId}
          variant="h2"
          component="h2"
          sx={{
            fontSize: { xs: "1.5rem", sm: "1.75rem", md: "2rem" },
            fontWeight: isLatest ? 700 : 600,
            color: isLatest ? "primary.main" : "text.primary",
            letterSpacing: "-0.025em",
            transition: "all 0.3s ease",
          }}
        >
          {monthLabel}
        </Typography>
      </Box>

      {/* Latest badge */}
      {isLatest && !isMobile && (
        <Chip
          label="Latest"
          size="small"
          color="success"
          variant="outlined"
          sx={{
            fontSize: "0.75rem",
            height: 24,
            "& .MuiChip-label": {
              px: 1,
            },
          }}
        />
      )}
    </Box>
  );
};

export default MonthHeader;
