import React from "react";
import { Box, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { UserDocument } from "@/types";
import MonthHeader from "./MonthHeader";
import PostsGrid from "./PostsGrid";

// Type definition for month group
export interface MonthGroup {
  monthKey: string; // "2024-01"
  monthLabel: string; // "January 2024"
  posts: UserDocument[]; // Array of UserDocument posts
  count: number;
}

interface MonthSectionProps {
  monthGroup: MonthGroup;
  isLatest?: boolean;
}

/**
 * Component that renders a section for one month containing
 * the month header and grid of posts for that month
 */
const MonthSection: React.FC<MonthSectionProps> = ({ monthGroup, isLatest = false }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Box
      component="section"
      role="region"
      aria-labelledby={`month-header-${monthGroup.monthKey}`}
      aria-describedby={`month-posts-${monthGroup.monthKey}`}
      sx={{
        mb: { xs: 8, md: 12 },
        "&:last-child": { mb: { xs: 4, md: 6 } },
        // Removed hover effect styling
        p: { xs: 2, sm: 3 },
      }}
    >
      <MonthHeader
        monthLabel={monthGroup.monthLabel}
        postCount={monthGroup.count}
        monthKey={monthGroup.monthKey}
        isLatest={isLatest}
      />
      <Box
        id={`month-posts-${monthGroup.monthKey}`}
        aria-label={`${monthGroup.count} posts from ${monthGroup.monthLabel}`}
      >
        <PostsGrid posts={monthGroup.posts} />
      </Box>
    </Box>
  );
};

export default MonthSection;
