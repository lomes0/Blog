import React, { useCallback, useMemo } from "react";
import {
  Box,
  IconButton,
  InputBase,
  ListItem,
  ListItemButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { Trash2 } from "lucide-react";
import { DocumentStatus, User, Post } from "@/types";
import { useRouter } from "next/navigation";
import PostActionMenu from "@/components/DocumentCard/PostActionMenu";
import { PendingTimeChange } from "@/types/posts";
import { TimeStepperControls } from "./TimeStepperControls";
import { formatFullDate } from "@/utils/dateFormat";
import type { InlineRenameResult } from "@/hooks/useInlineRename";
import { ICON_SIZE } from "@/theme/icons";

interface PostCompactListItemProps {
  post: Post;
  user?: User;
  isTimeEditMode: boolean;
  pendingChange?: PendingTimeChange;
  /** Shared rename machine — one row across the whole list is open at a time. */
  rename: InlineRenameResult<undefined>;
  onTimeAdjust?: (postId: string, originalDate: Date, days: number) => void;
  onTimeReset?: (postId: string) => void;
  onDelete: (post: Post) => void;
  extraIndent?: number;
}

const PostCompactListItem: React.FC<PostCompactListItemProps> = ({
  post,
  user,
  isTimeEditMode,
  pendingChange,
  rename,
  onTimeAdjust,
  onTimeReset,
  onDelete,
  extraIndent = 0,
}) => {
  const router = useRouter();
  const document = post;
  const isDone = document?.status === DocumentStatus.DONE;
  const authorName =
    (document && "author" in document && document.author?.name) || "Unknown";
  const originalDate = useMemo(
    () => new Date(document?.createdAt || new Date()),
    [document?.createdAt],
  );
  const displayDate = pendingChange ? pendingChange.newDate : originalDate;
  const hasRowChanges = !!pendingChange;
  const isEditing = rename.renamingId === post.id;
  // Stable identities (see useInlineRename), so they can be dependencies.
  const { start: startRename, setValue } = rename;

  const handleNavigate = useCallback(() => {
    if (!isTimeEditMode && document?.id) {
      router.push(`/view/${document.id}`);
    }
  }, [isTimeEditMode, document?.id, router]);

  const handleStopPropagation = useCallback(
    (e: React.SyntheticEvent) => e.stopPropagation(),
    [],
  );

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.stopPropagation();
      setValue(e.target.value);
    },
    [setValue],
  );

  // In time-edit mode every row renders its field, seeded from the stored name.
  // Focusing one is what opens the rename, so the machine only tracks the row
  // actually being edited.
  const handleNameFocus = useCallback(() => {
    if (!isEditing) startRename(post.id);
  }, [post.id, isEditing, startRename]);

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(post);
    },
    [post, onDelete],
  );

  const handleTimeAdjust = useCallback(
    (days: number) => onTimeAdjust?.(post.id, originalDate, days),
    [onTimeAdjust, post.id, originalDate],
  );

  const handleTimeReset = useCallback(
    () => onTimeReset?.(post.id),
    [onTimeReset, post.id],
  );

  return (
    <ListItem
      key={post.id}
      disablePadding
      sx={{
        bgcolor: hasRowChanges ? "warning.50" : "transparent",
        "&:hover": { bgcolor: hasRowChanges ? "warning.100" : "action.hover" },
        transition: "background-color 0.2s ease",
      }}
    >
      <ListItemButton
        onClick={handleNavigate}
        sx={{
          py: 1.25,
          pl: 2 + extraIndent,
          pr: 2,
          display: "flex",
          alignItems: "center",
          gap: 2,
          cursor: isTimeEditMode ? "default" : "pointer",
          "&:hover": { bgcolor: "transparent" },
        }}
      >
        {/* Title and Metadata */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              minWidth: 0,
            }}
          >
            {isTimeEditMode && document?.id
              ? (
                <InputBase
                  // One shared ref across the list, so only the row actually
                  // being renamed may claim it — otherwise the last row
                  // rendered would steal the hook's focus effect.
                  inputRef={isEditing ? rename.inputRef : undefined}
                  value={isEditing ? rename.value : (document?.name || "")}
                  onChange={handleNameChange}
                  onFocus={handleNameFocus}
                  onBlur={rename.handleBlur}
                  onKeyDown={rename.handleKeyDown}
                  onClick={handleStopPropagation}
                  fullWidth
                  sx={{
                    fontWeight: 500,
                    fontSize: "0.9rem",
                    letterSpacing: "-0.01em",
                    color: isDone ? "text.secondary" : "text.primary",
                    borderBottom: "1px solid",
                    borderColor: isEditing ? "primary.main" : "divider",
                    borderRadius: 0,
                    px: 0.5,
                    "& input": { p: 0 },
                  }}
                />
              )
              : (
                <Tooltip
                  title={authorName}
                  placement="top-start"
                  enterDelay={600}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 500,
                      color: isDone ? "text.secondary" : "text.primary",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                      flex: 1,
                      fontSize: "0.9rem",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {document?.name || "Untitled"}
                  </Typography>
                </Tooltip>
              )}

            {isTimeEditMode && (
              <Tooltip title="Delete post" arrow>
                <IconButton
                  size="small"
                  onClick={handleDelete}
                  sx={{
                    flexShrink: 0,
                    width: 22,
                    height: 22,
                    color: "text.disabled",
                    "&:hover": {
                      color: "text.secondary",
                      bgcolor: "action.hover",
                    },
                  }}
                >
                  <Trash2 size={ICON_SIZE.dense} />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          {/* Metadata — only shown in time-edit mode */}
          {isTimeEditMode && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                width: "100%",
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: "text.disabled",
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <span
                  style={{
                    color: hasRowChanges ? "inherit" : undefined,
                    fontWeight: hasRowChanges ? 600 : 400,
                  }}
                >
                  {formatFullDate(displayDate)}
                </span>
                {hasRowChanges && (
                  <Typography
                    component="span"
                    sx={{
                      fontSize: "0.7rem",
                      color: "warning.main",
                      fontWeight: 500,
                    }}
                  >
                    (was {formatFullDate(originalDate)})
                  </Typography>
                )}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Time stepper controls */}
        {isTimeEditMode && onTimeAdjust && onTimeReset && (
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
            onClick={handleStopPropagation}
          >
            <TimeStepperControls
              onAdjust={handleTimeAdjust}
              onReset={handleTimeReset}
              hasChanges={hasRowChanges}
            />
          </Box>
        )}

        {/* Action menu */}
        {!isTimeEditMode && (
          <Box
            onClick={handleStopPropagation}
            sx={{
              display: "flex",
              alignItems: "center",
              opacity: 0,
              transition: "opacity 0.2s ease",
              ".MuiListItem-root:hover &": { opacity: 1 },
            }}
          >
            <PostActionMenu post={post} user={user} />
          </Box>
        )}
      </ListItemButton>
    </ListItem>
  );
};

export default PostCompactListItem;
