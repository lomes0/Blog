"use client";
import React, { useCallback, useRef } from "react";
import { Box, Checkbox, InputBase, Typography } from "@mui/material";
import { GripVertical } from "lucide-react";
import { Series, User, UserDocument } from "@/types";
import { useRouter } from "next/navigation";
import { formatRelativeDate } from "@/utils/dateFormat";
import { ListDensity, TagStyle } from "../types";
import { PostRowContextMenu } from "./PostRowContextMenu";
import { ICON_SIZE } from "@/theme/icons";

interface PostRowProps {
  post: UserDocument;
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
  onDelete: (post: UserDocument) => void;
  onDragStart: (e: React.DragEvent, postId: string) => void;
  onDragEnd: () => void;
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
  indent = 0,
  availableSeries,
  onMoveToSeries,
}: PostRowProps) {
  const router = useRouter();
  const document = post.cloud || post.local;
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

  return (
    <Box
      className="post-list-row"
      onClick={handleRowClick}
      sx={{
        display: "flex",
        alignItems: "center",
        minHeight: rowHeight,
        pl: indent ? `${indent}px` : 1,
        pr: 1,
        borderRadius: 0.5,
        position: "relative",
        cursor: "default",
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
                fontSize: "0.875rem",
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
                fontSize: "0.875rem",
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
          availableSeries={availableSeries}
          onMoveToSeries={onMoveToSeries}
        />
      </Box>
    </Box>
  );
});
