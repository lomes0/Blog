import React from "react";
import {
  Box,
  Collapse,
  ListItem,
  ListItemButton,
  ListItemIcon,
  TextField,
  Typography,
} from "@mui/material";
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
import type { SidebarDndResult } from "./hooks/useSidebarDnd";
import { SeriesGroup } from "./SeriesGroup";
import { CHEVRON_TRANSITION, SB_FONT, SB_ITEM_RADIUS } from "./constants";
import { ICON_SIZE } from "@/theme/icons";

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
 * A project section in the sidebar tree: an `overline`-style header (uppercase,
 * tracked, muted — DESIGN.md §17.2 / §chrome section headers) that collapses to
 * reveal its member series. The header is the whole toggle target (VS Code tree
 * behavior); double-click renames inline, right-click opens the project menu.
 *
 * Series membership drag/drop (into/out of a project, reordering projects) is
 * added in a later phase; here the header is a grouping + collapse affordance.
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

  return (
    <Box sx={{ mt: 1, mb: 0.25 }}>
      <ListItem disablePadding sx={{ display: "block" }}>
        <ListItemButton
          aria-expanded={isExpanded}
          onClick={() => {
            if (!isRenaming) onToggle();
          }}
          onContextMenu={(e) => handleProjectContextMenu(e, projectId)}
          onDoubleClick={(e) => {
            if (sidebarOpen) {
              handleProjectDoubleClick(e, projectId, item.project.title);
            }
          }}
          sx={{
            minHeight: 24,
            px: 2,
            py: 0.25,
            borderRadius: SB_ITEM_RADIUS,
            "&:hover": { bgcolor: "action.hover" },
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
              color: "text.disabled",
              "& > svg": {
                transition: CHEVRON_TRANSITION,
                transform: isExpanded ? "rotate(90deg)" : "none",
              },
            }}
          >
            <ChevronRight size={ICON_SIZE.inline} strokeWidth={2} />
          </ListItemIcon>
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
                fullWidth
                sx={{
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
                  fontSize: SB_FONT.meta,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "text.disabled",
                  lineHeight: 1,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {item.project.title}
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
