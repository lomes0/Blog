"use client";
import React, { useCallback, useMemo, useState } from "react";
import { Box, IconButton, List } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { Search, X } from "lucide-react";
import type {
  ProjectGroupItem,
  RootItem,
  SeriesGroupItem,
} from "@/utils/posts/seriesGrouping";
import type {
  PostItemActions,
  ProjectItemActions,
  SeriesItemActions,
} from "./hooks/useSidebarActions";
import { useSidebarSelection } from "./hooks/useSidebarSelection";
import { useSidebarDnd } from "./hooks/useSidebarDnd";
import { useSidebarBulkActions } from "./hooks/useSidebarBulkActions";
import { PostItem } from "./PostItem";
import { SeriesGroup } from "./SeriesGroup";
import { ProjectGroup } from "./ProjectGroup";
import { SidebarBulkMenu } from "./SidebarBulkMenu";
import { styles } from "../styles";
import { useExpandedState } from "@/hooks/useExpandedState";
import { ICON_SIZE } from "@/theme/icons";
import { SB_FONT } from "./constants";

interface ActivePostsSectionProps {
  rootItems: RootItem[];
  sidebarOpen: boolean;
  pathname: string;
  itemActions: PostItemActions;
  seriesActions: SeriesItemActions;
  projectActions: ProjectItemActions;
}

export const ActivePostsSection: React.FC<ActivePostsSectionProps> = ({
  rootItems,
  sidebarOpen,
  pathname,
  itemActions,
  seriesActions,
  projectActions,
}) => {
  const [activePostsSearch, setActivePostsSearch] = useState("");
  const {
    expandedSeries,
    toggleSeries: toggleSeriesExpanded,
  } = useExpandedState("sidebarSeriesCollapsedState");
  // Independent persisted expansion state for each project's series list.
  const {
    expandedSeries: expandedProjects,
    toggleSeries: toggleProjectExpanded,
  } = useExpandedState("sidebarProjectExpandedState");
  // Independent persisted expansion state for each post's tab list.
  const {
    expandedSeries: expandedTabs,
    toggleSeries: toggleTabs,
  } = useExpandedState("sidebarPostTabsExpandedState");

  const filteredRootItems = useMemo((): RootItem[] => {
    if (!activePostsSearch.trim()) return rootItems;
    const searchLower = activePostsSearch.toLowerCase();
    // Filter a single series/standalone group; null drops it entirely.
    const filterGroup = (group: SeriesGroupItem): SeriesGroupItem | null => {
      if (group.type === "series") {
        if (group.series?.title.toLowerCase().includes(searchLower)) {
          return group;
        }
        const filteredPosts = group.posts.filter((post) => {
          const doc = post.cloud || post.local;
          return doc?.name?.toLowerCase().includes(searchLower);
        });
        return filteredPosts.length > 0
          ? { ...group, posts: filteredPosts }
          : null;
      }
      const doc = group.posts[0]?.cloud || group.posts[0]?.local;
      return doc?.name?.toLowerCase().includes(searchLower) ? group : null;
    };
    return rootItems
      .map((item): RootItem | null => {
        if (item.type === "project") {
          // A title match keeps the whole project; otherwise keep only matching
          // children, dropping the project when none match.
          if (item.project.title.toLowerCase().includes(searchLower)) {
            return item;
          }
          const children = item.children
            .map(filterGroup)
            .filter((c): c is SeriesGroupItem => c !== null);
          return children.length > 0 ? { ...item, children } : null;
        }
        return filterGroup(item);
      })
      .filter((item): item is RootItem => item !== null);
  }, [rootItems, activePostsSearch]);

  // Flat list of selectable rows in render order: each series row, the posts of
  // each *expanded* series, and the standalone posts — plus the series inside
  // each *expanded* project. Drives Shift-range and Select-All. Project headers
  // are structural, not selectable, so they are omitted. Collapsed containers'
  // descendants are omitted since they aren't visible.
  const allVisibleIds = useMemo(() => {
    const ids: string[] = [];
    const pushGroup = (group: SeriesGroupItem) => {
      if (group.type === "series" && group.series) {
        ids.push(group.series.id);
        if (expandedSeries.has(group.series.id)) {
          group.posts.forEach((post) => ids.push(post.id));
        }
      } else {
        ids.push(group.posts[0].id);
      }
    };
    for (const item of filteredRootItems) {
      if (item.type === "project") {
        if (expandedProjects.has(item.project.id)) {
          item.children.forEach(pushGroup);
        }
      } else {
        pushGroup(item);
      }
    }
    return ids;
  }, [filteredRootItems, expandedSeries, expandedProjects]);

  const selection = useSidebarSelection(allVisibleIds);
  const { clear: clearSelection, selectAll } = selection;

  // A drag that starts on a selected row moves the whole selection (render
  // order); otherwise just the grabbed row.
  const getDragSet = useCallback(
    (primaryId: string): string[] => {
      if (selection.isSelected(primaryId) && selection.selectedIds.size > 1) {
        return allVisibleIds.filter((id) => selection.selectedIds.has(id));
      }
      return [primaryId];
    },
    [selection, allVisibleIds],
  );

  const dnd = useSidebarDnd(filteredRootItems, getDragSet);

  const bulk = useSidebarBulkActions({
    selectedIds: selection.selectedIds,
    orderedIds: allVisibleIds,
    clearSelection,
  });

  // Right-clicking a row that is part of a multi-selection opens the bulk menu
  // instead of the single-row menu. Depend on stable selection primitives so the
  // wrapped actions don't churn the memoized rows during a drag.
  const { isSelected: isRowSelected, selectedIds } = selection;
  const { openMenu: openBulkMenu } = bulk;
  const bulkAwareItemActions = useMemo(
    () => ({
      ...itemActions,
      handleContextMenu: (event: React.MouseEvent, id: string) => {
        if (isRowSelected(id) && selectedIds.size > 1) openBulkMenu(event);
        else itemActions.handleContextMenu(event, id);
      },
    }),
    [itemActions, isRowSelected, selectedIds, openBulkMenu],
  );
  const bulkAwareSeriesActions = useMemo(
    () => ({
      ...seriesActions,
      handleSeriesContextMenu: (event: React.MouseEvent, id: string) => {
        if (isRowSelected(id) && selectedIds.size > 1) {
          event.stopPropagation();
          openBulkMenu(event);
        } else {
          seriesActions.handleSeriesContextMenu(event, id);
        }
      },
    }),
    [seriesActions, isRowSelected, selectedIds, openBulkMenu],
  );

  // Escape clears the selection; Ctrl/Cmd+A selects every visible row; Delete
  // removes the selection. Scoped to the sidebar list (the handler sits on the
  // scroll container, firing only when a row inside holds focus) so it never
  // fights the editor's own shortcuts.
  const { handleBulkDelete } = bulk;
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
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedIds.size > 0
      ) {
        event.preventDefault();
        handleBulkDelete();
      }
    },
    [clearSelection, selectAll, handleBulkDelete, selectedIds],
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
          {filteredRootItems.map((item, index) => {
            if (item.type === "project") {
              return (
                <ProjectGroup
                  key={`project-${item.project.id}`}
                  item={item as ProjectGroupItem}
                  isExpanded={expandedProjects.has(item.project.id)}
                  onToggle={() => toggleProjectExpanded(item.project.id)}
                  sidebarOpen={sidebarOpen}
                  pathname={pathname}
                  itemActions={bulkAwareItemActions}
                  seriesActions={bulkAwareSeriesActions}
                  projectActions={projectActions}
                  expandedSeries={expandedSeries}
                  onToggleSeries={toggleSeriesExpanded}
                  expandedTabs={expandedTabs}
                  onToggleTabs={toggleTabs}
                  selection={selection}
                  dnd={dnd}
                />
              );
            }
            if (item.type === "series" && item.series) {
              return (
                <SeriesGroup
                  key={`series-${item.series.id}`}
                  group={item as SeriesGroupItem & {
                    series: NonNullable<SeriesGroupItem["series"]>;
                  }}
                  groupIndex={index}
                  isExpanded={expandedSeries.has(item.series.id)}
                  onToggle={() => toggleSeriesExpanded(item.series!.id)}
                  sidebarOpen={sidebarOpen}
                  pathname={pathname}
                  itemActions={bulkAwareItemActions}
                  seriesActions={bulkAwareSeriesActions}
                  expandedTabs={expandedTabs}
                  onToggleTabs={toggleTabs}
                  selection={selection}
                  dnd={dnd}
                />
              );
            }
            return (
              <PostItem
                key={item.posts[0].id}
                post={item.posts[0]}
                inSeries={false}
                sidebarOpen={sidebarOpen}
                pathname={pathname}
                itemActions={bulkAwareItemActions}
                expandedTabs={expandedTabs}
                onToggleTabs={toggleTabs}
                isSelected={selection.isSelected(item.posts[0].id)}
                onSelectClick={selection.handleSelectClick}
                onDragStartItem={dnd.onPostDragStart}
                onDragEndItem={dnd.onDragEnd}
                onReorderDragOver={dnd.onReorderDragOver}
                onReorderDrop={dnd.onReorderDrop}
                dropIndicator={dnd.dropTarget?.id === item.posts[0].id
                  ? dnd.dropTarget.position
                  : null}
              />
            );
          })}
        </List>
      </Box>

      <SidebarBulkMenu
        menu={bulk.menu}
        count={bulk.selectedCount}
        availableSeries={bulk.availableSeries}
        canMerge={bulk.canMerge}
        onClose={bulk.closeMenu}
        onDelete={bulk.handleBulkDelete}
        onMove={bulk.handleBulkMove}
        onMerge={bulk.handleBulkMerge}
      />
    </Box>
  );
};
