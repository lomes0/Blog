"use client";
import NotesCanvas, { NotesCanvasHandle } from "@/components/NotesCanvas";
import BoardSelector from "@/components/NotesCanvas/BoardSelector";
import ZoomControls from "@/components/NotesCanvas/ZoomControls";
import AddNoteButton from "@/components/NotesCanvas/AddNoteButton";
import { useNotesBoards } from "@/hooks/useNotesBoards";
import { useNotesZoom } from "@/hooks/useNotesZoom";
import { Box, Divider } from "@mui/material";
import { StickyNote } from "lucide-react";
import { useRef } from "react";
import { NotesClipboardProvider } from "@/contexts/NotesClipboardContext";
import { ICON_SIZE } from "@/theme/icons";

export default function NotesPage() {
  const {
    boards,
    activeCanvasId,
    setActiveCanvasId,
    createBoard,
    renameBoard,
    deleteBoard,
  } = useNotesBoards();

  const zoom = useNotesZoom(activeCanvasId);
  const canvasRef = useRef<NotesCanvasHandle>(null);

  return (
    <NotesClipboardProvider>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: 0,
        }}
      >
        {/* Board selector header — visually distinct from canvas */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: 2,
            py: 1,
            bgcolor: "background.paper",
            flexShrink: 0,
          }}
        >
          <StickyNote
            size={ICON_SIZE.dense}
            style={{ color: "var(--mui-palette-text-secondary)" }}
          />
          <BoardSelector
            boards={boards}
            activeCanvasId={activeCanvasId}
            onSelectBoard={setActiveCanvasId}
            onCreateBoard={createBoard}
            onRenameBoard={renameBoard}
            onDeleteBoard={deleteBoard}
          />

          <Divider orientation="vertical" flexItem sx={{ my: 0.5 }} />

          <AddNoteButton
            onAdd={(color) => canvasRef.current?.addNote(color)}
          />

          <ZoomControls zoom={zoom} />
        </Box>

        {/* Canvas area */}
        <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <NotesCanvas
            ref={canvasRef}
            canvasId={activeCanvasId}
            scale={zoom.scale}
            onZoomIn={zoom.zoomIn}
            onZoomOut={zoom.zoomOut}
            onResetZoom={zoom.resetZoom}
          />
        </Box>
      </Box>
    </NotesClipboardProvider>
  );
}
