"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { NoteFrame } from "@/types/notes";

export interface ClipboardNote {
  title?: string;
  /** Serialized Lexical editor state. */
  content: string;
  color: string;
  size: { width: number; height: number };
}

/**
 * Builds a clipboard entry from a note's frame plus its content. Content is
 * passed separately because the two boards hold it differently — a `/notes`
 * row stores the serialized string, a `CanvasNode` note a live child editor.
 */
export function toClipboardNote(
  note: NoteFrame,
  content: string,
): ClipboardNote {
  return {
    title: note.title,
    content,
    color: note.color,
    size: { width: note.size.width, height: note.size.height },
  };
}

interface NotesClipboardContextType {
  clip: ClipboardNote | null;
  copyNote: (clip: ClipboardNote) => void;
  clearClip: () => void;
}

const NotesClipboardContext = createContext<NotesClipboardContextType | null>(
  null,
);

export function NotesClipboardProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [clip, setClip] = useState<ClipboardNote | null>(null);

  const copyNote = useCallback((clip: ClipboardNote) => setClip(clip), []);

  const clearClip = useCallback(() => setClip(null), []);

  return (
    <NotesClipboardContext.Provider
      value={{ clip, copyNote, clearClip }}
    >
      {children}
    </NotesClipboardContext.Provider>
  );
}

export function useNotesClipboard() {
  const ctx = useContext(NotesClipboardContext);
  if (!ctx) {
    throw new Error(
      "useNotesClipboard must be used inside NotesClipboardProvider",
    );
  }
  return ctx;
}
