/**
 * Everything a note needs to be laid out on a board — position, size, chrome.
 * Deliberately excludes the note's *content*, because the two storage shapes
 * hold it differently: a `Note` row keeps a serialized editor state string,
 * while a canvas embedded in a document (`CanvasNode`) holds a live nested
 * `LexicalEditor`. `DraggableNote` renders the shell from this type alone and
 * takes the content editor as `children`, so it works for either.
 */
export interface NoteFrame {
  id: string;
  position: {
    x: number;
    y: number;
  };
  size: {
    width: number;
    height: number;
  };
  title?: string; // Optional note title
  color: string;
  zIndex: number;
}

/** A note persisted as its own row, behind the `/api/notes` routes. */
export interface Note extends NoteFrame {
  canvasId: string;
  content: string; // Serialized Lexical editor state
  createdAt: number;
  updatedAt: number;
}

export interface NotesCanvas {
  id: string;
  authorId: string;
  name: string;
  notes: Note[];
  createdAt: number;
  updatedAt: number;
}

export interface CanvasSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}
