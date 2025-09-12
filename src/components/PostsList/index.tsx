"use client";
import React from "react";
import { Box, Skeleton, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import Grid from "@mui/material/Grid2";

// Import components
import MonthSection from "./components/MonthSection";
import TimeSection from "./components/TimeSection";
import PostsHeader from "./components/PostsHeader";
import SkeletonCard from "@/components/DocumentCardNew/components/LoadingCard";

// Import custom hooks
import { usePostsData } from "./hooks/usePostsData";

interface PostsListProps {
  // No props needed for now
}

/**
 * Loading state component for posts list
 * Shows skeleton UI organized in month-like sections
 */
const PostsLoadingState: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: { xs: 4, md: 6 },
      }}
    >
      {/* Multiple month sections with skeleton content */}
      {Array.from({ length: isMobile ? 2 : 3 }).map((_, monthIndex) => (
        <Box
          key={`loading-month-${monthIndex}`}
          sx={{
            mb: { xs: 4, md: 6 },
            p: { xs: 2, sm: 3 },
            borderRadius: 2,
            backgroundColor: "background.paper",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          {/* Month header skeleton */}
          <Box
            sx={{
              mb: { xs: 2, md: 3 },
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            <Skeleton
              variant="circular"
              width={28}
              height={28}
            />
            <Skeleton
              variant="text"
              width={isMobile ? 200 : 280}
              height={isMobile ? 32 : 40}
              sx={{ fontSize: { xs: "1.5rem", md: "1.75rem" } }}
            />
            <Skeleton
              variant="rounded"
              width={80}
              height={24}
              sx={{ borderRadius: 3 }}
            />
          </Box>

          {/* Posts grid skeleton */}
          <Grid container spacing={3}>
            {Array.from({
              length: monthIndex === 0
                ? (isMobile ? 3 : 6)
                : (isMobile ? 2 : 4),
            }).map((_, cardIndex) => (
              <Grid
                key={`loading-card-${monthIndex}-${cardIndex}`}
                size={{ xs: 12, sm: 6, md: 4, lg: 3 }}
              >
                <SkeletonCard />
              </Grid>
            ))}
          </Grid>
        </Box>
      ))}
    </Box>
  );
};

/**
 * Main PostsList component that displays blog posts with flexible partitioning
 * Features: Search, time filtering, partitioning control, responsive design, accessibility, SEO optimization
 */
const PostsList: React.FC<PostsListProps> = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  // Use custom hook to get posts data with search, filtering, and partitioning
  const {
    monthGroups,
    timeGroups,
    loading,
    totalCount,
    filteredCount,
    searchQuery,
    setSearchQuery,
    timeFilter,
    setTimeFilter,
    granularity,
    setGranularity,
    hasActiveFilters,
    searchResults,
  } = usePostsData();

  // Use timeGroups for display to support flexible partitioning
  const displayGroups = timeGroups;

  return (
    <Box
      component="main"
      sx={{
        py: { xs: 2, sm: 3, md: 4 },
        px: { xs: 1, sm: 2, md: 3, lg: 4 },
        minHeight: "50vh",
        maxWidth: "100%",
        width: "100%",
      }}
      // Accessibility attributes
      role="main"
      aria-label="Blog posts with flexible partitioning"
    >
      {/* Enhanced Header with Search and Filters */}
      <PostsHeader
        totalCount={hasActiveFilters ? filteredCount : totalCount}
        loading={loading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        timeFilter={timeFilter}
        onTimeFilterChange={setTimeFilter}
        granularity={granularity}
        onGranularityChange={setGranularity}
      />

      {/* Time-Based Sections */}
      {loading
        ? (
          <section aria-label="Loading posts" aria-live="polite">
            <PostsLoadingState />
          </section>
        )
        : displayGroups.length === 0
        ? (
          <section
            role="region"
            aria-label={hasActiveFilters
              ? "No posts match filters"
              : "No posts available"}
            aria-live="polite"
          >
            <Box
              sx={{
                textAlign: "center",
                py: { xs: 6, md: 10 },
                px: { xs: 2, md: 4 },
                color: "text.secondary",
              }}
            >
              <Box
                sx={{
                  mb: 3,
                  fontSize: { xs: 40, md: 56 },
                  filter: "grayscale(0.3)",
                }}
              >
                {hasActiveFilters ? "🔍" : "📝"}
              </Box>
              <Box
                sx={{
                  fontSize: { xs: "1.125rem", md: "1.375rem" },
                  mb: 1,
                  fontWeight: 600,
                  color: "text.primary",
                }}
              >
                {hasActiveFilters
                  ? searchQuery
                    ? `No posts found for "${searchQuery}"`
                    : "No posts found in this time period"
                  : "No posts yet"}
              </Box>
              <Box
                sx={{
                  fontSize: { xs: "0.95rem", md: "1.125rem" },
                  maxWidth: 400,
                  mx: "auto",
                  lineHeight: 1.6,
                }}
              >
                {hasActiveFilters
                  ? "Try adjusting your search or filter criteria"
                  : "Start writing your first blog post and share your thoughts with the world!"}
              </Box>
            </Box>
          </section>
        )
        : (
          <section
            role="region"
            aria-label={`${filteredCount} blog posts organized by ${granularity}`}
            aria-live="polite"
          >
            <Box>
              {displayGroups.map((timeGroup, index) => (
                <Box key={timeGroup.timeKey}>
                  <TimeSection
                    timeGroup={timeGroup}
                    isLatest={index === 0} // First period is the latest
                  />
                </Box>
              ))}
            </Box>
          </section>
        )}
    </Box>
  );
};

export default PostsList;
