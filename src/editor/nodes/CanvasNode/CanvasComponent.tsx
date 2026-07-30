"use client";
import { $getNodeByKey, NodeKey } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { Box, IconButton, Tooltip } from "@mui/material";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import DraggableNote from "@/components/NotesCanvas/DraggableNote";
import AddNoteButton from "@/components/NotesCanvas/AddNoteButton";
import SelectionBar from "@/components/NotesCanvas/SelectionBar";
import SelectionMarquee from "@/components/NotesCanvas/SelectionMarquee";
import ZoomControls from "@/components/NotesCanvas/ZoomControls";
import {
  PastedNote,
  useNotesSelection,
} from "@/components/NotesCanvas/hooks/useNotesSelection";
import { toClip, useNotesClipboard } from "@/hooks/useNotesClipboard";
import { NoteColorKey } from "@/components/NotesCanvas/noteColors";
import { useNotesZoom } from "@/hooks/useNotesZoom";
import { useCanvasZoomShortcuts } from "@/hooks/useCanvasZoomShortcuts";
import { NoteFrame } from "@/types/notes";
import { ICON_SIZE } from "@/theme/icons";
import CanvasNoteEditor from "./CanvasNoteEditor";
import {
  $asCanvasNode,
  CANVAS_GROW_MARGIN,
  CanvasNote,
  clampCanvasHeight,
  createCanvasNote,
  NOTE_DEFAULT_HEIGHT,
  NOTE_DEFAULT_WIDTH,
  serializeNoteContent,
} from "./utils";

interface CanvasComponentProps {
  nodeKey: NodeKey;
  canvasId: string;
  notes: CanvasNote[];
  height: number;
}

export default function CanvasComponent(
  { nodeKey, canvasId, notes, height }: CanvasComponentProps,
) {
  const [editor] = useLexicalComposerContext();
  const isEditable = useLexicalEditable();
  const { copyNotes } = useNotesClipboard();
  const zoom = useNotesZoom(canvasId);
  const { scale } = zoom;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useCanvasZoomShortcuts({
    enabled: isEditable,
    scrollContainerRef,
    onZoomIn: zoom.zoomIn,
    onZoomOut: zoom.zoomOut,
    onResetZoom: zoom.resetZoom,
  });

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const update = () =>
      setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /**
   * Every note mutation runs through here: it writes the new array onto the
   * node inside `editor.update()`, which dirties the host document and so
   * feeds the existing save and undo without any storage of its own.
   */
  const mutateNotes = useCallback(
    (fn: (notes: CanvasNote[]) => CanvasNote[]) => {
      editor.update(() => {
        const node = $asCanvasNode($getNodeByKey(nodeKey));
        if (node) node.setNotes(fn(node.getNotes()));
      });
    },
    [editor, nodeKey],
  );

  const topZIndex = useCallback(
    (list: CanvasNote[]) => Math.max(...list.map((n) => n.zIndex), 0) + 1,
    [],
  );

  const addNote = useCallback(
    (init: Omit<NoteFrame, "id" | "zIndex"> & { content?: string }) => {
      mutateNotes((current) => {
        const note = createCanvasNote({ ...init, zIndex: topZIndex(current) });
        // NestedEditor reads _parentEditor on its first render to mark the
        // document dirty, so wire it before the note mounts.
        note.editor._parentEditor = editor;
        return [...current, note];
      });
    },
    [editor, mutateNotes, topZIndex],
  );

  /**
   * Paste, as one node write: the whole clip lands in a single `mutateNotes`,
   * so it is one undo step rather than one per note.
   */
  const addNotes = useCallback(
    (pasted: PastedNote[]) => {
      if (pasted.length === 0) return;
      mutateNotes((current) => [
        ...current,
        ...pasted.map((init) => {
          const note = createCanvasNote(init);
          note.editor._parentEditor = editor;
          return note;
        }),
      ]);
    },
    [editor, mutateNotes],
  );

  const handleAdd = useCallback(
    (color: NoteColorKey) => {
      // Place the new note at the centre of what the author is looking at.
      // The fallback is the board's own origin, not the middle of a virtual
      // canvas — this board is only as wide as the document column.
      const el = scrollContainerRef.current;
      let x = 0;
      let y = 0;
      if (el) {
        x = (el.scrollLeft + el.clientWidth / 2) / scale -
          NOTE_DEFAULT_WIDTH / 2;
        y = (el.scrollTop + el.clientHeight / 2) / scale -
          NOTE_DEFAULT_HEIGHT / 2;
      }
      const jitter = () => (Math.random() - 0.5) * 80;
      addNote({
        position: {
          x: Math.max(0, x + jitter()),
          y: Math.max(0, y + jitter()),
        },
        size: { width: NOTE_DEFAULT_WIDTH, height: NOTE_DEFAULT_HEIGHT },
        color,
      });
    },
    [addNote, scale],
  );

  const updateNote = useCallback(
    (id: string, updates: Partial<NoteFrame>) => {
      mutateNotes((current) =>
        current.map((note) => note.id === id ? { ...note, ...updates } : note)
      );
    },
    [mutateNotes],
  );

  const deleteNote = useCallback(
    (id: string) => {
      mutateNotes((current) => current.filter((note) => note.id !== id));
    },
    [mutateNotes],
  );

  /** Deletes a selection in one node write, so it is one undo step. */
  const deleteNotes = useCallback(
    (ids: string[]) => {
      const doomed = new Set(ids);
      mutateNotes((current) => current.filter((note) => !doomed.has(note.id)));
    },
    [mutateNotes],
  );

  const bringToFront = useCallback(
    (id: string) => {
      mutateNotes((current) => {
        const top = topZIndex(current);
        return current.map((note) =>
          note.id === id ? { ...note, zIndex: top } : note
        );
      });
    },
    [mutateNotes, topZIndex],
  );

  const removeBoard = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      node?.remove();
    });
  }, [editor, nodeKey]);

  const extent = notes.reduce(
    (max, n) => ({
      x: Math.max(max.x, n.position.x + n.size.width),
      y: Math.max(max.y, n.position.y + n.size.height),
    }),
    { x: 0, y: 0 },
  );

  /**
   * The board is a frame in a document column, so it is exactly as big as what
   * the reader can see: `/notes`' 1920x1080 virtual floor left a fresh board
   * scrolling sideways over ~1100px of empty grid, with anything placed near
   * the virtual centre sitting past the document's right edge.
   *
   * It stretches only to cover notes that already lie beyond the frame — a clip
   * pasted from the full-screen board, or a board narrowed by the sidebar —
   * and then keeps the usual margin past them, since `bounds="parent"` clamps a
   * drag to the board and those notes would otherwise be stuck where they are.
   */
  const fit = (visible: number, far: number) =>
    far > visible ? Math.ceil(far + CANVAS_GROW_MARGIN) : visible;
  const boardWidth = fit(Math.ceil(containerSize.width / scale), extent.x);
  const boardHeight = fit(Math.ceil(containerSize.height / scale), extent.y);

  const liveHeight = useCanvasResize(nodeKey, height, editor);

  // A `CanvasNode` note keeps its content in a live child editor, so the clip
  // takes a snapshot of that editor's state.
  const getContent = useCallback(
    (id: string) => {
      const note = notes.find((n) => n.id === id);
      return note ? serializeNoteContent(note) : "";
    },
    [notes],
  );

  const selection = useNotesSelection({
    notes,
    containerRef: scrollContainerRef,
    scale,
    canvasId,
    enabled: isEditable,
    getContent,
    onAddNotes: addNotes,
    onDeleteNotes: deleteNotes,
  });

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: liveHeight.height,
        my: 2,
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {isEditable && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1.5,
            py: 0.75,
            borderBottom: "1px solid",
            borderColor: "divider",
            flexShrink: 0,
          }}
        >
          <AddNoteButton onAdd={handleAdd} />
          <ZoomControls zoom={zoom} />
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Delete board">
            <IconButton size="small" onClick={removeBoard} color="error">
              <Trash2 size={ICON_SIZE.dense} />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {isEditable && (
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
      )}

      <Box
        ref={scrollContainerRef}
        // Focusable so the clipboard shortcuts land on the board the author is
        // in — a document can hold several, alongside the host editor itself.
        tabIndex={isEditable ? 0 : undefined}
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
        })}
      >
        {/* Sizing div keeps the scrollbars honest about the scaled board */}
        <Box
          sx={{
            width: `${boardWidth * scale}px`,
            height: `${boardHeight * scale}px`,
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
              width: `${boardWidth}px`,
              height: `${boardHeight}px`,
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
                readOnly={!isEditable}
                selected={selection.selectedIds.has(note.id)}
                onSelect={(event) =>
                  selection.handleNoteMouseDown(note.id, event)}
                onCopy={() =>
                  copyNotes(
                    toClip(
                      [{ note, content: serializeNoteContent(note) }],
                      canvasId,
                    ),
                  )}
                onCut={() => {
                  copyNotes(
                    toClip(
                      [{ note, content: serializeNoteContent(note) }],
                      canvasId,
                    ),
                  );
                  deleteNote(note.id);
                }}
              >
                <CanvasNoteEditor noteEditor={note.editor} />
              </DraggableNote>
            ))}
            {selection.marquee && <SelectionMarquee rect={selection.marquee} />}
          </Box>
        </Box>
      </Box>

      {isEditable && (
        <Box
          onPointerDown={liveHeight.startResize}
          sx={{
            height: 10,
            flexShrink: 0,
            cursor: "ns-resize",
            borderTop: "1px solid",
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            "&::after": {
              content: '""',
              width: 32,
              height: 3,
              borderRadius: 2,
              bgcolor: "divider",
            },
            "&:hover::after": { bgcolor: "text.secondary" },
          }}
        />
      )}
    </Box>
  );
}

/**
 * Drives the board's height from a drag on its bottom grip, tracking the drag
 * in local state and committing the final value to the node on release — so a
 * resize is one undo step rather than one per pointer move.
 */
function useCanvasResize(
  nodeKey: NodeKey,
  height: number,
  editor: ReturnType<typeof useLexicalComposerContext>[0],
) {
  const [live, setLive] = useState(height);
  const latest = useRef(height);

  useEffect(() => {
    setLive(height);
    latest.current = height;
  }, [height]);

  const startResize = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault();
      const target = e.currentTarget;
      const startY = e.clientY;
      const startHeight = latest.current;
      target.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const next = clampCanvasHeight(startHeight + (ev.clientY - startY));
        latest.current = next;
        setLive(next);
      };
      const onUp = (ev: PointerEvent) => {
        target.releasePointerCapture(ev.pointerId);
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
        const committed = latest.current;
        editor.update(() => {
          const node = $asCanvasNode($getNodeByKey(nodeKey));
          if (node) node.setCanvasHeight(committed);
        });
      };

      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
    },
    [editor, nodeKey],
  );

  return { height: live, startResize };
}
