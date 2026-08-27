"use client";
import React, { useCallback } from "react";
import {
  Box,
  Checkbox,
  Collapse,
  InputBase,
  Typography,
} from "@mui/material";
import { ChevronRight, FolderOpen } from "lucide-react";
import { Post, Project, Series } from "@/types";
import type { SeriesGroupItem } from "@/utils/posts/seriesGrouping";
import {
  DRAG_MIME,
  type DropPosition,
  dropPositionFromEvent,
} from "@/lib/dragDrop";
import { ListDensity } from "../types";
import { PostRow } from "./PostRow";
import { PostRowContextMenu } from "./PostRowContextMenu";
import { SeriesRow } from "./SeriesRow";
import type { InlineRenameResult } from "@/hooks/useInlineRename";
import { ICON_SIZE } from "@/theme/icons";
import {
  dropIndicatorSx,
  dropIntoSx,
  ROW_TRANSITION,
  rowHoverRevealSx,
  TREE_ROW_RADIUS,
} from "@/theme/treeRow";

/**
 * A project on `/posts`: a row that contains its series.
 *
 * This is the row `/posts` did not have, and the reason it did not is
 * `docs/plans/archive/tree-model-brief.md` §0 — whether a project appears here
 * at all was a product question, answered yes on 27 Aug 2026. With it, `/posts`
 * and the sidebar render the same three-level tree from the same `RootItem`.
 *
 * **Deliberately not a port of `SideBar/ProjectGroup`.** That draws a project as
 * a labeled band — an `overline` title with a rule running to the right edge —
 * which reads correctly in a 240px chrome column and not at all in a full-width
 * content list. §4 of the brief called this out and §6 left the choice open;
 * this picks the other one, so a project here is a container row with the pill
 * outline `SeriesRow` already uses for the same meaning. One surface, one idiom.
 */

interface ProjectRowProps {
  project: Project;
  /**
   * Member series groups, already rank-ordered by `groupRootItems`.
   *
   * Named `groups` rather than `children` on purpose: React gives that name a
   * meaning of its own, and a prop that shadows it reads as JSX content at every
   * call site that does not pass it as an attribute.
   */
  groups: SeriesGroupItem[];
  density: ListDensity;
  isSelected: boolean;
  isRowSelected: (id: string) => boolean;
  isExpanded: boolean;
  onToggleExpand: (projectId: string) => void;
  onToggleSelect: (id: string, event: React.MouseEvent) => void;
  projectRename: InlineRenameResult<undefined>;
  seriesRename: InlineRenameResult<undefined>;
  postRename: InlineRenameResult<undefined>;
  onDeleteProject: (projectId: string, title: string) => void;
  onDeleteSeries: (seriesId: string, seriesTitle: string) => void;
  onDeletePost: (post: Post) => void;
  /** Per-series expansion, shared with the root-level series rows. */
  expandedSeries: Set<string>;
  onToggleSeries: (seriesId: string) => void;
  onPostDragStart: (e: React.DragEvent, postId: string) => void;
  onSeriesDragStart: (e: React.DragEvent, seriesId: string) => void;
  onProjectDragStart: (e: React.DragEvent, projectId: string) => void;
  onDragEnd: () => void;
  onReorderDragOver: (
    id: string,
    position: DropPosition,
    event?: React.DragEvent,
  ) => void;
  onReorderDrop: (
    id: string,
    position: DropPosition,
    event?: React.DragEvent,
  ) => void;
  onDragLeaveRow: () => void;
  /** True when a dragged *series* would land in this project. */
  isDragOver: boolean;
  /** Which child id is the drop-into target, so a child header can tint. */
  dragOverId: string | null;
  dropIndicator: DropPosition | null;
  /** Which child id carries an insertion line. */
  childDropIndicator: (id: string) => DropPosition | null;
  onReorder?: (direction: "up" | "down" | "top" | "bottom") => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  /** Reposition a series among this project's members. */
  onReorderSeries?: (
    siblings: SeriesGroupItem[],
    index: number,
    direction: "up" | "down" | "top" | "bottom",
  ) => void;
  onReorderPost?: (
    siblings: Post[],
    postId: string,
    direction: "up" | "down" | "top" | "bottom",
  ) => void;
  availableSeries?: Series[];
  onMovePost?: (postId: string, seriesId: string) => void;
}

export const ProjectRow = React.memo(function ProjectRow({
  project,
  groups,
  density,
  isSelected,
  isRowSelected,
  isExpanded,
  onToggleExpand,
  onToggleSelect,
  projectRename,
  seriesRename,
  postRename,
  onDeleteProject,
  onDeleteSeries,
  onDeletePost,
  expandedSeries,
  onToggleSeries,
  onPostDragStart,
  onSeriesDragStart,
  onProjectDragStart,
  onDragEnd,
  onReorderDragOver,
  onReorderDrop,
  onDragLeaveRow,
  isDragOver,
  dragOverId,
  dropIndicator,
  childDropIndicator,
  onReorder,
  canMoveUp,
  canMoveDown,
  onReorderSeries,
  onReorderPost,
  availableSeries,
  onMovePost,
}: ProjectRowProps) {
  const isRenaming = projectRename.renamingId === project.id;
  const seriesCount = groups.length;
  const postCount = groups.reduce((sum, g) => sum + g.posts.length, 0);

  const handleRowClick = useCallback((e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      e.preventDefault();
      onToggleSelect(project.id, e);
    } else {
      onToggleExpand(project.id);
    }
  }, [project.id, onToggleExpand, onToggleSelect]);

  const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelect(project.id, e);
  }, [project.id, onToggleSelect]);

  // The event travels on for the same reason `SeriesRow` passes it: the sidebar
  // is on screen beside this list, so a drag can start on one surface and end
  // on the other.
  const handleDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    onReorderDragOver(project.id, dropPositionFromEvent(e), e);
  }, [project.id, onReorderDragOver]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    onReorderDrop(project.id, dropPositionFromEvent(e), e);
  }, [project.id, onReorderDrop]);

  const handleDragStart = useCallback((e: React.DragEvent<HTMLElement>) => {
    onProjectDragStart(e, project.id);
  }, [project.id, onProjectDragStart]);

  const rowHeight = density === "compact" ? 36 : 44;

  return (
    <Box>
      <Box
        className="post-list-row project-row"
        onClick={handleRowClick}
        draggable={!isRenaming}
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={onDragLeaveRow}
        onDrop={handleDrop}
        sx={{
          display: "flex",
          alignItems: "center",
          minHeight: rowHeight,
          px: 1,
          borderRadius: TREE_ROW_RADIUS,
          position: "relative",
          cursor: "pointer",
          bgcolor: isSelected ? "action.selected" : "transparent",
          outline: isSelected ? "1px solid" : "none",
          outlineColor: "secondary.main",
          outlineOffset: -1,
          transition: ROW_TRANSITION,
          "&:hover": {
            bgcolor: isSelected ? "action.selected" : "action.hover",
          },
          ...rowHoverRevealSx,
          ...(isDragOver && {
            ...dropIntoSx(),
            outline: "1.5px solid",
            outlineColor: "primary.main",
            outlineOffset: "-1px",
          }),
          ...(dropIndicator && dropIndicatorSx(dropIndicator)),
        }}
      >
        <Box
          className="row-checkbox-grip"
          sx={{
            width: 22,
            display: "flex",
            justifyContent: "center",
            flexShrink: 0,
            visibility: isSelected ? "visible" : "hidden",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            size="small"
            checked={isSelected}
            onClick={handleCheckboxClick}
            sx={{ p: 0, width: 14, height: 14 }}
          />
        </Box>

        <ChevronRight
          size={ICON_SIZE.inline}
          style={{
            color: "var(--mui-palette-text-secondary)",
            flexShrink: 0,
            marginRight: 6,
            transition: "transform 120ms",
            transform: isExpanded ? "rotate(90deg)" : "none",
          }}
        />

        {/* The one thing distinguishing a project row from a series row at a
            glance. A series is a reading order; a project is a drawer. */}
        <FolderOpen
          size={ICON_SIZE.inline}
          style={{
            color: "var(--mui-palette-text-secondary)",
            flexShrink: 0,
            marginRight: 6,
          }}
        />

        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          {isRenaming
            ? (
              <InputBase
                inputRef={projectRename.inputRef}
                value={projectRename.value}
                onChange={(e) => {
                  e.stopPropagation();
                  projectRename.setValue(e.target.value);
                }}
                onBlur={projectRename.handleBlur}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  projectRename.handleKeyDown(e);
                }}
                onClick={(e) => e.stopPropagation()}
                sx={{
                  fontWeight: 600,
                  typography: "body2",
                  flex: 1,
                  minWidth: 0,
                  borderBottom: "1px solid",
                  borderColor: "primary.main",
                  "& input": { p: 0 },
                }}
              />
            )
            : (
              <Typography
                noWrap
                sx={{
                  fontWeight: 600,
                  typography: "body2",
                  color: "text.primary",
                }}
              >
                {project.title}
              </Typography>
            )}
          <Typography
            className="row-post-count"
            variant="caption"
            sx={{
              color: "text.disabled",
              fontSize: "0.71875rem",
              flexShrink: 0,
              opacity: 0,
              transition: "opacity 120ms",
            }}
          >
            {seriesCount} {seriesCount === 1 ? "series" : "series"} ·{" "}
            {postCount} {postCount === 1 ? "post" : "posts"}
          </Typography>
        </Box>

        <Box
          sx={{
            flexShrink: 0,
            width: 28,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <PostRowContextMenu
            mode="project"
            onRename={() => projectRename.start(project.id)}
            onDelete={() => onDeleteProject(project.id, project.title)}
            onReorder={onReorder}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
          />
        </Box>
      </Box>

      <Collapse in={isExpanded} unmountOnExit>
        <Box
          sx={{
            borderLeft: "2px solid",
            borderColor: "divider",
            ml: "37px",
            mb: 0.5,
          }}
        >
          {/* An empty project still renders its drawer, open, saying so. A
              container with nothing in it and no way to tell it apart from a
              collapsed one is the state a drop target most needs to announce. */}
          {groups.length === 0 && (
            <Typography
              variant="caption"
              sx={{ display: "block", px: 1.5, py: 1, color: "text.disabled" }}
            >
              No series yet — drag one here.
            </Typography>
          )}

          {groups.map((group, index) =>
            group.type === "series" && group.series
              ? (
                <SeriesRow
                  key={group.series.id}
                  series={group.series}
                  posts={group.posts}
                  density={density}
                  isSelected={isRowSelected(group.series.id)}
                  isPostSelected={isRowSelected}
                  isExpanded={expandedSeries.has(group.series.id)}
                  onToggleExpand={onToggleSeries}
                  onToggleSelect={onToggleSelect}
                  seriesRename={seriesRename}
                  postRename={postRename}
                  onDeleteSeries={onDeleteSeries}
                  onDeletePost={onDeletePost}
                  onPostDragStart={onPostDragStart}
                  onSeriesDragStart={onSeriesDragStart}
                  onDragEnd={onDragEnd}
                  onReorderDragOver={onReorderDragOver}
                  onReorderDrop={onReorderDrop}
                  onDragLeaveRow={onDragLeaveRow}
                  isDragOver={dragOverId === group.series.id}
                  dropIndicator={childDropIndicator(group.series.id)}
                  onReorderPost={onReorderPost}
                  onReorder={onReorderSeries
                    ? (direction) => onReorderSeries(groups, index, direction)
                    : undefined}
                  canMoveUp={index > 0}
                  canMoveDown={index < groups.length - 1}
                  availableSeries={availableSeries}
                  onMovePost={onMovePost}
                />
              )
              : (
                // `groupRootItems` only lifts *series* into a project, so this
                // arm is unreachable today. It is here because the type says it
                // is reachable, and a container that silently drops a child it
                // was handed is worse than one that renders it plainly.
                group.posts.map((post) => (
                  <PostRow
                    key={post.id}
                    post={post}
                    density={density}
                    isSelected={isRowSelected(post.id)}
                    rename={postRename}
                    onToggleSelect={onToggleSelect}
                    onDelete={onDeletePost}
                    onDragStart={onPostDragStart}
                    onDragEnd={onDragEnd}
                    indent={8}
                  />
                ))
              )
          )}
        </Box>
      </Collapse>
    </Box>
  );
});
