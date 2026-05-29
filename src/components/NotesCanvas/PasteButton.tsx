"use client";
import { Box, Button } from "@mui/material";
import { ClipboardPaste } from "lucide-react";
import { useNotesClipboard } from "@/contexts/NotesClipboardContext";
import type { Note, NotesCanvas as CanvasData } from "@/types/notes";

const VIRTUAL_CANVAS_WIDTH = 1920;
const VIRTUAL_CANVAS_HEIGHT = 1080;

interface PasteButtonProps {
  addNote: (
    note: Omit<Note, "id" | "createdAt" | "updatedAt" | "canvasId">,
  ) => void;
  canvas: CanvasData | null;
}

export default function PasteButton({ addNote, canvas }: PasteButtonProps) {
  const { clip, clearClip } = useNotesClipboard();

  const handlePaste = () => {
    if (!clip) return;
    const offsetX = (Math.random() - 0.5) * 80;
    const offsetY = (Math.random() - 0.5) * 80;
    addNote({
      position: {
        x: VIRTUAL_CANVAS_WIDTH / 2 - clip.size.width / 2 + offsetX,
        y: VIRTUAL_CANVAS_HEIGHT / 2 - clip.size.height / 2 + offsetY,
      },
      size: clip.size,
      content: clip.content,
      color: clip.color,
      title: clip.title,
      zIndex: canvas
        ? Math.max(...canvas.notes.map((n) => n.zIndex), 0) + 1
        : 1,
    });
    clearClip();
  };

  if (!clip) return null;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        px: 1.5,
        py: 0.75,
        bgcolor: "action.hover",
        borderBottom: "1px solid",
        borderColor: "divider",
        flexShrink: 0,
        gap: 1,
      }}
    >
      <Button
        variant="contained"
        size="small"
        disableElevation
        onClick={handlePaste}
        startIcon={<ClipboardPaste size={14} />}
        sx={{ fontSize: "0.75rem", py: 0.5, px: 1.5, textTransform: "none" }}
      >
        Paste
      </Button>
      <Button
        size="small"
        onClick={clearClip}
        sx={{
          fontSize: "0.75rem",
          py: 0.5,
          px: 1,
          textTransform: "none",
          minWidth: "auto",
        }}
      >
        Clear
      </Button>
    </Box>
  );
}
