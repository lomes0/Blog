import React from "react";
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
import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import type { Series } from "@/types";
import type { SeriesGroupItem } from "@/utils/posts/seriesGrouping";
import type {
  PostItemActions,
  SeriesItemActions,
} from "./hooks/useSidebarActions";
import { PostItem } from "./PostItem";
import { SafeNavigationLink } from "./SafeNavigationLink";
import { CHEVRON_TRANSITION, SB_FONT, SB_ITEM_RADIUS } from "./constants";
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
}) => {
  const {
    renamingSeriesId,
    seriesRenameValue,
    setSeriesRenameValue,
    seriesRenameInputRef,
    handleSeriesContextMenu,
    handleSeriesDoubleClick,
    handleSeriesRenameBlur,
    handleSeriesRenameKeyDown,
  } = seriesActions;
  const isRenaming = renamingSeriesId === group.series.id;
  // A series row is "selected" when its posts page is the current route, so it
  // carries the same soft filled pill as post rows and sub-tabs.
  const isSeriesActive = pathname === `/posts/${group.series.id}`;
  const hasAnyDirtyChild = group.posts.some(
    (post) =>
      Boolean(post.local) &&
      Boolean(post.cloud) &&
      post.local!.head !== post.cloud!.head,
  );

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
            onClick={() => {
              if (!isRenaming) onToggle();
            }}
            onContextMenu={(e) =>
              handleSeriesContextMenu(e, group.series.id)}
            onDoubleClick={(e) => {
              if (sidebarOpen) {
                handleSeriesDoubleClick(e, group.series.id, group.series.title);
              }
            }}
            sx={{
              minHeight: 26,
              justifyContent: sidebarOpen ? "initial" : "center",
              px: 2,
              py: 0.25,
              borderRadius: SB_ITEM_RADIUS,
              ...(isSeriesActive && { bgcolor: "action.selected" }),
              "&:hover": { bgcolor: "action.hover" },
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
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: 0,
                mr: 0.5,
                justifyContent: "center",
                // Single chevron rotated 0deg -> 90deg on expand (design spec),
                // rather than swapping two glyphs. The whole row toggles, so the
                // chevron is a persistent visual indicator, not its own target.
                "& > svg": {
                  transition: CHEVRON_TRANSITION,
                  transform: isExpanded ? "rotate(90deg)" : "none",
                },
              }}
            >
              <ChevronRight size={ICON_SIZE.inline} strokeWidth={2} />
            </ListItemIcon>
            {sidebarOpen && (
              <Box
                component="span"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                  mr: 0.75,
                  color: hasAnyDirtyChild ? "warning.main" : "text.secondary",
                }}
              >
                {isExpanded
                  ? <FolderOpen size={ICON_SIZE.inline} strokeWidth={2} />
                  : <Folder size={ICON_SIZE.inline} strokeWidth={2} />}
              </Box>
            )}
            {sidebarOpen && isRenaming && (
              <TextField
                inputRef={seriesRenameInputRef}
                value={seriesRenameValue}
                onChange={(e) => setSeriesRenameValue(e.target.value)}
                onBlur={handleSeriesRenameBlur}
                onKeyDown={handleSeriesRenameKeyDown}
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
                  color: hasAnyDirtyChild ? "warning.main" : "text.secondary",
                  sx: { display: "block", minWidth: 0 },
                }}
                sx={{ minWidth: 0, my: 0 }}
              />
            )}
            {sidebarOpen && !isRenaming && (
              // The item count doubles as the "open series" link: clicking it
              // navigates to /posts/{id} (a real anchor, so Cmd/Ctrl-click works)
              // while stopPropagation keeps the click off the row, which toggles.
              // Underlines on hover to read as a link. The wrapper span holds the
              // Tooltip ref; the link preserves the original two-level em cascade
              // (SB_FONT.body nested under SB_FONT.meta, weight 500) so the number
              // renders at the same size as before.
              <Tooltip title="Open series" placement="right">
                <Box
                  component="span"
                  sx={{ pl: 0.5, flexShrink: 0, display: "inline-flex" }}
                >
                  <Box
                    component={SafeNavigationLink}
                    href={`/posts/${group.series.id}`}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    sx={{
                      fontSize: SB_FONT.meta,
                      fontWeight: 500,
                      color: "text.disabled",
                      fontVariantNumeric: "tabular-nums",
                      textDecoration: "none",
                      cursor: "pointer",
                      "&:hover": { textDecoration: "underline" },
                    }}
                  >
                    <Box component="span" sx={{ fontSize: SB_FONT.body }}>
                      {group.posts.length > 99 ? "99+" : group.posts.length}
                    </Box>
                  </Box>
                </Box>
              </Tooltip>
            )}
          </ListItemButton>
        </Tooltip>
      </ListItem>

      <Collapse in={isExpanded} timeout="auto">
        <Box
          sx={{
            // Center the 2px guide line under the series chevron: the row's
            // px:2 (16px) + half the 14px chevron = 23px, and the line's center
            // is ml + 1, so ml = 22px (2.75).
            ml: sidebarOpen ? 2.75 : 0,
            borderLeft: sidebarOpen ? "2px solid" : "none",
            borderLeftColor: "divider",
            // Inset the children (inside the border, so the line stays put) so a
            // child's file icon lands under the parent folder icon (center 41px):
            // ml(22) + border(2) + pl + post pl(6) + half icon(7) = 41 -> pl 4px.
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
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
};
