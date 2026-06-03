"use client";
import { Box, Typography } from "@mui/material";
import { useNotesStore } from "@/hooks/useNotesStore";
import { useCanvasZoomShortcuts } from "@/hooks/useCanvasZoomShortcuts";
import DraggableNote from "./DraggableNote";
import NotesCanvasPreview from "./NotesCanvasPreview";
import NotesMigrationBanner from "./NotesMigrationBanner";
import PasteButton from "./PasteButton";
import { NOTES_ZOOM_DEFAULT } from "@/hooks/useNotesZoom";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

export interface NotesCanvasHandle {
  addNote: (color: string) => void;
}

// Virtual canvas dimensions for consistent coordinate system
const VIRTUAL_CANVAS_WIDTH = 1920;
const VIRTUAL_CANVAS_HEIGHT = 1080;

interface NotesCanvasProps {
  preview?: boolean;
  onViewFull?: () => void;
  canvasId?: string | null;
  // Controlled zoom — managed by the parent so zoom controls can live next to the board selector
  scale?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
}

const NotesCanvas = forwardRef<NotesCanvasHandle, NotesCanvasProps>(
  function NotesCanvas(
    {
      preview = false,
      onViewFull,
      canvasId = null,
      scale: scaleProp,
      onZoomIn,
      onZoomOut,
      onResetZoom,
    },
    ref,
  ) {
    const {
      canvas,
      loading,
      addNote,
      updateNote,
      deleteNote,
      bringToFront,
      refresh,
    } = useNotesStore(canvasId);

    const scale = scaleProp ?? NOTES_ZOOM_DEFAULT;
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useCanvasZoomShortcuts({
      enabled: !preview,
      scrollContainerRef,
      onZoomIn,
      onZoomOut,
      onResetZoom,
    });

    const handleAddNote = useCallback(
      (color: string) => {
        // Place new note at center of current visible viewport
        let centerX = VIRTUAL_CANVAS_WIDTH / 2 - 150 + Math.random() * 100;
        let centerY = VIRTUAL_CANVAS_HEIGHT / 2 - 100 + Math.random() * 100;

        if (scrollContainerRef.current) {
          const el = scrollContainerRef.current;
          const visibleCenterX = (el.scrollLeft + el.clientWidth / 2) / scale;
          const visibleCenterY = (el.scrollTop + el.clientHeight / 2) / scale;
          centerX = visibleCenterX - 120 + (Math.random() - 0.5) * 100;
          centerY = visibleCenterY - 100 + (Math.random() - 0.5) * 100;
        }

        addNote({
          position: { x: centerX, y: centerY },
          size: { width: 240, height: 200 },
          content: "",
          color,
          zIndex: canvas
            ? Math.max(...canvas.notes.map((n) => n.zIndex), 0) + 1
            : 1,
        });
      },
      [addNote, canvas, scale],
    );

    useImperativeHandle(ref, () => ({ addNote: handleAddNote }), [
      handleAddNote,
    ]);

    // Refresh notes when in preview mode
    useEffect(() => {
      if (preview) {
        refresh();

        // Also refresh when window gains focus (user returns to tab)
        const handleFocus = () => refresh();
        window.addEventListener("focus", handleFocus);
        return () => window.removeEventListener("focus", handleFocus);
      }
    }, [preview, refresh]);

    if (loading && preview) {
      return (
        <Box
          sx={{
            height: 320,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "text.secondary",
          }}
        >
          <Typography variant="body2">Loading notes...</Typography>
        </Box>
      );
    }

    if (loading) {
      return (
        <Box
          sx={{
            width: "100vw",
            height: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "#fafafa",
          }}
        >
          <Typography color="text.secondary">Loading notes...</Typography>
        </Box>
      );
    }

    if (preview) {
      return <NotesCanvasPreview canvas={canvas} onClick={onViewFull} />;
    }

    // Full canvas mode
    return (
      <>
        <NotesMigrationBanner />
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            minHeight: 0,
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <PasteButton addNote={addNote} canvas={canvas} />

          <Box
            ref={scrollContainerRef}
            sx={{
              flex: 1,
              minHeight: 0,
              overflow: "auto",
              position: "relative",
              backgroundImage: (theme) =>
                theme.palette.mode === "dark"
                  ? `linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
                 linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)`
                  : `linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px),
                 linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px)`,
              backgroundSize: `${20 * scale}px ${20 * scale}px`,
              backgroundPosition: "0 0",
            }}
          >
            {/* Sizing div ensures scrollbars reflect scaled canvas size */}
            <Box
              sx={{
                width: `${VIRTUAL_CANVAS_WIDTH * scale}px`,
                height: `${VIRTUAL_CANVAS_HEIGHT * scale}px`,
                minWidth: "100%",
                minHeight: "100%",
                position: "relative",
              }}
            >
              <Box
                sx={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: `${VIRTUAL_CANVAS_WIDTH}px`,
                  height: `${VIRTUAL_CANVAS_HEIGHT}px`,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                }}
              >
                {canvas?.notes.map((note) => (
                  <DraggableNote
                    key={note.id}
                    note={note}
                    onUpdate={updateNote}
                    onDelete={deleteNote}
                    onFocus={bringToFront}
                    scale={scale}
                  />
                ))}
              </Box>
            </Box>
          </Box>
        </Box>
      </>
    );
  },
);

export default NotesCanvas;
