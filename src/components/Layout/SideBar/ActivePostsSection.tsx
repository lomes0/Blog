"use client";
import React, { useMemo, useState } from "react";
import { Box, IconButton, List } from "@mui/material";
import { Search, X } from "lucide-react";
import type { SeriesGroupItem } from "@/utils/posts/seriesGrouping";
import type { PostItemActions } from "./hooks/useSidebarActions";
import { PostItem } from "./PostItem";
import { SeriesGroup } from "./SeriesGroup";
import { styles } from "../styles";
import { useExpandedState } from "@/hooks/useExpandedState";
import { ICON_SIZE } from "@/theme/icons";

interface ActivePostsSectionProps {
  groupedActivePosts: SeriesGroupItem[];
  sidebarOpen: boolean;
  pathname: string;
  itemActions: PostItemActions;
}

export const ActivePostsSection: React.FC<ActivePostsSectionProps> = ({
  groupedActivePosts,
  sidebarOpen,
  pathname,
  itemActions,
}) => {
  const [activePostsSearch, setActivePostsSearch] = useState("");
  const {
    expandedSeries,
    toggleSeries: toggleSeriesExpanded,
  } = useExpandedState("sidebarSeriesCollapsedState");

  const totalPosts = groupedActivePosts.reduce(
    (sum, g) => sum + g.posts.length,
    0,
  );
  const showSearch = totalPosts >= 5;

  const filteredGroups = useMemo((): SeriesGroupItem[] => {
    if (!activePostsSearch.trim()) return groupedActivePosts;
    const searchLower = activePostsSearch.toLowerCase();
    return groupedActivePosts
      .map((group) => {
        if (group.type === "series") {
          const seriesMatches = group.series?.title
            .toLowerCase()
            .includes(searchLower);
          if (seriesMatches) return group;
          const filteredPosts = group.posts.filter((post) => {
            const doc = post.cloud || post.local;
            return doc?.name?.toLowerCase().includes(searchLower);
          });
          if (filteredPosts.length === 0) return null;
          return { ...group, posts: filteredPosts };
        } else {
          const doc = group.posts[0]?.cloud || group.posts[0]?.local;
          if (doc?.name?.toLowerCase().includes(searchLower)) return group;
          return null;
        }
      })
      .filter((group): group is SeriesGroupItem => group !== null);
  }, [groupedActivePosts, activePostsSearch]);

  return (
    <Box
      sx={{
        ...styles.sectionBox,
        flex: "1 1 auto",
        minHeight: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {sidebarOpen && showSearch && (
        <Box
          sx={{
            mx: 1,
            mt: 1,
            mb: 0.5,
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: "10px",
            py: "6px",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "8px",
            bgcolor: "action.hover",
            fontSize: "0.75em",
          }}
        >
          <Search
            size={ICON_SIZE.inline}
            style={{ color: "var(--mui-palette-text-disabled)", flexShrink: 0 }}
          />
          <Box
            component="input"
            placeholder="Search posts..."
            value={activePostsSearch}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setActivePostsSearch(e.target.value)}
            sx={{
              flex: 1,
              border: "none",
              background: "transparent",
              outline: "none",
              fontFamily: "inherit",
              fontSize: "inherit",
              color: "text.primary",
              minWidth: 0,
              "&::placeholder": { color: "text.disabled" },
            }}
          />
          {activePostsSearch && (
            <IconButton
              size="small"
              onClick={() => setActivePostsSearch("")}
              sx={{ p: 0.25, opacity: 0.6, "&:hover": { opacity: 1 } }}
            >
              <X size={ICON_SIZE.inline} />
            </IconButton>
          )}
        </Box>
      )}

      <Box
        sx={{
          overflow: "auto",
          flex: "1 1 auto",
          overscrollBehavior: "contain",
        }}
      >
        <List dense>
          {filteredGroups.map((group, groupIndex) => {
            if (group.type === "series" && group.series) {
              return (
                <SeriesGroup
                  key={`series-${group.series.id}`}
                  group={group as SeriesGroupItem & {
                    series: NonNullable<SeriesGroupItem["series"]>;
                  }}
                  groupIndex={groupIndex}
                  isExpanded={expandedSeries.has(group.series.id)}
                  onToggle={() => toggleSeriesExpanded(group.series!.id)}
                  sidebarOpen={sidebarOpen}
                  pathname={pathname}
                  itemActions={itemActions}
                />
              );
            }
            return (
              <PostItem
                key={group.posts[0].id}
                post={group.posts[0]}
                inSeries={false}
                sidebarOpen={sidebarOpen}
                pathname={pathname}
                itemActions={itemActions}
              />
            );
          })}
        </List>
      </Box>
    </Box>
  );
};
