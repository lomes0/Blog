import React, { useCallback } from "react";
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
import { alpha } from "@mui/material/styles";
import { Folder, FolderOpen } from "lucide-react";
import type { Series } from "@/types";
import type { SeriesGroupItem } from "@/utils/posts/seriesGrouping";
import type {
  PostItemActions,
  SeriesItemActions,
} from "./hooks/useSidebarActions";
import type { RowSelectionResult } from "@/hooks/useRowSelection";
import type { SidebarDndResult } from "./hooks/useSidebarDnd";
import { DRAG_MIME, dropPositionFromEvent } from "@/lib/dragDrop";
import { PostItem } from "./PostItem";
import { CountPill } from "./CountPill";
import { SB_FONT, SB_ITEM_RADIUS } from "./constants";
import { ICON_SIZE } from "@/theme/icons";

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
  dnd: SidebarDndResult;
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
            sx={[{
              minHeight: 26,
              justifyContent: sidebarOpen ? "initial" : "center",
              px: 2,
              py: 0.25,
              borderRadius: SB_ITEM_RADIUS,
              position: "relative",
              ...(isSeriesActive && { bgcolor: "action.selected" }),
              "&:hover": { bgcolor: "action.hover" },
              // Drop-a-post-into-series: highlight the whole header with a
              // primary ring + soft fill (matches PostsListView's SeriesRow).
              ...(isDropInto && {
                "&, &:hover": {
                  bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
                },
                outline: "1.5px solid",
                outlineColor: "primary.main",
                outlineOffset: "-1px",
              }),
              // Reorder line when a series is dragged over this header.
              ...(headerDropIndicator && {
                "&::after": {
                  content: '""',
                  position: "absolute",
                  left: 0,
                  right: 0,
                  [headerDropIndicator === "before" ? "top" : "bottom"]: 0,
                  height: 2,
                  bgcolor: "primary.main",
                  zIndex: 2,
                },
              }),
              // The series row has no "selected" state of its own, so MUI's
              // default `.Mui-focusVisible` grey fill — left behind when focus
              // returns to the row after closing the context menu / committing a
              // rename — reads as a stuck "selected" mark. Drop the fill and show
              // a focus ring instead (mirrors PostItem's row treatment).
              "&.Mui-focusVisible": {
                bgcolor: "transparent",
                outline: "2px solid",
                outlineColor: "primary.main",
                outlineOffset: "-2px",
              },
              // Multi-selection reads as a primary-tinted pill (same treatment as
              // post rows), distinct from the neutral active-route fill.
              ...(isMultiSelected && {
                "&, &:hover": {
                  bgcolor: (t) => alpha(t.palette.primary.main, 0.16),
                },
                "&:hover": {
                  bgcolor: (t) => alpha(t.palette.primary.main, 0.24),
                },
              }),
            },
            // Active series row takes the accent tint. Skipped when
            // multi-selected so the primary-tint pill wins.
            isSeriesActive && !isMultiSelected
              ? { "&, &:hover": { backgroundColor: "accent.tint" } }
              : {},
            ]}
          >
            {/* The open/closed folder glyph is the sole expand indicator now —
                the redundant tree chevron was dropped, so the folder both marks
                the row as a container and shows its state (VS Code folder rows).
                It leads the row where the chevron used to, so the guide-line and
                child-indent math below are unchanged. */}
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
            {sidebarOpen && !isRenaming && group.posts.length > 0 && (
              <CountPill count={group.posts.length} active={isSeriesActive} />
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
              pathname={pathname}
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
