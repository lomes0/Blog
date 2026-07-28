"use client";
import React from "react";
import Grid from "@mui/material/Grid2";
import { Series, User, Post } from "@/types";
import { type ViewType } from "@/components/shared/ViewToggle";
import { SeriesGroupItem } from "@/utils/posts/seriesGrouping";
import SeriesGroupCard from "./SeriesGroupCard";
import { PostsCompactListView } from "./PostsCompactListView";
import { useExpandedState } from "@/hooks/useExpandedState";

interface SeriesSectionProps {
  series: Series[];
  user?: User;
  viewType?: ViewType;
}

/**
 * Renders the dedicated "Series" section on the /posts page.
 *
 * - grid (default): collapsible SeriesGroupCard per series, started expanded.
 * - compact: PostsCompactListView with series rendered as collapsible group rows.
 */
const SeriesSection: React.FC<SeriesSectionProps> = ({
  series,
  user,
  viewType = "grid",
}) => {
  // Track which series are collapsed (series default to expanded).
  // expandedSeries here actually holds the SET OF COLLAPSED ids.
  const { expandedSeries: collapsedSeries, toggleSeries: toggleCollapsed } =
    useExpandedState("seriesSectionCollapsedState");

  if (viewType === "compact") {
    const groups: SeriesGroupItem[] = series.map((s) => ({
      type: "series" as const,
      series: s,
      posts: (s.posts ?? []),
      sortKey: s.createdAt ? new Date(s.createdAt).getTime() : 0,
    }));
    return <PostsCompactListView groups={groups} user={user} />;
  }

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
