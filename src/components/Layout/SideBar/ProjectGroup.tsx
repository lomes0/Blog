import React, { useCallback } from "react";
import {
  Box,
  Collapse,
  ListItem,
  ListItemButton,
  TextField,
  Typography,
} from "@mui/material";
import type {
  ProjectGroupItem,
  SeriesGroupItem,
} from "@/utils/posts/seriesGrouping";
import type {
  PostItemActions,
  ProjectItemActions,
  SeriesItemActions,
} from "./hooks/useSidebarActions";
import type { RowSelectionResult } from "@/hooks/useRowSelection";
import type { TreeDndResult } from "@/lib/tree/useTreeDnd";
import { DRAG_MIME, dropPositionFromEvent } from "@/lib/dragDrop";
import { SeriesGroup } from "./SeriesGroup";
import { SB_FONT } from "./constants";
import {
  chromeFocusRingSx,
  dropIndicatorSx,
  dropIntoSx,
} from "@/theme/treeRow";

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
  selection: RowSelectionResult;
  dnd: TreeDndResult;
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
  const { rename } = projectActions;
  const isRenaming = rename.renamingId === projectId;

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
          onContextMenu={(e) => projectActions.openContextMenu(e, projectId)}
          onDoubleClick={(e) => {
            if (sidebarOpen) {
              e.preventDefault();
              rename.start(projectId);
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
            // Drop-a-series-into-band: the shared fill, plus primary-tinted
            // rules — a band highlight rather than SeriesGroup's pill outline.
            ...(isDropInto && {
              ...dropIntoSx(),
              "& .tag-rule": { bgcolor: "primary.main" },
            }),
            // Reorder line when a project is dragged over this header.
            ...(headerDropIndicator && dropIndicatorSx(headerDropIndicator)),
            ...chromeFocusRingSx(),
          }}
        >
          {sidebarOpen && isRenaming
            ? (
              <TextField
                inputRef={rename.inputRef}
                value={rename.value}
                onChange={(e) => rename.setValue(e.target.value)}
                onBlur={rename.handleBlur}
                onKeyDown={rename.handleKeyDown}
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
