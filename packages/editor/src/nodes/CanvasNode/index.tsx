import type {
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";

import { DecoratorNode } from "lexical";
import { $generateHtmlFromNodes } from "@lexical/html";
import { v4 as uuidv4 } from "uuid";
import { JSX } from "react";
import CanvasComponent from "./CanvasComponent";
import {
  CANVAS_DEFAULT_HEIGHT,
  CANVAS_NODE_TYPE,
  CanvasNote,
  CanvasPayload,
  clampCanvasHeight,
  createNoteEditor,
  NOTE_COLORS_FALLBACK,
  SerializedCanvasNote,
} from "./utils";
import { NOTE_COLORS, NoteColorKey } from "@/components/NotesCanvas/noteColors";

export type SerializedCanvasNode = Spread<
  {
    id: string;
    notes: SerializedCanvasNote[];
    height: number;
  },
  SerializedLexicalNode
>;

/**
 * A sticky-note board embedded in a document, owned by the document rather than
 * by rows in the database.
 *
 * The notes live in this node's serialized state, so they travel with the post:
 * they save through the existing document save, work for guest drafts in
 * IndexedDB, survive fork/duplicate/revision, and render for anonymous readers.
 * Referencing a `NotesCanvas` row by id would do none of those, since every
 * `/api/notes` route is owner-only.
 */
export class CanvasNode extends DecoratorNode<JSX.Element> {
  /** Stable across reloads, unlike the node key. Scopes the board's zoom. */
  __id: string;
  __notes: CanvasNote[];
  __height: number;

  static getType(): string {
    return CANVAS_NODE_TYPE;
  }

  static clone(node: CanvasNode): CanvasNode {
    return new CanvasNode(
      node.__id,
      node.__notes,
      node.__height,
      node.__key,
    );
  }

  static importJSON(serializedNode: SerializedCanvasNode): CanvasNode {
    const { id, notes, height } = serializedNode;
    return new CanvasNode(
      id || uuidv4(),
      (notes ?? []).map(({ editor, ...frame }) => ({
        ...frame,
        editor: createNoteEditor(editor?.editorState),
      })),
      height ?? CANVAS_DEFAULT_HEIGHT,
    ).updateFromJSON(serializedNode);
  }

  static importDOM(): null {
    return null;
  }

  constructor(
    id: string,
    notes: CanvasNote[] = [],
    height: number = CANVAS_DEFAULT_HEIGHT,
    key?: NodeKey,
  ) {
    super(key);
    this.__id = id;
    this.__notes = notes;
    this.__height = clampCanvasHeight(height);
  }

  exportJSON(): SerializedCanvasNode {
    return {
      ...super.exportJSON(),
      id: this.__id,
      notes: this.__notes.map(({ editor, ...frame }) => ({
        ...frame,
        editor: editor.toJSON(),
      })),
      height: this.__height,
      type: CANVAS_NODE_TYPE,
      version: 1,
    };
  }

  createDOM(_config: EditorConfig, editor: LexicalEditor): HTMLElement {
    this.adoptNotes(editor);
    const dom = document.createElement("div");
    dom.className = "canvas-board";
    return dom;
  }

  /**
   * Block-level, so it is a child of a container rather than of a paragraph and
   * the content bridge can address it — and address *into* it
   * (docs/plans/nested-editor-support.md §3). An inline decorator gets wrapped
   * in a paragraph on insert, and a paragraph is not a `BLOCK_CONTAINER`, so
   * everything inside one is unreachable however well the seam is written.
   */
  isInline(): false {
    return false;
  }

  updateDOM(_prevNode: CanvasNode, _dom: HTMLElement): false {
    return false;
  }

  /**
   * Points each note's child editor at the host editor. `NestedEditor` reads
   * `_parentEditor` on its first render to dispatch the document-dirty command,
   * so it has to be set before the board mounts.
   */
  adoptNotes(editor: LexicalEditor): void {
    for (const note of this.__notes) {
      note.editor._parentEditor = editor;
    }
  }

  getNotes(): CanvasNote[] {
    return this.getLatest().__notes;
  }

  setNotes(notes: CanvasNote[]): this {
    const self = this.getWritable();
    self.__notes = notes;
    return self;
  }

  getCanvasHeight(): number {
    return this.getLatest().__height;
  }

  setCanvasHeight(height: number): this {
    const self = this.getWritable();
    self.__height = clampCanvasHeight(height);
    return self;
  }

  decorate(): JSX.Element {
    return (
      <CanvasComponent
        nodeKey={this.getKey()}
        canvasId={this.__id}
        notes={this.__notes}
        height={this.__height}
      />
    );
  }

  /**
   * Exports the board as absolutely-positioned note cards, so PDF/HTML output
   * keeps the spatial arrangement that is the whole point of a canvas.
   */
  exportDOM(_editor: LexicalEditor): DOMExportOutput {
    const element = document.createElement("div");
    element.setAttribute("data-lexical-canvas", "true");

    const extent = this.__notes.reduce(
      (max, note) => ({
        width: Math.max(max.width, note.position.x + note.size.width),
        height: Math.max(max.height, note.position.y + note.size.height),
      }),
      { width: 0, height: 0 },
    );

    const board = document.createElement("div");
    board.style.position = "relative";
    board.style.width = "100%";
    board.style.height = `${extent.height + 16}px`;
    board.style.overflow = "hidden";

    for (const note of this.__notes) {
      const card = document.createElement("div");
      card.style.position = "absolute";
      card.style.left = `${
        (note.position.x / Math.max(extent.width, 1)) * 100
      }%`;
      card.style.top = `${note.position.y}px`;
      card.style.width = `${note.size.width}px`;
      card.style.height = `${note.size.height}px`;
      card.style.overflow = "hidden";
      card.style.borderRadius = "6px";
      card.style.padding = "10px";
      card.style.boxSizing = "border-box";
      card.style.background = NOTE_COLORS[note.color as NoteColorKey] ??
        NOTE_COLORS_FALLBACK;
      card.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)";
      card.style.color = "rgba(0,0,0,0.87)";

      if (note.title) {
        const title = document.createElement("strong");
        title.style.display = "block";
        title.style.marginBottom = "6px";
        title.textContent = note.title;
        card.appendChild(title);
      }

      const body = document.createElement("div");
      note.editor.getEditorState().read(() => {
        body.innerHTML = $generateHtmlFromNodes(note.editor);
      });
      card.appendChild(body);
      board.appendChild(card);
    }

    element.appendChild(board);
    return { element };
  }

  isIsolated(): true {
    return true;
  }
}

export function $createCanvasNode(payload: CanvasPayload = {}): CanvasNode {
  const { id, notes, height } = payload;
  return new CanvasNode(id ?? uuidv4(), notes ?? [], height);
}

export type { CanvasNote, CanvasPayload } from "./utils";
