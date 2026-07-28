"use client";
import React, { useCallback, useRef } from "react";
import { Box, Checkbox, InputBase, Typography } from "@mui/material";
import { GripVertical } from "lucide-react";
import { Series, User, Post } from "@/types";
import { useRouter } from "next/navigation";
import { formatRelativeDate } from "@/utils/dateFormat";
import { ListDensity, TagStyle } from "../types";
import { PostRowContextMenu } from "./PostRowContextMenu";
import { ICON_SIZE } from "@/theme/icons";

interface PostRowProps {
  post: Post;
  user?: User;
  density: ListDensity;
  tagStyle: TagStyle;
  isSelected: boolean;
  editingName?: string;
  onToggleSelect: (id: string, event: React.MouseEvent) => void;
  onRenameStart: (postId: string, currentName: string) => void;
  onRenameChange: (postId: string, value: string) => void;
  onRenameCommit: (
    postId: string,
    documentId: string,
    originalName: string,
  ) => Promise<void>;
  onRenameCancel: (postId: string) => void;
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
  onReorderDragOver?: (postId: string, position: "before" | "after") => void;
  onReorderDrop?: (postId: string, position: "before" | "after") => void;
  onReorderDragLeave?: () => void;
  /** Insertion indicator to render for this row, if any. */
  dropIndicator?: "before" | "after" | null;
  /** Left indent in px (for series children). */
  indent?: number;
  /** Series the post can be moved to. Hidden when empty. */
  availableSeries?: Series[];
  onMoveToSeries?: (seriesId: string) => void;
}

export const PostRow = React.memo(function PostRow({
  post,
  user: _user,
  density,
  tagStyle: _tagStyle,
  isSelected,
  editingName,
  onToggleSelect,
  onRenameStart,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
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
  const router = useRouter();
  const rowRef = useRef<HTMLDivElement>(null);
  const document = post;
  const name = document?.name || "Untitled";
  const date = document?.updatedAt || document?.createdAt;
  const isEditing = editingName !== undefined;
  const rowHeight = density === "compact" ? 36 : 44;

  // Single-click vs double-click: 200ms delay to distinguish
  const singleClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTitleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (singleClickTimer.current) {
      clearTimeout(singleClickTimer.current);
      singleClickTimer.current = null;
      onRenameStart(post.id, name);
      return;
    }
    singleClickTimer.current = setTimeout(() => {
      singleClickTimer.current = null;
      if (document?.id) router.push(`/view/${document.id}`);
    }, 200);
  }, [post.id, name, document?.id, router, onRenameStart]);

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

  const handleRenameBlur = useCallback(() => {
    if (document?.id) {
      onRenameCommit(post.id, document.id, document?.name || "");
    }
  }, [post.id, document?.id, document?.name, onRenameCommit]);

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (document?.id) {
        onRenameCommit(post.id, document.id, document?.name || "");
      }
    }
    if (e.key === "Escape") onRenameCancel(post.id);
  }, [post.id, document?.id, document?.name, onRenameCommit, onRenameCancel]);

  const dropPosition = (e: React.DragEvent): "before" | "after" => {
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect) return "after";
    return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
  };
  const handleReorderDragOver = useCallback((e: React.DragEvent) => {
    if (!onReorderDragOver) return;
    e.preventDefault();
    onReorderDragOver(post.id, dropPosition(e));
  }, [onReorderDragOver, post.id]);
  const handleReorderDrop = useCallback((e: React.DragEvent) => {
    if (!onReorderDrop) return;
    e.preventDefault();
    onReorderDrop(post.id, dropPosition(e));
  }, [onReorderDrop, post.id]);

  return (
    <Box>
      <Box
        ref={rowRef}
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
          borderRadius: 0.5,
          position: "relative",
          cursor: "default",
          ...(dropIndicator && {
            "&::after": {
              content: '""',
              position: "absolute",
              left: 0,
              right: 0,
              [dropIndicator === "before" ? "top" : "bottom"]: -1,
              height: 2,
              bgcolor: "primary.main",
              zIndex: 2,
            },
          }),
          bgcolor: isSelected ? "action.selected" : "transparent",
          transition: "background-color 0.15s",
          "&:hover": {
            bgcolor: isSelected ? "action.selected" : "action.hover",
          },
          // Hover-reveal selectors for child elements
          "&:hover .row-checkbox-grip": { visibility: "visible" },
          "&:hover .row-actions-btn": { opacity: 1 },
          "&:hover .row-date": { opacity: 0.45 },
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
                autoFocus
                value={editingName}
                onChange={(e) => onRenameChange(post.id, e.target.value)}
                onBlur={handleRenameBlur}
                onKeyDown={handleRenameKeyDown}
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

        {/* Tags placeholder — renders when tags exist */}
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
            onRename={() => onRenameStart(post.id, name)}
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
