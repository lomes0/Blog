"use client";
import React, { useCallback, useMemo, useState } from "react";
import { Box, IconButton, List } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { Search, X } from "lucide-react";
import type { SeriesGroupItem } from "@/utils/posts/seriesGrouping";
import type {
  PostItemActions,
  SeriesItemActions,
} from "./hooks/useSidebarActions";
import { useSidebarSelection } from "./hooks/useSidebarSelection";
import { useSidebarDnd } from "./hooks/useSidebarDnd";
import { PostItem } from "./PostItem";
import { SeriesGroup } from "./SeriesGroup";
import { styles } from "../styles";
import { useExpandedState } from "@/hooks/useExpandedState";
import { ICON_SIZE } from "@/theme/icons";
import { SB_FONT } from "./constants";

interface ActivePostsSectionProps {
  groupedActivePosts: SeriesGroupItem[];
  sidebarOpen: boolean;
  pathname: string;
  itemActions: PostItemActions;
  seriesActions: SeriesItemActions;
}

export const ActivePostsSection: React.FC<ActivePostsSectionProps> = ({
  groupedActivePosts,
  sidebarOpen,
  pathname,
  itemActions,
  seriesActions,
}) => {
  const [activePostsSearch, setActivePostsSearch] = useState("");
  const {
    expandedSeries,
    toggleSeries: toggleSeriesExpanded,
  } = useExpandedState("sidebarSeriesCollapsedState");
  // Independent persisted expansion state for each post's tab list.
  const {
    expandedSeries: expandedTabs,
    toggleSeries: toggleTabs,
  } = useExpandedState("sidebarPostTabsExpandedState");

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

  // Flat list of selectable rows in render order: each series row, the posts of
  // each *expanded* series, and the standalone posts. Drives Shift-range and
  // Select-All. Collapsed series' posts are omitted since they aren't visible.
  const allVisibleIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of filteredGroups) {
      if (group.type === "series" && group.series) {
        ids.push(group.series.id);
        if (expandedSeries.has(group.series.id)) {
          group.posts.forEach((post) => ids.push(post.id));
        }
      } else {
        ids.push(group.posts[0].id);
      }
    }
    return ids;
  }, [filteredGroups, expandedSeries]);

  const selection = useSidebarSelection(allVisibleIds);
  const { clear: clearSelection, selectAll } = selection;

  const dnd = useSidebarDnd(filteredGroups);

  // Escape clears the selection; Ctrl/Cmd+A selects every visible row. Scoped to
  // the sidebar list (the handler sits on the scroll container, firing only when
  // a row inside holds focus) so it never fights the editor's own shortcuts.
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (event.key === "Escape") {
        clearSelection();
      } else if (
        (event.key === "a" || event.key === "A") &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        selectAll();
      }
    },
    [clearSelection, selectAll],
  );

  // A click on the empty area below the tree clears the selection (only when the
  // click lands on the container itself, not a row that bubbled up).
  const handleContainerClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) clearSelection();
    },
    [clearSelection],
  );

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
      {sidebarOpen && (
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
            border: "1px solid transparent",
            borderRadius: "12px",
            bgcolor: "action.hover",
            fontSize: SB_FONT.meta,
            transition:
              "background-color .15s, border-color .15s, box-shadow .15s",
            "&:focus-within": {
              bgcolor: "background.input",
              borderColor: "primary.main",
              boxShadow: (theme) =>
                `0 0 0 3px ${alpha(theme.palette.primary.main, 0.14)}`,
            },
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
        onKeyDown={handleKeyDown}
        onClick={handleContainerClick}
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
                  seriesActions={seriesActions}
                  expandedTabs={expandedTabs}
                  onToggleTabs={toggleTabs}
                  selection={selection}
                  dnd={dnd}
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
                expandedTabs={expandedTabs}
                onToggleTabs={toggleTabs}
                isSelected={selection.isSelected(group.posts[0].id)}
                onSelectClick={selection.handleSelectClick}
                onDragStartItem={dnd.onPostDragStart}
                onDragEndItem={dnd.onDragEnd}
                onReorderDragOver={dnd.onReorderDragOver}
                onReorderDrop={dnd.onReorderDrop}
                dropIndicator={dnd.dropTarget?.id === group.posts[0].id
                  ? dnd.dropTarget.position
                  : null}
              />
            );
          })}
        </List>
      </Box>
    </Box>
  );
};
