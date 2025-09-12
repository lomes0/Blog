import React from "react";
import { Box, Typography } from "@mui/material";
import { TimeGroup } from "@/types/partitioning";
import PostsGrid from "./PostsGrid";

interface TimeSectionProps {
  timeGroup: TimeGroup;
  isLatest?: boolean;
}

// Inline TimeHeader component for simplicity
const TimeHeader: React.FC<{
  timeLabel: string;
  postCount: number;
  timeKey: string;
  granularity: TimeGroup["granularity"];
  isLatest?: boolean;
}> = ({ timeLabel, postCount, timeKey, granularity, isLatest = false }) => {
  return (
    <Box
      id={`time-header-${timeKey}`}
      sx={{
        mb: { xs: 2, md: 3 },
        display: "flex",
        alignItems: "center",
        gap: 2,
      }}
    >
      <Box
        sx={{
          fontSize: "1.25rem",
        }}
      >
        🗓️
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
  );
};

/**
 * Generic section component for displaying posts grouped by any time period
 * Replaces MonthSection with flexible time period support (without boxing)
 */
const TimeSection: React.FC<TimeSectionProps> = ({ timeGroup, isLatest = false }) => {
  return (
    <Box
      component="section"
      role="region"
      aria-labelledby={`time-header-${timeGroup.timeKey}`}
      sx={{
        mb: { xs: 4, md: 6 },
      }}
    >
      <TimeHeader
        timeLabel={timeGroup.timeLabel}
        postCount={timeGroup.count}
        timeKey={timeGroup.timeKey}
        granularity={timeGroup.granularity}
        isLatest={isLatest}
      />
      <Box
        id={`time-posts-${timeGroup.timeKey}`}
        aria-label={`${timeGroup.count} posts from ${timeGroup.timeLabel}`}
      >
        <PostsGrid posts={timeGroup.posts} />
      </Box>
    </Box>
  );
};

export default TimeSection;
