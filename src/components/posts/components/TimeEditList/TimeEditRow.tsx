import React, { useCallback, useMemo } from "react";
import {
  Box,
  IconButton,
  InputBase,
  ListItem,
  Tooltip,
  Typography,
} from "@mui/material";
import { Trash2 } from "lucide-react";
import { DocumentStatus, Post } from "@/types";
import { PendingTimeChange } from "@/types/posts";
import { TimeStepperControls } from "./TimeStepperControls";
import { formatFullDate } from "@/utils/dateFormat";
import type { InlineRenameResult } from "@/hooks/useInlineRename";
import { ICON_SIZE } from "@/theme/icons";

interface TimeEditRowProps {
  post: Post;
  pendingChange?: PendingTimeChange;
  /** Shared rename machine — one row across the whole list is open at a time. */
  rename: InlineRenameResult<undefined>;
  onTimeAdjust?: (postId: string, originalDate: Date, days: number) => void;
  onTimeReset?: (postId: string) => void;
  onDelete: (post: Post) => void;
}

/**
 * One post in the series time-editing list: an always-open title field, the
 * post's date (with any pending value called out), a delete button and the
 * day/week/month stepper. The row is not a link — navigation is off while the
 * user is editing dates, so it renders as plain content rather than a button.
 */
const TimeEditRow: React.FC<TimeEditRowProps> = ({
  post,
  pendingChange,
  rename,
  onTimeAdjust,
  onTimeReset,
  onDelete,
}) => {
  const isDone = post.status === DocumentStatus.DONE;
  const originalDate = useMemo(
    () => new Date(post.createdAt || new Date()),
    [post.createdAt],
  );
  const displayDate = pendingChange ? pendingChange.newDate : originalDate;
  const hasRowChanges = !!pendingChange;
  const isEditing = rename.renamingId === post.id;
  // Stable identities (see useInlineRename), so they can be dependencies.
  const { start: startRename, setValue } = rename;

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

  // Every row renders its field, seeded from the stored name. Focusing one is
  // what opens the rename, so the machine only tracks the row actually being
  // edited.
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
      disablePadding
      sx={{
        bgcolor: hasRowChanges ? "warning.50" : "transparent",
        "&:hover": { bgcolor: hasRowChanges ? "warning.100" : "action.hover" },
        transition: "background-color 0.2s ease",
      }}
    >
      <Box
        sx={{
          width: "100%",
          py: 1.25,
          px: 2,
          display: "flex",
          alignItems: "center",
          gap: 2,
        }}
      >
        {/* Title and metadata */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              minWidth: 0,
            }}
          >
            <InputBase
              // One shared ref across the list, so only the row actually being
              // renamed may claim it — otherwise the last row rendered would
              // steal the hook's focus effect.
              inputRef={isEditing ? rename.inputRef : undefined}
              value={isEditing ? rename.value : (post.name || "")}
              onChange={handleNameChange}
              onFocus={handleNameFocus}
              onBlur={rename.handleBlur}
              onKeyDown={rename.handleKeyDown}
              onClick={handleStopPropagation}
              fullWidth
              inputProps={{ "aria-label": "Post title" }}
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
          </Box>

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
        </Box>

        {/* Time stepper controls */}
        {onTimeAdjust && onTimeReset && (
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
      </Box>
    </ListItem>
  );
};

export default TimeEditRow;
