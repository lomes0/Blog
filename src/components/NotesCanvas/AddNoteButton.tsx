"use client";
import { Box, Popover, Tooltip } from "@mui/material";
import { SquarePen } from "lucide-react";
import { useState } from "react";
import {
  NOTE_COLOR_LIST,
  NOTE_COLORS,
  NOTE_SWATCH_COLORS,
  NoteColorKey,
} from "./noteColors";
import { ICON_SIZE } from "@/theme/icons";

interface AddNoteButtonProps {
  onAdd: (color: NoteColorKey) => void;
  /** Hides the "Add note" label, leaving the icon. For tight toolbars. */
  compact?: boolean;
}

/**
 * Toolbar pill that adds a note in a chosen color. Shared by the standalone
 * `/notes` board and the `CanvasNode` board embedded in a document, so both
 * boards offer the same control in the same place.
 */
export default function AddNoteButton({
  onAdd,
  compact = false,
}: AddNoteButtonProps) {
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);

  return (
    <>
      <Tooltip title="Add note">
        <Box
          component="button"
          aria-label="Add note"
          onClick={(e: React.MouseEvent<HTMLElement>) =>
            setColorAnchor(e.currentTarget)}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            px: compact ? 0.75 : 1.25,
            height: 28,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "14px",
            bgcolor: "action.hover",
            cursor: "pointer",
            flexShrink: 0,
            typography: "dense",
            fontWeight: 500,
            color: "text.secondary",
            "&:hover": {
              bgcolor: "action.selected",
              color: "text.primary",
            },
            transition: "all 0.15s ease",
          }}
        >
          <SquarePen size={ICON_SIZE.inline} />
          {!compact && "Add note"}
        </Box>
      </Tooltip>

      <Popover
        open={!!colorAnchor}
        anchorEl={colorAnchor}
        onClose={() => setColorAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { elevation: 2, sx: { mt: 0.5 } } }}
      >
        <Box sx={{ display: "flex", gap: 0.75, p: 1 }}>
          {NOTE_COLOR_LIST.map((color) => (
            <Tooltip key={color.value} title={color.name}>
              <Box
                component="button"
                aria-label={color.name}
                onClick={() => {
                  onAdd(color.value);
                  setColorAnchor(null);
                }}
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: NOTE_COLORS[color.value],
                  border: "2px solid",
                  borderColor: "transparent",
                  cursor: "pointer",
                  p: 0,
                  outline: "none",
                  transition: "all 0.15s ease",
                  "&:hover": {
                    borderColor: NOTE_SWATCH_COLORS[color.value],
                    transform: "scale(1.2)",
                    boxShadow: `0 2px 8px ${NOTE_SWATCH_COLORS[color.value]}88`,
                  },
                }}
              />
            </Tooltip>
          ))}
        </Box>
      </Popover>
    </>
  );
}
