"use client";
import React, { useCallback, useRef } from "react";
import { Box, Checkbox, InputBase, Typography } from "@mui/material";
import { GripVertical } from "lucide-react";
import { Post, Series } from "@/types";
import { type DropPosition, dropPositionFromEvent } from "@/lib/dragDrop";
import { formatRelativeDate } from "@/utils/dateFormat";
import { ListDensity } from "../types";
import { PostRowContextMenu } from "./PostRowContextMenu";
import { ICON_SIZE } from "@/theme/icons";
import {
  dropIndicatorSx,
  ROW_TRANSITION,
  rowHoverRevealSx,
  TREE_ROW_RADIUS,
} from "@/theme/treeRow";
import type { InlineRenameResult } from "@/hooks/useInlineRename";
import { documentCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";

interface PostRowProps {
  post: Post;
  density: ListDensity;
  isSelected: boolean;
  /** Shared rename machine — one row across the whole list is open at a time. */
  rename: InlineRenameResult<undefined>;
  onToggleSelect: (id: string, event: React.MouseEvent) => void;
  onDelete: (post: Post) => void;
  onDragStart: (e: React.DragEvent, postId: string) => void;
  onDragEnd: () => void;
  /** Reposition this post among its siblings (menu / keyboard). */
  onReorder?: (direction: "up" | "down" | "top" | "bottom") => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  /**
   * Drop-to-reorder: when set, this row is a drop target that reports where a
   * dragged item would land relative to it. Only wired for root-level rows.
   */
  onReorderDragOver?: (postId: string, position: DropPosition) => void;
  onReorderDrop?: (postId: string, position: DropPosition) => void;
  onReorderDragLeave?: () => void;
  /** Insertion indicator to render for this row, if any. */
  dropIndicator?: DropPosition | null;
  /** Left indent in px (for series children). */
  indent?: number;
  /** Series the post can be moved to. Hidden when empty. */
  availableSeries?: Series[];
  onMoveToSeries?: (seriesId: string) => void;
}

export const PostRow = React.memo(function PostRow({
  post,
  density,
  isSelected,
  rename,
  onToggleSelect,
  onDelete,
  onDragStart,
  onDragEnd,
  onReorder,
  canMoveUp,
  canMoveDown,
  onReorderDragOver,
  onReorderDrop,
  onReorderDragLeave,
  dropIndicator,
  indent = 0,
  availableSeries,
  onMoveToSeries,
}: PostRowProps) {
  const run = useCommandRun();
  const document = post;
  const name = document?.title || "Untitled";
  const date = document?.updatedAt || document?.createdAt;
  const isEditing = rename.renamingId === post.id;
  const rowHeight = density === "compact" ? 36 : 44;
  // Stable identity (see useInlineRename), so it can be a callback dependency.
  const { start: startRename } = rename;

  // Single-click vs double-click: 200ms delay to distinguish
  const singleClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTitleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (singleClickTimer.current) {
      clearTimeout(singleClickTimer.current);
      singleClickTimer.current = null;
      startRename(post.id);
      return;
    }
    singleClickTimer.current = setTimeout(() => {
      singleClickTimer.current = null;
      if (document?.id) {
        run(documentCommands.open, { id: document.id, mode: "read" });
      }
    }, 200);
  }, [post.id, document?.id, run, startRename]);

  const handleRowClick = useCallback((e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      e.preventDefault();
      onToggleSelect(post.id, e);
    }
  }, [post.id, onToggleSelect]);

  const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelect(post.id, e);
  }, [post.id, onToggleSelect]);

  const handleReorderDragOver = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      if (!onReorderDragOver) return;
      e.preventDefault();
      onReorderDragOver(post.id, dropPositionFromEvent(e));
    },
    [onReorderDragOver, post.id],
  );
  const handleReorderDrop = useCallback((e: React.DragEvent<HTMLElement>) => {
    if (!onReorderDrop) return;
    e.preventDefault();
    onReorderDrop(post.id, dropPositionFromEvent(e));
  }, [onReorderDrop, post.id]);

  return (
    <Box>
      <Box
        className="post-list-row"
        onClick={handleRowClick}
        onDragOver={onReorderDragOver ? handleReorderDragOver : undefined}
        onDrop={onReorderDrop ? handleReorderDrop : undefined}
        onDragLeave={onReorderDragLeave}
        sx={{
          display: "flex",
          alignItems: "center",
          minHeight: rowHeight,
          pl: indent ? `${indent}px` : 1,
          pr: 1,
          borderRadius: TREE_ROW_RADIUS,
          position: "relative",
          cursor: "default",
          ...(dropIndicator && dropIndicatorSx(dropIndicator)),
          bgcolor: isSelected ? "action.selected" : "transparent",
          transition: ROW_TRANSITION,
          "&:hover": {
            bgcolor: isSelected ? "action.selected" : "action.hover",
          },
          ...rowHoverRevealSx,
        }}
      >
        {/* Gutter: Checkbox + Drag Handle */}
        <Box
          className="row-checkbox-grip"
          sx={{
            visibility: isSelected ? "visible" : "hidden",
            display: "flex",
            alignItems: "center",
            gap: 0.25,
            flexShrink: 0,
            mr: 0.5,
            width: 36,
          }}
        >
          <Box
            draggable
            onDragStart={(e) => onDragStart(e, post.id)}
            onDragEnd={onDragEnd}
            sx={{
              cursor: "grab",
              color: "text.disabled",
              display: "flex",
              alignItems: "center",
              "&:active": { cursor: "grabbing" },
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={ICON_SIZE.inline} />
          </Box>
          <Checkbox
            size="small"
            checked={isSelected}
            onClick={handleCheckboxClick}
            sx={{ p: 0, width: 18, height: 18 }}
          />
        </Box>

        {/* Title */}
        <Box sx={{ flex: 1, minWidth: 0, mr: 2 }}>
          {isEditing
            ? (
              <InputBase
                inputRef={rename.inputRef}
                value={rename.value}
                onChange={(e) => rename.setValue(e.target.value)}
                onBlur={rename.handleBlur}
                onKeyDown={rename.handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                fullWidth
                sx={{
                  fontWeight: 600,
                  typography: "body2",
                  color: "text.primary",
                  borderBottom: "1px solid",
                  borderColor: "primary.main",
                  "& input": { p: 0 },
                }}
              />
            )
            : (
              <Typography
                onClick={handleTitleClick}
                component="span"
                noWrap
                sx={{
                  fontWeight: 600,
                  typography: "body2",
                  color: "text.primary",
                  display: "block",
                  cursor: "pointer",
                }}
              >
                {name}
              </Typography>
            )}
        </Box>

        {/* Spacer holding the gap between the title and the date. */}
        <Box
          sx={{
            display: "flex",
            gap: 0.5,
            flexShrink: 0,
            mr: 1.5,
            minWidth: 0,
            maxWidth: 160,
          }}
        />

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
            transition: "opacity 0.15s",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          {date ? formatRelativeDate(date) : ""}
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
            mode="post"
            onRename={() => startRename(post.id)}
            onDelete={() => onDelete(post)}
            onReorder={onReorder}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            availableSeries={availableSeries}
            onMoveToSeries={onMoveToSeries}
          />
        </Box>
      </Box>
    </Box>
  );
});
