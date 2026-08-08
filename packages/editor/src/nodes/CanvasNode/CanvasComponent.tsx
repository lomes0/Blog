"use client";
import { $getNodeByKey, NodeKey } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import DraggableNote, {
  MIN_NOTE_HEIGHT,
  MIN_NOTE_WIDTH,
} from "@/components/NotesCanvas/DraggableNote";
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
import { getActionButtonClassName, Tooltip } from "../../ui";
import * as css from "./styles.css";
import CanvasNoteEditor from "./CanvasNoteEditor";
import {
  $asCanvasNode,
  CANVAS_GROW_MARGIN,
  CanvasNote,
  clampCanvasHeight,
  createCanvasNote,
  NOTE_DEFAULT_HEIGHT,
  NOTE_DEFAULT_WIDTH,
  NOTE_GUTTER,
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
      // Place the new note at the centre of what the author is looking at, and
      // wholly inside it. The default note is a fixed 240x200, but a document
      // column is not: in a 300px pane, centring one left it hanging over the
      // right edge, which grew the board past the frame and so put the note the
      // author had just asked for behind a horizontal scrollbar. A note that
      // does not fit the frame is sized down to it instead.
      //
      // The fallback is the board's own origin, not the middle of a virtual
      // canvas — this board is only as wide as the document column.
      const el = scrollContainerRef.current;
      const frame = el
        ? { width: el.clientWidth / scale, height: el.clientHeight / scale }
        : { width: NOTE_DEFAULT_WIDTH, height: NOTE_DEFAULT_HEIGHT };
      const fitToFrame = (want: number, min: number, available: number) =>
        Math.round(Math.max(min, Math.min(want, available - 2 * NOTE_GUTTER)));
      const size = {
        width: fitToFrame(NOTE_DEFAULT_WIDTH, MIN_NOTE_WIDTH, frame.width),
        height: fitToFrame(NOTE_DEFAULT_HEIGHT, MIN_NOTE_HEIGHT, frame.height),
      };
      const jitter = () => (Math.random() - 0.5) * 80;
      /**
       * Centres `length` in the visible span, jitters it so a second note does
       * not land exactly on the first, then pulls it back inside the frame —
       * the jitter is a nicety and must not be what pushes a note out of view.
       * `max` can fall below `min` only when the column is narrower than the
       * smallest note, and then the frame's own edge is the best answer left.
       */
      const place = (origin: number, visible: number, length: number) => {
        const min = origin + NOTE_GUTTER;
        const max = Math.max(min, origin + visible - length - NOTE_GUTTER);
        const centred = origin + visible / 2 - length / 2;
        return Math.max(0, Math.min(max, Math.max(min, centred + jitter())));
      };
      addNote({
        position: {
          x: place(el ? el.scrollLeft / scale : 0, frame.width, size.width),
          y: place(el ? el.scrollTop / scale : 0, frame.height, size.height),
        },
        size,
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
   * the reader can see: the 1920x1080 virtual floor a full-screen board uses
   * left a fresh board scrolling sideways over ~1100px of empty grid, with
   * anything placed near the virtual centre sitting past the document's right
   * edge.
   *
   * It stretches only to cover notes that already lie beyond the frame — a clip
   * pasted from the full-screen board, or a board narrowed by the sidebar —
   * and then keeps the usual margin past them, since `bounds="parent"` clamps a
   * drag to the board and those notes would otherwise be stuck where they are.
   */
  const fit = (visible: number, far: number) =>
    far > visible ? Math.ceil(far + CANVAS_GROW_MARGIN) : visible;
  // The frame is measured in rendered pixels and the board is laid out in
  // unscaled ones, so the trip out through `scale` has to round *down*: at
  // 200%, `ceil` handed back a board up to two rendered pixels wider than the
  // frame it was meant to fill, which is a horizontal scrollbar over an empty
  // board. `minWidth`/`minHeight: 100%` on the sizing div cover the shortfall.
  const boardWidth = fit(Math.floor(containerSize.width / scale), extent.x);
  const boardHeight = fit(Math.floor(containerSize.height / scale), extent.y);

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
    <div className={css.board} style={{ height: liveHeight.height }}>
      {isEditable && (
        <div className={css.toolbar}>
          {/*
            `AddNoteButton`, `ZoomControls`, `SelectionBar`, `SelectionMarquee`
            and `DraggableNote` are app components (`src/components/
            NotesCanvas/`) and stay on MUI — see the header of `styles.css.ts`
            for why that seam is deliberate.
          */}
          <AddNoteButton onAdd={handleAdd} />
          <ZoomControls zoom={zoom} />
          <div className={css.toolbarSpacer} />
          <Tooltip content="Delete board">
            <button
              type="button"
              aria-label="Delete board"
              className={getActionButtonClassName({
                danger: true,
                icon: true,
                size: "md",
              })}
              onClick={removeBoard}
            >
              <Trash2 size={ICON_SIZE.dense} />
            </button>
          </Tooltip>
        </div>
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

      <div
        ref={scrollContainerRef}
        // Focusable so the clipboard shortcuts land on the board the author is
        // in — a document can hold several, alongside the host editor itself.
        tabIndex={isEditable ? 0 : undefined}
        onKeyDown={selection.handleKeyDown}
        className={css.viewport}
        style={{ backgroundSize: `${20 * scale}px ${20 * scale}px` }}
      >
        {/* Sizing div keeps the scrollbars honest about the scaled board */}
        <div
          className={css.sizer}
          style={{
            width: `${boardWidth * scale}px`,
            height: `${boardHeight * scale}px`,
          }}
        >
          <div
            onPointerDown={selection.handleBoardPointerDown}
            className={css.surface}
            style={{
              width: `${boardWidth}px`,
              height: `${boardHeight}px`,
              transform: `scale(${scale})`,
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
          </div>
        </div>
      </div>

      {isEditable && (
        <div
          className={css.resizeGrip}
          onPointerDown={liveHeight.startResize}
        />
      )}
    </div>
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
