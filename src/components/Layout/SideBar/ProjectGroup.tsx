import React, { useCallback, useMemo } from "react";
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
import { FolderPlus } from "lucide-react";
import { SeriesGroup } from "./SeriesGroup";
import { RowCreateButton } from "./RowCreateButton";
import { SB_FONT } from "./constants";
import { ICON_SIZE } from "@/theme/icons";
import { MOTION } from "@/theme/tokens";
import {
  chromeFocusRingSx,
  dropIndicatorSx,
  dropIntoSx,
  rowHoverRevealSx,
} from "@/theme/treeRow";
import { useSelector } from "@/store";
import {
  rollUpMarkers,
  selectMarkerByDocId,
} from "@/store/selectors/proposalSelectors";
import { AgentMarker as AgentMarkerComponent } from "./AgentMarker";

/** Width of the leading rule stub before the tag title (the "── " lead-in). */
const LEAD_RULE_W = 14;

/**
 * Idle, the band's rule runs the full width — past the row's own right padding,
 * flush with the sidebar's border. Hover (or keyboard focus) retracts it by that
 * padding and opens the slot beside it, so the "new series" button appears in
 * space the rule gives back rather than space held empty for it.
 *
 * The slot is a `max-width` clip rather than a width, so the button keeps its
 * natural size (18px box + its own margins) and this stays a ceiling to animate
 * toward, not a second copy of those metrics.
 */
const CREATE_SLOT_MAX_W = 32;

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

  // Agent marker roll-up: a project shows a marker when ANY descendant post
  // carries one. A project's descendants are its member series, and each series'
  // descendants are posts — so this is a two-level walk. One subscription to the
  // memoized marker map; no per-row store scan.
  const markerByDocId = useSelector(selectMarkerByDocId);
  const groupMarker = useMemo(() => {
    const descendantIds: string[] = [];
    for (const child of item.children) {
      if (child.type !== "series") continue;
      for (const post of child.posts) descendantIds.push(post.id);
    }
    return rollUpMarkers(descendantIds, markerByDocId);
  }, [item.children, markerByDocId]);

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
            // Same right padding as the series and post rows below, so the
            // trailing "new series" button ends where their count pills and
            // hover actions do instead of hanging 8px further out.
            pr: 2,
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
            ...rowHoverRevealSx,
            // Rule out to the sidebar border; button hidden and taking no width.
            // A negative margin here does not push the rule past the row — the
            // rule is the flex-grow item, so it simply grows into the padding
            // while everything after it stays put. Which is also why it is only
            // applied when nothing follows: with an agent marker present the
            // rule would grow straight through it.
            "& .tag-rule": {
              mr: groupMarker.marker ? 0 : -2,
              transition: `margin-right ${MOTION.fast}ms`,
            },
            "& .tag-create-slot": {
              display: "flex",
              flexShrink: 0,
              maxWidth: 0,
              overflow: "hidden",
              transition: `max-width ${MOTION.fast}ms`,
            },
            // `focus-within` as well as `hover`: the button is keyboard-
            // reachable (DESIGN.md §9), and a clipped slot would swallow it.
            "&:hover .tag-rule, &:focus-within .tag-rule": { mr: 0 },
            "&:hover .tag-create-slot, &:focus-within .tag-create-slot": {
              maxWidth: CREATE_SLOT_MAX_W,
            },
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
          {sidebarOpen && !isRenaming && (
            <>
              {
                /* Agent marker before the "new series" button. As with SeriesGroup,
                  do NOT suppress when expanded — a marker that flickers on every
                  fold is worse than redundancy. */
              }
              <AgentMarkerComponent
                marker={groupMarker.marker}
                count={groupMarker.count}
                sx={{ mr: 0.25 }}
              />
              <Box className="tag-create-slot">
                <RowCreateButton
                  label="New series in project"
                  icon={<FolderPlus size={ICON_SIZE.inline} strokeWidth={2} />}
                  onClick={() => seriesActions.handleCreateSeries(projectId)}
                />
              </Box>
            </>
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
