import React from "react";
import { Box, Chip, Typography } from "@mui/material";
import { PartitionGranularity } from "@/types/partitioning";

interface TimeHeaderProps {
  timeLabel: string;
  postCount: number;
  timeKey: string;
  granularity: PartitionGranularity;
  isLatest?: boolean;
}

/**
 * Generic header component for time-based sections
 * Shows time period label and post count
 */
const TimeHeader: React.FC<TimeHeaderProps> = ({
  timeLabel,
  postCount,
  timeKey,
  granularity,
  isLatest = false,
}) => {
  const getGranularityIcon = () => {
    switch (granularity) {
      case "day":
        return "📅";
      case "week":
        return "📊";
      case "month":
        return "🗓️";
      case "year":
        return "📆";
      default:
        return "🗓️";
    }
  };

  const getGranularityLabel = () => {
    switch (granularity) {
      case "day":
        return "Day";
      case "week":
        return "Week";
      case "month":
        return "Month";
      case "year":
        return "Year";
      default:
        return "Month";
    }
  };

  return (
    <Box
      id={`time-header-${timeKey}`}
      sx={{
        mb: { xs: 2, md: 3 },
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: "50%",
            backgroundColor: isLatest ? "primary.main" : "grey.300",
            fontSize: "0.875rem",
            transition: "all 0.2s ease-in-out",
          }}
          aria-label={`${getGranularityLabel()} icon`}
        >
          {getGranularityIcon()}
        </Box>

        <Typography
          variant="h5"
          component="h2"
          sx={{
            fontWeight: 600,
            color: "text.primary",
            fontSize: { xs: "1.25rem", md: "1.5rem" },
          }}
        >
          {timeLabel}
        </Typography>
      </Box>

      <Chip
        label={`${postCount} post${postCount === 1 ? "" : "s"}`}
        size="small"
        variant="outlined"
        sx={{
          borderRadius: 3,
          fontWeight: 500,
          backgroundColor: isLatest ? "primary.50" : "grey.50",
          borderColor: isLatest ? "primary.200" : "grey.300",
          color: isLatest ? "primary.700" : "text.secondary",
          "& .MuiChip-label": {
            px: 1.5,
          },
        }}
      />
    </Box>
  );
};

export default TimeHeader;
