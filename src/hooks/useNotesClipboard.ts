"use client";
import { useSyncExternalStore } from "react";
import { NoteFrame } from "@/types/notes";

/**
 * The notes clipboard: one cut/copy buffer shared by every board in the app.
 *
 * Deliberately *not* a React context. The point of the feature is that a
 * selection copied on `/notes` can be pasted into a canvas embedded in some
 * other document, and reaching that canvas is usually a navigation — often a
 * full page load. A provider's state dies there, so the buffer lives in
 * `localStorage` and the hook is a `useSyncExternalStore` view onto it. That
 * also makes the buffer shared across tabs, which is how a clipboard is
 * expected to behave.
 *
 * An earlier version scoped a provider per board so a note could not be pasted
 * into a different canvas "and silently share a child editor". That hazard is
 * not real: a clip holds *serialized* editor state, and paste rebuilds a fresh
 * editor from it (`createNoteEditor`), so nothing is shared. The scoping only
 * blocked the thing this feature exists to do.
 */

const STORAGE_KEY = "blog-simple:notes-clipboard:v1";

export interface ClipboardNote {
  title?: string;
  /** Serialized Lexical editor state. */
  content: string;
  color: string;
  size: { width: number; height: number };
  /**
   * Position relative to the top-left corner of the copied group's bounding
   * box. Storing the offset rather than the absolute position is what lets a
   * multi-note paste reproduce the arrangement on a board that is scrolled
   * elsewhere, or is a different board entirely.
   */
  offset: { x: number; y: number };
}

export interface NotesClip {
  /**
   * The board the notes came from, so pasting back into it can nudge the copies
   * clear of their originals instead of stacking them invisibly on top.
   */
  sourceId: string | null;
  notes: ClipboardNote[];
}

/**
 * Builds a clip from the selected notes plus their content. Content is passed
 * per note because the two boards hold it differently — a `/notes` row stores
 * the serialized string, a `CanvasNode` note a live child editor.
 */
export function toClip(
  entries: { note: NoteFrame; content: string }[],
  sourceId: string | null,
): NotesClip {
  const originX = Math.min(...entries.map((e) => e.note.position.x));
  const originY = Math.min(...entries.map((e) => e.note.position.y));
  return {
    sourceId,
    notes: entries.map(({ note, content }) => ({
      title: note.title,
      content,
      color: note.color,
      size: { width: note.size.width, height: note.size.height },
      offset: {
        x: note.position.x - originX,
        y: note.position.y - originY,
      },
    })),
  };
}

/** Size of the clip's bounding box, in unscaled board units. */
export function clipExtent(clip: NotesClip): { width: number; height: number } {
  return clip.notes.reduce(
    (max, n) => ({
      width: Math.max(max.width, n.offset.x + n.size.width),
      height: Math.max(max.height, n.offset.y + n.size.height),
    }),
    { width: 0, height: 0 },
  );
}

// --- store -----------------------------------------------------------------

const listeners = new Set<() => void>();

// `getSnapshot` must return a stable reference or `useSyncExternalStore` loops
// forever, so the parse is memoized against the raw string it came from.
let cachedRaw: string | null = null;
let cachedClip: NotesClip | null = null;

function isClipboardNote(value: unknown): value is ClipboardNote {
  if (!value || typeof value !== "object") return false;
  const note = value as Record<string, unknown>;
  const size = note.size as Record<string, unknown> | undefined;
  const offset = note.offset as Record<string, unknown> | undefined;
  return typeof note.content === "string" &&
    typeof note.color === "string" &&
    (note.title === undefined || typeof note.title === "string") &&
    !!size && typeof size.width === "number" &&
    typeof size.height === "number" &&
    !!offset && typeof offset.x === "number" && typeof offset.y === "number";
}

/** Anything may sit under our key — another tab's older build, a hand edit. */
function parseClip(raw: string | null): NotesClip | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const notes = parsed?.notes;
    if (!Array.isArray(notes) || !notes.every(isClipboardNote)) return null;
    if (notes.length === 0) return null;
    return {
      sourceId: typeof parsed.sourceId === "string" ? parsed.sourceId : null,
      notes,
    };
  } catch {
    return null;
  }
}

function readClip(): NotesClip | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // Storage disabled (private mode, blocked cookies).
  }
  if (raw === cachedRaw) return cachedClip;
  cachedRaw = raw;
  cachedClip = parseClip(raw);
  return cachedClip;
}

/** No clipboard during SSR — the bar it feeds only renders on the client. */
function readServerClip(): NotesClip | null {
  return null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab wrote the key. `storage` does not fire in the tab that wrote,
  // which is why `write` notifies locally as well.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function write(clip: NotesClip | null): void {
  try {
    if (clip) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clip));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {
    // Over quota, or storage disabled. The copy is lost; say so rather than
    // leaving the user to discover it at paste time.
    console.error("Notes clipboard: could not write to storage", e);
    return;
  }
  listeners.forEach((l) => l());
}

/** Replaces the clipboard with `clip`. Stable across renders. */
function copyNotesToClipboard(clip: NotesClip): void {
  if (clip.notes.length === 0) return;
  write(clip);
}

/** Empties the clipboard. Stable across renders. */
function clearNotesClipboard(): void {
  write(null);
}

export function useNotesClipboard() {
  const clip = useSyncExternalStore(subscribe, readClip, readServerClip);
  return {
    clip,
    copyNotes: copyNotesToClipboard,
    clearClip: clearNotesClipboard,
  };
}
