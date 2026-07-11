import React, { useCallback } from "react";
import {
  Box,
  Collapse,
  ListItem,
  ListItemButton,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import type {
  ProjectGroupItem,
  SeriesGroupItem,
} from "@/utils/posts/seriesGrouping";
import type {
  PostItemActions,
  ProjectItemActions,
  SeriesItemActions,
} from "./hooks/useSidebarActions";
import type { SidebarSelectionResult } from "./hooks/useSidebarSelection";
import {
  DRAG_MIME,
  dropPositionFromEvent,
  type SidebarDndResult,
} from "./hooks/useSidebarDnd";
import { SeriesGroup } from "./SeriesGroup";
import { SB_FONT } from "./constants";

/** Width of the leading rule stub before the tag title (the "── " lead-in). */
const LEAD_RULE_W = 14;

interface ProjectGroupProps {
  item: ProjectGroupItem;
  isExpanded: boolean;
  onToggle: () => void;
  sidebarOpen: boolean;
  pathname: string;
  itemActions: PostItemActions;
  seriesActions: SeriesItemActions;
  projectActions: ProjectItemActions;
  /** Per-series expansion state, shared with the root-level series groups. */
  expandedSeries: Set<string>;
  onToggleSeries: (id: string) => void;
  expandedTabs: Set<string>;
  onToggleTabs: (id: string) => void;
  selection: SidebarSelectionResult;
  dnd: SidebarDndResult;
}

/**
 * A project (tag) band in the sidebar tree, rendered as a **labeled divider** —
 * the title in `overline` style (uppercase,
 * tracked, muted — DESIGN.md §17.2 / §chrome section headers), a rule stretching
 * toward the right edge. The whole header is the toggle target (VS
 * Code tree behavior); double-click renames inline, right-click opens the project
 * menu, and a series dropped onto it joins the band.
 */
export const ProjectGroup: React.FC<ProjectGroupProps> = ({
  item,
  isExpanded,
  onToggle,
  sidebarOpen,
  pathname,
  itemActions,
  seriesActions,
  projectActions,
  expandedSeries,
  onToggleSeries,
  expandedTabs,
  onToggleTabs,
  selection,
  dnd,
}) => {
  const projectId = item.project.id;
  const {
    renamingProjectId,
    projectRenameValue,
    setProjectRenameValue,
    projectRenameInputRef,
    handleProjectContextMenu,
    handleProjectDoubleClick,
    handleProjectRenameBlur,
    handleProjectRenameKeyDown,
  } = projectActions;
  const isRenaming = renamingProjectId === projectId;

  const handleHeaderDragOver = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
      e.preventDefault();
      dnd.onReorderDragOver(projectId, dropPositionFromEvent(e));
    },
    [dnd, projectId],
  );
  const handleHeaderDrop = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      dnd.onReorderDrop(projectId, dropPositionFromEvent(e));
    },
    [dnd, projectId],
  );

  // A series dragged onto the header drops *into* the project; a project dragged
  // over it reorders in the root list.
  const isDropInto = dnd.dragOverProjectId === projectId;
  const headerDropIndicator = dnd.dropTarget?.id === projectId
    ? dnd.dropTarget.position
    : null;

  return (
    <Box sx={{ mt: 1, mb: 0.25 }}>
      <ListItem disablePadding sx={{ display: "block" }}>
        <ListItemButton
          aria-expanded={isExpanded}
          draggable={!isRenaming}
          onClick={() => {
            if (!isRenaming) onToggle();
          }}
          onDragStart={(e) => dnd.onProjectDragStart(e, projectId)}
          onDragEnd={dnd.onDragEnd}
          onDragOver={handleHeaderDragOver}
          onDragLeave={dnd.onDragLeaveRow}
          onDrop={handleHeaderDrop}
          onContextMenu={(e) => handleProjectContextMenu(e, projectId)}
          onDoubleClick={(e) => {
            if (sidebarOpen) {
              handleProjectDoubleClick(e, projectId, item.project.title);
            }
          }}
          sx={{
            minHeight: 24,
            pl: 2,
            pr: 1,
            py: 0.25,
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            position: "relative",
            // The divider isn't a "selectable pill", so no filled-pill hover —
            // just a light tint (the pointer cursor signals it's clickable).
            "&:hover": { bgcolor: "action.hover" },
            // Drop-a-series-into-band: soft full-width fill + primary-tinted rules
            // (a band highlight rather than SeriesGroup's pill outline).
            ...(isDropInto && {
              "&, &:hover": {
                bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
              },
              "& .tag-rule": { bgcolor: "primary.main" },
            }),
            // Reorder line when a project is dragged over this header.
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
            "&.Mui-focusVisible": {
              bgcolor: "transparent",
              outline: "2px solid",
              outlineColor: "primary.main",
              outlineOffset: "-2px",
            },
          }}
        >
          {sidebarOpen && isRenaming
            ? (
              <TextField
                inputRef={projectRenameInputRef}
                value={projectRenameValue}
                onChange={(e) => setProjectRenameValue(e.target.value)}
                onBlur={handleProjectRenameBlur}
                onKeyDown={handleProjectRenameKeyDown}
                onClick={(e) => e.stopPropagation()}
                size="small"
                variant="standard"
                sx={{
                  flexShrink: 0,
                  "& .MuiInput-input": {
                    fontSize: SB_FONT.meta,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    py: 0,
                  },
                }}
              />
            )
            : sidebarOpen && (
              <Typography
                component="span"
                noWrap
                sx={{
                  flexShrink: 0,
                  fontSize: SB_FONT.meta,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "text.disabled",
                  lineHeight: 1,
                  minWidth: 0,
                }}
              >
                {item.project.title}
              </Typography>
            )}
          {/* Trailing rule — stretches from after the title to the edge. */}
          <Box
            className="tag-rule"
            sx={{
              flex: 1,
              minWidth: LEAD_RULE_W,
              height: "1px",
              bgcolor: "divider",
            }}
          />
        </ListItemButton>
      </ListItem>

      <Collapse in={isExpanded} timeout="auto">
        {item.children.map((child, childIndex) => (
          <SeriesGroup
            key={`series-${child.series!.id}`}
            group={child as SeriesGroupItem & {
              series: NonNullable<SeriesGroupItem["series"]>;
            }}
            groupIndex={childIndex}
            isExpanded={expandedSeries.has(child.series!.id)}
            onToggle={() => onToggleSeries(child.series!.id)}
            sidebarOpen={sidebarOpen}
            pathname={pathname}
            itemActions={itemActions}
            seriesActions={seriesActions}
            expandedTabs={expandedTabs}
            onToggleTabs={onToggleTabs}
            selection={selection}
            dnd={dnd}
          />
        ))}
      </Collapse>
    </Box>
  );
};
