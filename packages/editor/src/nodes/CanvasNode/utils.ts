import {
  createEditor,
  LexicalEditor,
  LexicalNode,
  SerializedEditor,
  SerializedEditorState,
} from "lexical";
import { v4 as uuidv4 } from "uuid";
import { NoteFrame } from "@/types/notes";
import { nestedEditorConfig } from "../nestedConfig";
import { NOTE_COLORS } from "@/components/NotesCanvas/noteColors";

export const CANVAS_NODE_TYPE = "canvas";

/**
 * Board geometry. Re-exported here because this module is what the `CanvasNode`
 * side already imports from. The virtual canvas size is deliberately not among
 * them: this board is sized by the document column it sits in, not by a fixed
 * viewport.
 */
export { CANVAS_GROW_MARGIN } from "@/components/NotesCanvas/canvasGeometry";

/**
 * A document is a scrolling column, so the board gets a fixed viewport height
 * the reader can't grow. The author sets it with the grip on the board's
 * bottom edge.
 */
export const CANVAS_MIN_HEIGHT = 200;
export const CANVAS_DEFAULT_HEIGHT = 480;
export const CANVAS_MAX_HEIGHT = 1600;

export const NOTE_DEFAULT_WIDTH = 240;
export const NOTE_DEFAULT_HEIGHT = 200;

/**
 * Kept clear between a new note and the edge of the frame. `react-rnd` draws
 * its resize handles *outside* the note — 5px on the edges, 10px at the corners
 * — so a note sized flush to a narrow board still earns it a scrollbar.
 */
export const NOTE_GUTTER = 10;

/** Used when a note carries a color that is no longer in the palette. */
export const NOTE_COLORS_FALLBACK = NOTE_COLORS.yellow;

export function clampCanvasHeight(height: number): number {
  return Math.min(CANVAS_MAX_HEIGHT, Math.max(CANVAS_MIN_HEIGHT, height));
}

/**
 * A note on a canvas embedded in a document. Unlike a `Note` row in the
 * database, its content is a live child `LexicalEditor` rather than a
 * serialized string — that is what lets the note run the full editor plugin set
 * through `NestedEditor`, and what ties its edits into the host document's save
 * and undo.
 */
export interface CanvasNote extends NoteFrame {
  editor: LexicalEditor;
}

export type SerializedCanvasNote = Omit<CanvasNote, "editor"> & {
  editor: SerializedEditor;
};

export interface CanvasPayload {
  id?: string;
  notes?: CanvasNote[];
  height?: number;
}

/**
 * Creates the child editor for a note, optionally seeded from a previously
 * serialized state (a reopened document, or a note pasted from the clipboard).
 * A malformed state yields an empty note rather than breaking the document.
 */
export function createNoteEditor(
  state?: string | SerializedEditorState,
): LexicalEditor {
  const editor = createEditor(nestedEditorConfig);
  if (state) {
    try {
      const editorState = editor.parseEditorState(state);
      if (!editorState.isEmpty()) {
        editor.setEditorState(editorState);
      }
    } catch (e) {
      console.error("CanvasNode: could not parse note content", e);
    }
  }
  return editor;
}

export function createCanvasNote(
  init: Omit<CanvasNote, "id" | "editor"> & { content?: string },
): CanvasNote {
  const { content, ...frame } = init;
  return { ...frame, id: uuidv4(), editor: createNoteEditor(content) };
}

/** Serializes a note's content to the string form the clipboard uses. */
export function serializeNoteContent(note: CanvasNote): string {
  return JSON.stringify(note.editor.getEditorState().toJSON());
}

/**
 * Structural view of `CanvasNode`, so `CanvasComponent` can mutate the node it
 * decorates without importing the class it is rendered by — that import would
 * close a cycle between the node module and its component module.
 */
export interface CanvasNodeLike {
  getNotes(): CanvasNote[];
  setNotes(notes: CanvasNote[]): void;
  getCanvasHeight(): number;
  setCanvasHeight(height: number): void;
}

export function $asCanvasNode(
  node: LexicalNode | null | undefined,
): CanvasNodeLike | null {
  if (!node || node.getType() !== CANVAS_NODE_TYPE) return null;
  return node as unknown as CanvasNodeLike;
}
