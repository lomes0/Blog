"use client";
import { Box, Button } from "@mui/material";
import { ClipboardPaste } from "lucide-react";
import { useNotesClipboard } from "@/contexts/NotesClipboardContext";
import type { NoteFrame } from "@/types/notes";
import { ICON_SIZE } from "@/theme/icons";

const VIRTUAL_CANVAS_WIDTH = 1920;
const VIRTUAL_CANVAS_HEIGHT = 1080;

export interface PastedNote extends Omit<NoteFrame, "id"> {
  /** Serialized Lexical editor state. */
  content: string;
}

interface PasteButtonProps {
  addNote: (note: PastedNote) => void;
  /** Existing notes, read only to place the pasted one on top. */
  notes: NoteFrame[];
}

export default function PasteButton({ addNote, notes }: PasteButtonProps) {
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
      zIndex: Math.max(...notes.map((n) => n.zIndex), 0) + 1,
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
        startIcon={<ClipboardPaste size={ICON_SIZE.inline} />}
        sx={{ typography: "caption", py: 0.5, px: 1.5, textTransform: "none" }}
      >
        Paste
      </Button>
      <Button
        size="small"
        onClick={clearClip}
        sx={{
          typography: "caption",
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
