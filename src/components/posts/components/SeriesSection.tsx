"use client";
import React from "react";
import Grid from "@mui/material/Grid2";
import { Series, User, Post } from "@/types";
import SeriesGroupCard from "./SeriesGroupCard";
import { useExpandedState } from "@/hooks/useExpandedState";

interface SeriesSectionProps {
  series: Series[];
  user?: User;
}

/**
 * The dedicated "Series" section of the /posts page in **grid** view: one
 * collapsible SeriesGroupCard per series, started expanded.
 *
 * Compact view never reaches here — `PostsView` hands the whole page to
 * `PostsListView`, which interleaves series and standalone posts in one shared
 * rank space instead of splitting them into sections.
 */
const SeriesSection: React.FC<SeriesSectionProps> = ({ series, user }) => {
  // Track which series are collapsed (series default to expanded).
  // expandedSeries here actually holds the SET OF COLLAPSED ids.
  const { expandedSeries: collapsedSeries, toggleSeries: toggleCollapsed } =
    useExpandedState("seriesSectionCollapsedState");

  return (
    <Grid container spacing={5} sx={{ mb: 4 }}>
      {series.map((s) => {
        const posts: Post[] = s.posts ?? [];
        return (
          <Grid key={s.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
            <SeriesGroupCard
              series={s}
              posts={posts}
              user={user}
              collapsible
              defaultExpanded={!collapsedSeries.has(s.id)}
              onExpand={() => toggleCollapsed(s.id)}
              onCollapse={() => toggleCollapsed(s.id)}
            />
          </Grid>
        );
      })}
    </Grid>
  );
};

export default SeriesSection;
