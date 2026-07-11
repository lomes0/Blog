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
import { ChevronRight } from "lucide-react";
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
import { CHEVRON_TRANSITION, SB_FONT } from "./constants";
import { ICON_SIZE } from "@/theme/icons";

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
 * a leading open/close chevron, the title in `overline` style (uppercase,
 * tracked, muted — DESIGN.md §17.2 / §chrome section headers), a rule stretching
 * toward the right edge, then the member count pinned to the border. The rule
 * (vs. series' folder row) still signals "band boundary," while the chevron —
 * rotating 0deg -> 90deg — carries the open/close state the way the folder glyph
 * does for a series (`▸ PHYSICS ──────── 3`).
 *
 * The count sits in a steady right-edge column (shown whether folded or open)
 * rather than only as a folded cue. The whole header is the toggle target (VS
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
          {/* Leading chevron — rotates 0deg -> 90deg to signal open/closed. The
              band has no folder row of its own, so this is its expand indicator;
              the trailing rule keeps the labeled-divider identity. */}
          <Box
            className="tag-chevron"
            sx={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              color: "text.disabled",
              "& > svg": {
                transition: CHEVRON_TRANSITION,
                transform: isExpanded ? "rotate(90deg)" : "none",
              },
            }}
          >
            <ChevronRight size={ICON_SIZE.inline} strokeWidth={2} />
          </Box>
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
          {/* Trailing rule — stretches from after the title to the count. */}
          <Box
            className="tag-rule"
            sx={{
              flex: 1,
              minWidth: LEAD_RULE_W,
              height: "1px",
              bgcolor: "divider",
            }}
          />
          {/* Member count — pinned to the right edge, next to the sidebar border.
              Always shown (not just when folded) so it reads as a steady count
              column rather than a collapse-only cue. */}
          {sidebarOpen && !isRenaming && (
            <Typography
              component="span"
              sx={{
                flexShrink: 0,
                fontSize: SB_FONT.meta,
                fontWeight: 600,
                letterSpacing: "0.04em",
                color: "text.disabled",
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {item.children.length}
            </Typography>
          )}
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
