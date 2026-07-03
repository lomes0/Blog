"use client";
import React, { useCallback, useRef } from "react";
import { Box, Checkbox, Collapse, InputBase, Typography } from "@mui/material";
import { FileStack, GripVertical } from "lucide-react";
import { Series, User, UserDocument } from "@/types";
import { useRouter } from "next/navigation";
import { useSelector } from "@/store";
import { selectChildDocumentsByParent } from "@/store/selectors/layoutSelectors";
import { formatRelativeDate } from "@/utils/dateFormat";
import { ListDensity, TagStyle } from "../types";
import { PostRowContextMenu } from "./PostRowContextMenu";
import { ICON_SIZE } from "@/theme/icons";

const EMPTY_CHILDREN: UserDocument[] = [];

interface PostRowProps {
  post: UserDocument;
  user?: User;
  density: ListDensity;
  tagStyle: TagStyle;
  isSelected: boolean;
  editingName?: string;
  /** Ids of posts whose tab list is expanded. */
  expandedTabs: Set<string>;
  onToggleTabs: (id: string) => void;
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
  /** Reposition this post among its siblings (menu / keyboard). */
  onReorder?: (direction: "up" | "down" | "top" | "bottom") => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
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
  expandedTabs,
  onToggleTabs,
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

  // A tabbed post is a root document with one child per extra tab. Show those
  // tabs in an inline, collapsible list so they're not hidden behind the row.
  const childMap = useSelector(selectChildDocumentsByParent);
  const children = childMap.get(post.id) ?? EMPTY_CHILDREN;
  const hasTabs = children.length > 0;
  const isExpanded = expandedTabs.has(post.id);

  const handleToggleTabs = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleTabs(post.id);
  }, [post.id, onToggleTabs]);

  const handleTabClick = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    router.push(`/view/${tabId}`);
  }, [router]);

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
    <Box>
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

        {
          /* Tabs disclosure — a reserved slot keeps post titles aligned whether or
          not the post has tabs. A stacked-pages glyph (not the series chevron)
          marks a post that contains tabs and toggles the inline tab list. */
        }
        <Box
          sx={{
            width: 20,
            flexShrink: 0,
            mr: 0.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {hasTabs && (
            <Box
              role="button"
              aria-label={isExpanded ? "Collapse tabs" : "Expand tabs"}
              aria-expanded={isExpanded}
              onClick={handleToggleTabs}
              sx={{
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
                color: isExpanded ? "text.primary" : "text.secondary",
                "& > svg": { transition: "color 0.15s" },
                "&:hover": { color: "text.primary" },
              }}
            >
              <FileStack size={ICON_SIZE.inline} strokeWidth={2} />
            </Box>
          )}
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

      {/* Inline tab list — the post's child tabs, revealed on disclosure. */}
      {hasTabs && (
        <Collapse in={isExpanded} unmountOnExit>
          <Box
            sx={{
              borderLeft: "2px solid",
              borderColor: "divider",
              ml: `${(indent || 0) + 47}px`,
              mb: 0.5,
            }}
          >
            {children.map((child) => {
              const cd = child.cloud || child.local;
              const tabName = cd?.name || "Untitled";
              return (
                <Box
                  key={child.id}
                  onClick={(e) => handleTabClick(e, child.id)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    minHeight: rowHeight - 10,
                    pl: 1.25,
                    pr: 1,
                    borderRadius: 0.5,
                    cursor: "pointer",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <Box
                    component="span"
                    aria-hidden
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: "2px",
                      bgcolor: "text.disabled",
                      flexShrink: 0,
                    }}
                  />
                  <Typography
                    noWrap
                    sx={{
                      typography: "body2",
                      color: "text.secondary",
                      fontWeight: 500,
                    }}
                  >
                    {tabName}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Collapse>
      )}
    </Box>
  );
});
