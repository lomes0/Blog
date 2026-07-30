"use client";
import { RefObject, useCallback, useMemo, useRef, useState } from "react";
import { NoteFrame } from "@/types/notes";
import {
  clipExtent,
  toClip,
  useNotesClipboard,
} from "@/hooks/useNotesClipboard";
import { VIRTUAL_CANVAS_HEIGHT, VIRTUAL_CANVAS_WIDTH } from "../canvasGeometry";

/**
 * Selection and clipboard behaviour for a notes board, in one place.
 *
 * Both boards mount this: the standalone `/notes` canvas and the `CanvasNode`
 * canvas embedded in a document. Everything board-specific is a callback —
 * how a note's content is serialized, how notes are added, how they are
 * removed — so the gestures, the keyboard map and the paste placement are
 * defined once and cannot drift between the two.
 */

/** A note about to be created from the clipboard. The board mints the id. */
export interface PastedNote extends Omit<NoteFrame, "id"> {
  /** Serialized Lexical editor state. */
  content: string;
}

export interface MarqueeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Below this, a marquee drag is a click — it clears rather than selects. */
const MARQUEE_CLICK_SLOP = 4;

/**
 * How far a same-board paste is nudged off its originals. Without it the copies
 * land exactly on the notes they came from and look like nothing happened.
 */
const SAME_BOARD_PASTE_NUDGE = 28;

const EMPTY: ReadonlySet<string> = new Set();

/** Editable targets own their own copy/paste/delete — the board must not steal it. */
const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [contenteditable=""]';

/**
 * True when the key press belongs to something the author is typing in.
 *
 * The containment test is the whole point, and `closest()` alone gets it wrong:
 * a `CanvasNode` board is rendered by a Lexical decorator *inside the host
 * document's own `contenteditable`*, so every event on the board has an
 * editable ancestor. Only an editable **within** the board — a note's child
 * editor, the title field — may claim the key.
 */
function isTypingTarget(
  target: EventTarget | null,
  container: HTMLElement | null,
): boolean {
  const editable = (target as HTMLElement | null)?.closest?.(EDITABLE_SELECTOR);
  return !!editable && !!container && container.contains(editable);
}

interface UseNotesSelectionOptions {
  notes: NoteFrame[];
  /** The scrolling viewport. Focusable, so it can receive the shortcuts. */
  containerRef: RefObject<HTMLDivElement | null>;
  scale: number;
  /** Identifies the board, so a paste back into it can be nudged. */
  canvasId: string | null;
  /** False on a read-only board: gestures observe nothing, shortcuts are inert. */
  enabled: boolean;
  /** Serialized content for a note, however this board happens to store it. */
  getContent: (id: string) => string;
  onAddNotes: (notes: PastedNote[]) => void;
  onDeleteNotes: (ids: string[]) => void;
}

export function useNotesSelection({
  notes,
  containerRef,
  scale,
  canvasId,
  enabled,
  getContent,
  onAddNotes,
  onDeleteNotes,
}: UseNotesSelectionOptions) {
  const { clip, copyNotes, clearClip } = useNotesClipboard();
  const [rawSelected, setRawSelected] = useState<ReadonlySet<string>>(EMPTY);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);

  // Deleting a note leaves its id behind in the raw set. Filtering on read
  // rather than pruning in an effect keeps the two from ever disagreeing.
  const selectedIds = useMemo(() => {
    if (rawSelected.size === 0) return EMPTY;
    const live = new Set(notes.map((n) => n.id));
    const next = new Set<string>();
    rawSelected.forEach((id) => {
      if (live.has(id)) next.add(id);
    });
    return next;
  }, [rawSelected, notes]);

  // Read by the pointer/keyboard handlers, which are registered once per drag
  // and must not close over a stale list.
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const selectedRef = useRef(selectedIds);
  selectedRef.current = selectedIds;

  const clearSelection = useCallback(() => {
    setRawSelected((prev) => (prev.size === 0 ? prev : EMPTY));
  }, []);

  const selectAll = useCallback(() => {
    setRawSelected(new Set(notesRef.current.map((n) => n.id)));
  }, []);

  // --- gestures ------------------------------------------------------------

  /**
   * Mouse-down on a note. Returns true when the selection consumed the event,
   * which tells the note to skip its own focus/bring-to-front.
   *
   * A *plain* click clears the selection: a click on a note here means "put the
   * caret in this note", and leaving a stale multi-selection behind would make
   * the next Delete destroy notes the user was no longer thinking about.
   * Multi-selection is entered deliberately, with a modifier or a marquee.
   */
  const handleNoteMouseDown = useCallback(
    (id: string, event: React.MouseEvent): boolean => {
      if (!enabled) return false;
      if (!(event.metaKey || event.ctrlKey || event.shiftKey)) {
        clearSelection();
        return false;
      }
      // Keep focus off the note's editor so the shortcuts below stay live.
      event.preventDefault();
      event.stopPropagation();
      setRawSelected((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
      });
      containerRef.current?.focus({ preventScroll: true });
      return true;
    },
    [enabled, clearSelection, containerRef],
  );

  /**
   * Rubber-band select, started on empty board. Bound to the scaled board
   * element, so `event.target !== event.currentTarget` is exactly "the drag
   * began on the background rather than on a note".
   */
  const handleBoardPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!enabled || event.button !== 0) return;
      if (event.target !== event.currentTarget) return;

      const board = event.currentTarget;
      const additive = event.metaKey || event.ctrlKey || event.shiftKey;
      const base = additive ? selectedRef.current : EMPTY;

      // The rect is re-read per move: the viewport can scroll mid-drag, which
      // shifts the board under the pointer.
      const toBoard = (clientX: number, clientY: number) => {
        const rect = board.getBoundingClientRect();
        return {
          x: (clientX - rect.left) / scale,
          y: (clientY - rect.top) / scale,
        };
      };

      const start = toBoard(event.clientX, event.clientY);
      const startClient = { x: event.clientX, y: event.clientY };
      event.preventDefault(); // Suppress the browser's own text selection.
      containerRef.current?.focus({ preventScroll: true });

      const rectFrom = (point: { x: number; y: number }): MarqueeRect => ({
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        width: Math.abs(point.x - start.x),
        height: Math.abs(point.y - start.y),
      });

      const onMove = (e: PointerEvent) => {
        setMarquee(rectFrom(toBoard(e.clientX, e.clientY)));
      };

      const onUp = (e: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        setMarquee(null);

        const travelled = Math.hypot(
          e.clientX - startClient.x,
          e.clientY - startClient.y,
        );
        if (travelled < MARQUEE_CLICK_SLOP) {
          // A click on empty board, not a drag.
          if (!additive) clearSelection();
          return;
        }

        const box = rectFrom(toBoard(e.clientX, e.clientY));
        const next = new Set(base);
        for (const note of notesRef.current) {
          const hit = note.position.x < box.x + box.width &&
            note.position.x + note.size.width > box.x &&
            note.position.y < box.y + box.height &&
            note.position.y + note.size.height > box.y;
          if (hit) next.add(note.id);
        }
        setRawSelected(next);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [enabled, scale, clearSelection, containerRef],
  );

  // --- clipboard -----------------------------------------------------------

  const copySelection = useCallback(() => {
    const ids = selectedRef.current;
    if (ids.size === 0) return;
    // Board order, not click order, so the arrangement survives the round trip.
    const entries = notesRef.current
      .filter((note) => ids.has(note.id))
      .map((note) => ({ note, content: getContent(note.id) }));
    if (entries.length > 0) copyNotes(toClip(entries, canvasId));
  }, [getContent, copyNotes, canvasId]);

  const deleteSelection = useCallback(() => {
    const ids = [...selectedRef.current];
    if (ids.length === 0) return;
    onDeleteNotes(ids);
    clearSelection();
  }, [onDeleteNotes, clearSelection]);

  const cutSelection = useCallback(() => {
    copySelection();
    deleteSelection();
  }, [copySelection, deleteSelection]);

  /**
   * Drops the clip at the centre of what the author is currently looking at,
   * keeping the notes' relative arrangement. The clip is *not* consumed —
   * a clipboard you can only paste once is a surprise.
   */
  const paste = useCallback(() => {
    if (!clip) return;
    const extent = clipExtent(clip);
    const el = containerRef.current;

    let originX = VIRTUAL_CANVAS_WIDTH / 2 - extent.width / 2;
    let originY = VIRTUAL_CANVAS_HEIGHT / 2 - extent.height / 2;
    if (el) {
      originX = (el.scrollLeft + el.clientWidth / 2) / scale - extent.width / 2;
      originY = (el.scrollTop + el.clientHeight / 2) / scale -
        extent.height / 2;
    }
    if (clip.sourceId !== null && clip.sourceId === canvasId) {
      originX += SAME_BOARD_PASTE_NUDGE;
      originY += SAME_BOARD_PASTE_NUDGE;
    }
    originX = Math.max(0, originX);
    originY = Math.max(0, originY);

    const top = notesRef.current.reduce((m, n) => Math.max(m, n.zIndex), 0);
    onAddNotes(
      clip.notes.map((note, i) => ({
        position: { x: originX + note.offset.x, y: originY + note.offset.y },
        size: note.size,
        color: note.color,
        title: note.title,
        content: note.content,
        zIndex: top + 1 + i,
      })),
    );
  }, [clip, containerRef, scale, canvasId, onAddNotes]);

  // --- keyboard ------------------------------------------------------------

  /**
   * Bound to the scrolling viewport rather than the document, so a page holding
   * several boards routes a shortcut to the one the author is in.
   */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (!enabled) return;
      // Typing inside a note: that editor owns these keys.
      if (isTypingTarget(event.target, containerRef.current)) return;

      // `preventDefault` is not enough for a board embedded in a document: the
      // host Lexical editor listens on an *ancestor* of this container, so an
      // un-stopped Delete or Cmd+A would act on the document as well.
      const consume = () => {
        event.preventDefault();
        event.stopPropagation();
      };

      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const hasSelection = selectedRef.current.size > 0;

      if (mod && key === "a") {
        consume();
        selectAll();
      } else if (mod && key === "c" && hasSelection) {
        consume();
        copySelection();
      } else if (mod && key === "x" && hasSelection) {
        consume();
        cutSelection();
      } else if (mod && key === "v" && clip) {
        consume();
        paste();
      } else if (
        (event.key === "Delete" || event.key === "Backspace") && hasSelection
      ) {
        consume();
        deleteSelection();
      } else if (event.key === "Escape" && hasSelection) {
        consume();
        clearSelection();
      }
    },
    [
      enabled,
      clip,
      selectAll,
      copySelection,
      cutSelection,
      paste,
      deleteSelection,
      clearSelection,
      containerRef,
    ],
  );

  return {
    selectedIds,
    marquee,
    clip,
    handleNoteMouseDown,
    handleBoardPointerDown,
    handleKeyDown,
    copySelection,
    cutSelection,
    deleteSelection,
    clearSelection,
    paste,
    clearClip,
  };
}
