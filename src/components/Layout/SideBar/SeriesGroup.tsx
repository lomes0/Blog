import React, { useCallback, useMemo } from "react";
import {
  Box,
  Collapse,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  Tooltip,
} from "@mui/material";
import { Folder, FolderOpen } from "lucide-react";
import type { Series } from "@/types";
import type { SeriesGroupItem } from "@/utils/posts/seriesGrouping";
import type {
  PostItemActions,
  SeriesItemActions,
} from "./hooks/useSidebarActions";
import type { RowSelectionResult } from "@/hooks/useRowSelection";
import type { TreeDndResult } from "@/lib/tree/useTreeDnd";
import { DRAG_MIME, dropPositionFromEvent } from "@/lib/dragDrop";
import { PostItem } from "./PostItem";
import { CountPill } from "./CountPill";
import { SB_FONT, SB_ITEM_RADIUS } from "./constants";
import {
  chromeFocusRingSx,
  dropIndicatorSx,
  dropIntoSx,
  multiSelectSx,
  rowHoverRevealSx,
} from "@/theme/treeRow";
import { ICON_SIZE } from "@/theme/icons";
import { useSelector } from "@/store";
import {
  rollUpMarkers,
  selectMarkerByDocId,
} from "@/store/selectors/proposalSelectors";
import { AgentMarker as AgentMarkerComponent } from "./AgentMarker";

interface SeriesGroupProps {
  group: SeriesGroupItem & { series: Series };
  groupIndex: number;
  isExpanded: boolean;
  onToggle: () => void;
  sidebarOpen: boolean;
  pathname: string;
  itemActions: PostItemActions;
  seriesActions: SeriesItemActions;
  expandedTabs: Set<string>;
  onToggleTabs: (id: string) => void;
  selection: RowSelectionResult;
  dnd: TreeDndResult;
}

export const SeriesGroup: React.FC<SeriesGroupProps> = ({
  group,
  groupIndex,
  isExpanded,
  onToggle,
  sidebarOpen,
  pathname,
  itemActions,
  seriesActions,
  expandedTabs,
  onToggleTabs,
  selection,
  dnd,
}) => {
  const seriesId = group.series.id;

  // Agent marker roll-up: a series shows a marker when ANY descendant post
  // carries one. The precedence is stale > pending > created, same as rows.
  //
  // The row subscribes to one memoized map and nothing else. Reading a marker
  // out of it is one lookup per child, and the map's identity only moves when a
  // poll or a review decision moves it — so an unrelated dispatch re-renders no
  // group row.
  const markerByDocId = useSelector(selectMarkerByDocId);
  const groupMarker = useMemo(
    () => rollUpMarkers(group.posts.map((post) => post.id), markerByDocId),
    [group.posts, markerByDocId],
  );

  const handleHeaderDragOver = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
      e.preventDefault();
      dnd.onReorderDragOver(seriesId, dropPositionFromEvent(e));
    },
    [dnd, seriesId],
  );
  const handleHeaderDrop = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      dnd.onReorderDrop(seriesId, dropPositionFromEvent(e));
    },
    [dnd, seriesId],
  );

  const isDropInto = dnd.dragOverSeriesId === seriesId;
  const headerDropIndicator = dnd.dropTarget?.id === seriesId
    ? dnd.dropTarget.position
    : null;
  const { rename } = seriesActions;
  const isRenaming = rename.renamingId === seriesId;
  // A series row is "selected" when its posts page is the current route, so it
  // carries the same soft filled pill as post rows and sub-tabs.
  const isSeriesActive = pathname === `/posts/${group.series.id}`;
  const isMultiSelected = selection.isSelected(group.series.id);

  return (
    <Box sx={{ mt: groupIndex > 0 ? 0.5 : 0, mb: 0.5 }}>
      <ListItem disablePadding sx={{ display: "block" }}>
        <Tooltip
          title={sidebarOpen ? "" : group.series.title}
          placement="right"
        >
          <ListItemButton
            // The row no longer navigates: single-click toggles the folder
            // open/closed (VS Code tree behavior). The series page opens from
            // the hover "open" button on the right. Double-click still renames,
            // so a double-click fires two toggles (net no change) before the
            // rename input mounts — an accepted one-frame flicker.
            aria-expanded={isExpanded}
            draggable={!isRenaming}
            onClick={(e) => {
              // Modifier click selects the series row instead of toggling it.
              if (selection.handleSelectClick(group.series.id, e)) return;
              if (!isRenaming) onToggle();
            }}
            onDragStart={(e) => dnd.onSeriesDragStart(e, seriesId)}
            onDragEnd={dnd.onDragEnd}
            onDragOver={handleHeaderDragOver}
            onDragLeave={dnd.onDragLeaveRow}
            onDrop={handleHeaderDrop}
            onContextMenu={(e) => seriesActions.openContextMenu(e, seriesId)}
            onDoubleClick={(e) => {
              if (sidebarOpen) {
                e.preventDefault();
                rename.start(seriesId);
              }
            }}
            sx={[
              {
                minHeight: 26,
                justifyContent: sidebarOpen ? "initial" : "center",
                px: 2,
                py: 0.25,
                borderRadius: SB_ITEM_RADIUS,
                position: "relative",
                ...(isSeriesActive && { bgcolor: "action.selected" }),
                "&:hover": { bgcolor: "action.hover" },
                // Drop-a-post-into-series: the shared fill, plus an outline that
                // marks the header as a container (ProjectGroup uses a rule
                // instead — see its band treatment).
                ...(isDropInto && {
                  ...dropIntoSx(),
                  outline: "1.5px solid",
                  outlineColor: "primary.main",
                  outlineOffset: "-1px",
                }),
                // Reorder line when a series is dragged over this header.
                ...(headerDropIndicator &&
                  dropIndicatorSx(headerDropIndicator)),
                // The series row has no "selected" state of its own, so nothing
                // here needs its fill preserved under focus.
                ...chromeFocusRingSx(),
                ...(isMultiSelected && multiSelectSx()),
                ...rowHoverRevealSx,
              },
              // Active series row takes the accent tint. Skipped when
              // multi-selected so the primary-tint pill wins.
              isSeriesActive && !isMultiSelected
                ? { "&, &:hover": { backgroundColor: "accent.tint" } }
                : {},
            ]}
          >
            {
              /* The open/closed folder glyph is the sole expand indicator now —
                the redundant tree chevron was dropped, so the folder both marks
                the row as a container and shows its state (VS Code folder rows).
                It leads the row where the chevron used to, so the guide-line and
                child-indent math below are unchanged. */
            }
            <ListItemIcon
              sx={{
                minWidth: 0,
                mr: sidebarOpen ? 0.75 : 0,
                justifyContent: "center",
                // The folder glyph reads in the accent purple. (A `warning.main`
                // variant for "has dirty children" was stubbed here behind a
                // literal `false` and never wired up; it is not represented.)
                color: "accent.main",
              }}
            >
              {isExpanded
                ? <FolderOpen size={ICON_SIZE.inline} strokeWidth={2} />
                : <Folder size={ICON_SIZE.inline} strokeWidth={2} />}
            </ListItemIcon>
            {sidebarOpen && isRenaming && (
              <TextField
                inputRef={rename.inputRef}
                value={rename.value}
                onChange={(e) => rename.setValue(e.target.value)}
                onBlur={rename.handleBlur}
                onKeyDown={rename.handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                size="small"
                variant="standard"
                fullWidth
                sx={{
                  "& .MuiInput-input": {
                    fontSize: SB_FONT.meta,
                    fontWeight: 500,
                    py: 0,
                  },
                }}
              />
            )}
            {sidebarOpen && !isRenaming && (
              <ListItemText
                primary={group.series.title}
                primaryTypographyProps={{
                  component: "span",
                  fontSize: SB_FONT.meta,
                  noWrap: true,
                  // Mirror the doc-row sync decoration (color only, no weight
                  // bump): a series with modified children reads amber.
                  fontWeight: 500,
                  color: false ? "warning.main" : "text.secondary",
                  sx: {
                    display: "block",
                    minWidth: 0,
                    // An active series title darkens to the accent.
                    ...(isSeriesActive && { color: "accent.activeText" }),
                  },
                }}
                sx={{ minWidth: 0, my: 0 }}
              />
            )}
            {sidebarOpen && !isRenaming && (
              <>
                {
                  /* Agent marker sits beside the count pill. Do NOT suppress when
                    expanded: that makes the marker flicker on every fold, which is
                    worse than the redundancy. The descendant rows carry their own
                    markers, so the group's is load-bearing only when collapsed, but
                    it stays visible when open too — see docs/plans/archive/agent-change-indication.md §3.2. */
                }
                <AgentMarkerComponent
                  marker={groupMarker.marker}
                  count={groupMarker.count}
                  sx={{ ml: "auto", mr: 0.25 }}
                />
                {group.posts.length > 0 && (
                  <CountPill
                    count={group.posts.length}
                    active={isSeriesActive}
                  />
                )}
              </>
            )}
          </ListItemButton>
        </Tooltip>
      </ListItem>

      <Collapse in={isExpanded} timeout="auto">
        <Box
          sx={{
            // Center the 2px guide line under the series folder icon: the row's
            // px:2 (16px) + half the 14px folder icon = 23px, and the line's
            // center is ml + 1, so ml = 22px (2.75).
            ml: sidebarOpen ? 2.75 : 0,
            borderLeft: sidebarOpen ? "2px solid" : "none",
            borderLeftColor: "divider",
            // Inset the children one level past the guide line (inside the
            // border, so the line stays put) so a child's file icon lands under
            // the parent's title text (center 41px), the folder icon now sitting
            // on the guide line: ml(22) + border(2) + pl + post pl(6) + half
            // icon(7) = 41 -> pl 4px.
            pl: sidebarOpen ? "4px" : 0,
          }}
        >
          {group.posts.map((post) => (
            <PostItem
              key={post.id}
              post={post}
              inSeries
              sidebarOpen={sidebarOpen}
              itemActions={itemActions}
              expandedTabs={expandedTabs}
              onToggleTabs={onToggleTabs}
              isSelected={selection.isSelected(post.id)}
              onSelectClick={selection.handleSelectClick}
              onDragStartItem={dnd.onPostDragStart}
              onDragEndItem={dnd.onDragEnd}
              onReorderDragOver={dnd.onReorderDragOver}
              onReorderDrop={dnd.onReorderDrop}
              dropIndicator={dnd.dropTarget?.id === post.id
                ? dnd.dropTarget.position
                : null}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
};
