"use client";
import React, { useCallback } from "react";
import {
  Box,
  Button,
  Checkbox,
  Collapse,
  InputBase,
  Typography,
} from "@mui/material";
import { ChevronRight } from "lucide-react";
import { Post, Series } from "@/types";
import {
  DRAG_MIME,
  type DropPosition,
  dropPositionFromEvent,
} from "@/lib/dragDrop";
import { formatRelativeDate } from "@/utils/dateFormat";
import { ListDensity } from "../types";
import { PostRow } from "./PostRow";
import { PostRowContextMenu } from "./PostRowContextMenu";
import type { InlineRenameResult } from "@/hooks/useInlineRename";
import { ICON_SIZE } from "@/theme/icons";
import {
  dropIntoSx,
  ROW_TRANSITION,
  rowHoverRevealSx,
  TREE_ROW_RADIUS,
} from "@/theme/treeRow";

const SERIES_INLINE_LIMIT = 20;
const SERIES_PREVIEW_COUNT = 3;

interface SeriesRowProps {
  series: Series;
  posts: Post[];
  density: ListDensity;
  isSelected: boolean;
  /** Whether a given child post is part of the current selection. */
  isPostSelected: (id: string) => boolean;
  isExpanded: boolean;
  onToggleExpand: (seriesId: string) => void;
  onToggleSelect: (id: string, event: React.MouseEvent) => void;
  /** Rename machine for series titles — shared with the other root-level rows. */
  seriesRename: InlineRenameResult<undefined>;
  /** Rename machine for posts, passed straight through to each child row. */
  postRename: InlineRenameResult<undefined>;
  onDeleteSeries: (seriesId: string, seriesTitle: string) => void;
  onDeletePost: (post: Post) => void;
  /** Drag source for the child post rows. */
  onPostDragStart: (e: React.DragEvent, postId: string) => void;
  onDragEnd: () => void;
  /**
   * Header drag handlers, from the shared tree engine. It decides from the
   * dragged row's kind whether a hover over this header means "drop into this
   * series" or "reorder against it", so the header reports position either way.
   */
  onReorderDragOver: (
    seriesId: string,
    position: DropPosition,
    event?: React.DragEvent,
  ) => void;
  onReorderDrop: (
    seriesId: string,
    position: DropPosition,
    event?: React.DragEvent,
  ) => void;
  onDragLeaveRow: () => void;
  /** This header is the drop-into target: posts would land in this series. */
  isDragOver: boolean;
  /** Reposition a post within this series (menu / keyboard). */
  onReorderPost?: (
    siblings: Post[],
    postId: string,
    direction: "up" | "down" | "top" | "bottom",
  ) => void;
  /** Reposition this series within the root list (menu / keyboard). */
  onReorder?: (direction: "up" | "down" | "top" | "bottom") => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  /** Other series a child post can be moved to (current series excluded). */
  availableSeries?: Series[];
  onMovePost?: (postId: string, seriesId: string) => void;
}

export const SeriesRow = React.memo(function SeriesRow({
  series,
  posts,
  density,
  isSelected,
  isPostSelected,
  isExpanded,
  onToggleExpand,
  onToggleSelect,
  seriesRename,
  postRename,
  onDeleteSeries,
  onReorder,
  canMoveUp,
  canMoveDown,
  onDeletePost,
  onPostDragStart,
  onDragEnd,
  onReorderDragOver,
  onReorderDrop,
  onDragLeaveRow,
  isDragOver,
  onReorderPost,
  availableSeries,
  onMovePost,
}: SeriesRowProps) {
  const postCount = posts.length;

  const mostRecentDate = posts.reduce<string | undefined>((latest, p) => {
    const d = p.updatedAt || p.createdAt;
    if (!d) return latest;
    if (!latest) return String(d);
    return new Date(d) > new Date(latest) ? String(d) : latest;
  }, undefined);

  const handleRowClick = useCallback((e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      e.preventDefault();
      onToggleSelect(series.id, e);
    } else {
      onToggleExpand(series.id);
    }
  }, [series.id, onToggleExpand, onToggleSelect]);

  const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelect(series.id, e);
  }, [series.id, onToggleSelect]);

  // The event is passed on so a drag that started on another tree surface (the
  // sidebar is on screen beside this list) can still drop a post into a series.
  const handleDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    onReorderDragOver(series.id, dropPositionFromEvent(e), e);
  }, [series.id, onReorderDragOver]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    onReorderDrop(series.id, dropPositionFromEvent(e), e);
  }, [series.id, onReorderDrop]);

  // Determine which child posts to show
  const inlineAll = postCount <= SERIES_INLINE_LIMIT;
  const visiblePosts = inlineAll ? posts : [...posts]
    .sort((a, b) => {
      const da = new Date(a.updatedAt || a.createdAt || 0)
        .getTime();
      const db = new Date(b.updatedAt || b.createdAt || 0)
        .getTime();
      return db - da;
    })
    .slice(0, SERIES_PREVIEW_COUNT);

  const rowHeight = density === "compact" ? 36 : 44;

  return (
    <Box>
      {/* Series header row — whole row is the hover-bg, matching variant-a.jsx */}
      <Box
        className="post-list-row series-row"
        onClick={handleRowClick}
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
          // Drop-a-post-into-this-series: the shared tint (§17.3) plus the pill
          // outline that marks the header as a container — same pair the
          // sidebar's SeriesGroup draws. Spread last so it wins the hover rule.
          ...(isDragOver && {
            ...dropIntoSx(),
            outline: "1.5px solid",
            outlineColor: "primary.main",
            outlineOffset: "-1px",
          }),
        }}
      >
        {/* Gutter — 22px, checkbox only, no drag handle for series */}
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

        {/* Chevron — direct flex sibling so it aligns with the title */}
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

        {/* Title area */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          {seriesRename.renamingId === series.id
            ? (
              <InputBase
                inputRef={seriesRename.inputRef}
                value={seriesRename.value}
                onChange={(e) => {
                  e.stopPropagation();
                  seriesRename.setValue(e.target.value);
                }}
                onBlur={seriesRename.handleBlur}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  seriesRename.handleKeyDown(e);
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
                {series.title}
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
            {postCount} {postCount === 1 ? "post" : "posts"}
          </Typography>
        </Box>

        {/* Date */}
        <Typography
          variant="caption"
          className="row-date"
          sx={{
            color: "text.secondary",
            width: 70,
            textAlign: "right",
            flexShrink: 0,
            mr: 0.5,
            typography: "micro",
            transition: "opacity 80ms",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          {mostRecentDate ? formatRelativeDate(mostRecentDate) : ""}
        </Typography>

        {/* ⋯ Actions */}
        <Box
          sx={{
            flexShrink: 0,
            width: 28,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <PostRowContextMenu
            mode="series"
            onRename={() => seriesRename.start(series.id)}
            onDelete={() => onDeleteSeries(series.id, series.title)}
            onReorder={onReorder}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
          />
        </Box>
      </Box>

      {/* Inline children */}
      <Collapse in={isExpanded} unmountOnExit>
        <Box
          sx={{
            borderLeft: "2px solid",
            borderColor: "divider",
            ml: "37px",
            mb: 0.5,
          }}
        >
          {visiblePosts.map((p) => {
            // Reorder against the full rank-ordered list, not the (possibly
            // date-sorted, truncated) preview slice.
            const fullIdx = posts.findIndex((x) => x.id === p.id);
            return (
              <PostRow
                key={p.id}
                post={p}
                density={density}
                isSelected={isPostSelected(p.id)}
                rename={postRename}
                onToggleSelect={onToggleSelect}
                onDelete={onDeletePost}
                onDragStart={onPostDragStart}
                onDragEnd={onDragEnd}
                onReorder={onReorderPost && inlineAll
                  ? (direction) => onReorderPost(posts, p.id, direction)
                  : undefined}
                canMoveUp={fullIdx > 0}
                canMoveDown={fullIdx < posts.length - 1}
                indent={8}
                availableSeries={availableSeries}
                onMoveToSeries={onMovePost
                  ? (seriesId) => onMovePost(p.id, seriesId)
                  : undefined}
              />
            );
          })}
          {!inlineAll && (
            <Box sx={{ px: 1, py: 0.5 }}>
              <Button
                variant="text"
                size="small"
                href={`/posts/${series.id}`}
                sx={{
                  typography: "caption",
                  color: "text.secondary",
                  textTransform: "none",
                  p: 0.5,
                  "&:hover": {
                    color: "primary.main",
                    bgcolor: "transparent",
                    textDecoration: "underline",
                  },
                }}
              >
                View all {postCount} posts →
              </Button>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
});
