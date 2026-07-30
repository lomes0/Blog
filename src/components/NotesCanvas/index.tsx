"use client";
import { Box, Typography } from "@mui/material";
import { useNotesStore } from "@/hooks/useNotesStore";
import { useCanvasZoomShortcuts } from "@/hooks/useCanvasZoomShortcuts";
import DraggableNote from "./DraggableNote";
import StandaloneNoteEditor from "./StandaloneNoteEditor";
import { toClip, useNotesClipboard } from "@/hooks/useNotesClipboard";
import NotesCanvasPreview from "./NotesCanvasPreview";
import NotesMigrationBanner from "./NotesMigrationBanner";
import SelectionBar from "./SelectionBar";
import SelectionMarquee from "./SelectionMarquee";
import { useNotesSelection } from "./hooks/useNotesSelection";
import {
  CANVAS_GROW_MARGIN,
  VIRTUAL_CANVAS_HEIGHT,
  VIRTUAL_CANVAS_WIDTH,
} from "./canvasGeometry";
import { NOTES_ZOOM_DEFAULT } from "@/hooks/useNotesZoom";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Note } from "@/types/notes";

export interface NotesCanvasHandle {
  addNote: (color: string) => void;
}

/** Stable identity while the canvas loads, so the memos below don't churn. */
const EMPTY_NOTES: Note[] = [];

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
      deleteNotes,
      bringToFront,
      refresh,
    } = useNotesStore(canvasId);
    const { copyNotes } = useNotesClipboard();

    const scale = scaleProp ?? NOTES_ZOOM_DEFAULT;
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const notes = useMemo(() => canvas?.notes ?? EMPTY_NOTES, [canvas]);

    // Track the scroll container's pixel size so the note area (and the
    // bounds="parent" region) can grow to fill the visible grid. Without this,
    // notes are clamped to the fixed virtual canvas while the grid extends to
    // fill the viewport, making part of the visible grid unusable.
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
      const el = scrollContainerRef.current;
      if (!el) return;
      const update = () =>
        setContainerSize({ width: el.clientWidth, height: el.clientHeight });
      update();
      const observer = new ResizeObserver(update);
      observer.observe(el);
      return () => observer.disconnect();
    }, [preview]);

    // Virtual canvas dimensions (in unscaled units). The board grows so that:
    //  - it always covers at least the default virtual canvas,
    //  - it always covers at least the visible viewport, and
    //  - it always extends a margin beyond the furthest note.
    // The last point is what makes the canvas feel unbounded: the grid
    // background is fixed to the viewport (so it looks infinite), but the
    // draggable bounds are the board's actual size. Without growing the board
    // to follow the notes, drags get clamped at the fixed virtual edge even
    // though the grid still appears beyond it.
    const noteExtentX = notes.reduce(
      (max, n) => Math.max(max, n.position.x + n.size.width),
      0,
    );
    const noteExtentY = notes.reduce(
      (max, n) => Math.max(max, n.position.y + n.size.height),
      0,
    );

    const canvasWidth = Math.max(
      VIRTUAL_CANVAS_WIDTH,
      Math.ceil(containerSize.width / scale),
      Math.ceil(noteExtentX + CANVAS_GROW_MARGIN),
    );
    const canvasHeight = Math.max(
      VIRTUAL_CANVAS_HEIGHT,
      Math.ceil(containerSize.height / scale),
      Math.ceil(noteExtentY + CANVAS_GROW_MARGIN),
    );

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
          zIndex: Math.max(...notes.map((n) => n.zIndex), 0) + 1,
        });
      },
      [addNote, notes, scale],
    );

    useImperativeHandle(ref, () => ({ addNote: handleAddNote }), [
      handleAddNote,
    ]);

    // A `/notes` note stores its content as the serialized string already.
    const getContent = useCallback(
      (id: string) => notes.find((n) => n.id === id)?.content ?? "",
      [notes],
    );

    // Each pasted note is its own row, so the board posts them independently —
    // one failure rolls back one note rather than the whole paste.
    const addPastedNotes = useCallback(
      (pasted: Parameters<typeof addNote>[0][]) => pasted.forEach(addNote),
      [addNote],
    );

    const selection = useNotesSelection({
      notes,
      containerRef: scrollContainerRef,
      scale,
      canvasId,
      enabled: !preview,
      getContent,
      onAddNotes: addPastedNotes,
      onDeleteNotes: deleteNotes,
    });

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
            bgcolor: "background.default",
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
          <SelectionBar
            selectedCount={selection.selectedIds.size}
            clipCount={selection.clip?.notes.length ?? 0}
            onCopy={selection.copySelection}
            onCut={selection.cutSelection}
            onDelete={selection.deleteSelection}
            onClearSelection={selection.clearSelection}
            onPaste={selection.paste}
            onClearClip={selection.clearClip}
          />

          <Box
            ref={scrollContainerRef}
            // Focusable so the clipboard shortcuts land on the board the author
            // is in, rather than on a document-wide listener that every board
            // on the page would answer.
            tabIndex={0}
            onKeyDown={selection.handleKeyDown}
            sx={(theme) => ({
              flex: 1,
              minHeight: 0,
              overflow: "auto",
              position: "relative",
              outline: "none",
              "&:focus-visible": {
                outline: "2px solid",
                outlineColor: "primary.main",
                outlineOffset: "-2px",
              },
              backgroundImage:
                `linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px),
                 linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px)`,
              ...theme.applyStyles("dark", {
                backgroundImage:
                  `linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
                 linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)`,
              }),
              backgroundSize: `${20 * scale}px ${20 * scale}px`,
              backgroundPosition: "0 0",
            })}
          >
            {/* Sizing div ensures scrollbars reflect scaled canvas size */}
            <Box
              sx={{
                width: `${canvasWidth * scale}px`,
                height: `${canvasHeight * scale}px`,
                minWidth: "100%",
                minHeight: "100%",
                position: "relative",
              }}
            >
              <Box
                onPointerDown={selection.handleBoardPointerDown}
                sx={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: `${canvasWidth}px`,
                  height: `${canvasHeight}px`,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                }}
              >
                {notes.map((note) => (
                  <DraggableNote
                    key={note.id}
                    note={note}
                    onUpdate={updateNote}
                    onDelete={deleteNote}
                    onFocus={bringToFront}
                    scale={scale}
                    selected={selection.selectedIds.has(note.id)}
                    onSelect={(event) =>
                      selection.handleNoteMouseDown(note.id, event)}
                    onCopy={() =>
                      copyNotes(
                        toClip([{ note, content: note.content }], canvasId),
                      )}
                    onCut={() => {
                      copyNotes(
                        toClip([{ note, content: note.content }], canvasId),
                      );
                      deleteNote(note.id);
                    }}
                  >
                    <StandaloneNoteEditor
                      content={note.content}
                      onChange={(content) => updateNote(note.id, { content })}
                    />
                  </DraggableNote>
                ))}
                {selection.marquee && (
                  <SelectionMarquee rect={selection.marquee} />
                )}
              </Box>
            </Box>
          </Box>
        </Box>
      </>
    );
  },
);

export default NotesCanvas;
