"use client";
import { Box, Button, Divider, Typography } from "@mui/material";
import { ClipboardPaste, Copy, Scissors, Trash2, X } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";

/**
 * The board's selection/clipboard strip. Shows what is selected and what is on
 * the clipboard, and offers the same actions as the keyboard shortcuts — a
 * gesture-only feature is undiscoverable, and the ⋯ menu on a note can only
 * ever speak for that one note.
 *
 * Hidden entirely when there is nothing to say, so a board in its resting state
 * looks exactly as it did before.
 */

interface SelectionBarProps {
  selectedCount: number;
  /** Notes on the clipboard, from this board or any other. */
  clipCount: number;
  onCopy: () => void;
  onCut: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
  onPaste: () => void;
  onClearClip: () => void;
}

const barButtonSx = {
  typography: "caption",
  py: 0.5,
  px: 1,
  textTransform: "none",
  minWidth: "auto",
} as const;

export default function SelectionBar({
  selectedCount,
  clipCount,
  onCopy,
  onCut,
  onDelete,
  onClearSelection,
  onPaste,
  onClearClip,
}: SelectionBarProps) {
  const hasSelection = selectedCount > 0;
  if (!hasSelection && clipCount === 0) return null;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        px: 1.5,
        py: 0.75,
        bgcolor: "action.hover",
        borderBottom: "1px solid",
        borderColor: "divider",
        flexShrink: 0,
      }}
    >
      {hasSelection && (
        <>
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", mr: 0.5 }}
          >
            {selectedCount} selected
          </Typography>
          <Button
            size="small"
            onClick={onCopy}
            startIcon={<Copy size={ICON_SIZE.inline} />}
            sx={barButtonSx}
          >
            Copy
          </Button>
          <Button
            size="small"
            onClick={onCut}
            startIcon={<Scissors size={ICON_SIZE.inline} />}
            sx={barButtonSx}
          >
            Cut
          </Button>
          <Button
            size="small"
            color="error"
            onClick={onDelete}
            startIcon={<Trash2 size={ICON_SIZE.inline} />}
            sx={barButtonSx}
          >
            Delete
          </Button>
          <Button
            size="small"
            color="inherit"
            onClick={onClearSelection}
            startIcon={<X size={ICON_SIZE.inline} />}
            sx={{ ...barButtonSx, color: "text.secondary" }}
          >
            Deselect
          </Button>
        </>
      )}

      <Box sx={{ flex: 1 }} />

      {clipCount > 0 && (
        <>
          {hasSelection && (
            <Divider
              orientation="vertical"
              flexItem
              sx={{ my: 0.5, mr: 0.5 }}
            />
          )}
          <Button
            variant="contained"
            size="small"
            disableElevation
            onClick={onPaste}
            startIcon={<ClipboardPaste size={ICON_SIZE.inline} />}
            sx={{ ...barButtonSx, px: 1.5 }}
          >
            {clipCount === 1 ? "Paste" : `Paste ${clipCount}`}
          </Button>
          <Button
            size="small"
            color="inherit"
            onClick={onClearClip}
            sx={{ ...barButtonSx, color: "text.secondary" }}
          >
            Clear
          </Button>
        </>
      )}
    </Box>
  );
}
