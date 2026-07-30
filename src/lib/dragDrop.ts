import type { DragEvent } from "react";

/**
 * Native drag-and-drop vocabulary shared by every surface that renders the post
 * tree — the sidebar (`useSidebarDnd`), the /posts list (`PostsListView`) and
 * the card grid (`DraggablePostCard`).
 *
 * These surfaces are on screen *at the same time* (the sidebar is part of the
 * app layout), so a drag can start on one and end on another. That only works if
 * they agree on the MIME type and the payload shape, which is why both live here
 * rather than next to any one engine.
 */

/** MIME type carrying a dragged row (or block of rows) between tree surfaces. */
export const DRAG_MIME = "application/matheditor-document";

/** Which edge of the row under the cursor a drop would land on. */
export type DropPosition = "before" | "after";

/**
 * What a drag carries. `ids` is the whole dragged block in render order (a
 * single-row drag carries one id); `id`/`name` describe the grabbed row, for
 * drop targets that act on one item or need a label for a confirm prompt.
 */
export interface DragPayload {
  ids: string[];
  id: string;
  name?: string;
}

/**
 * Write the payload for a drag of `ids` (render order; first is the grabbed
 * row). Always pair with {@link readDragPayload} — writing the JSON by hand is
 * how the block form and the single-item form drifted apart.
 */
export function setDragPayload(
  dataTransfer: DataTransfer,
  ids: string[],
  name?: string,
): void {
  const payload: DragPayload = { ids, id: ids[0] ?? "", name };
  dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
  dataTransfer.effectAllowed = "move";
}

/**
 * Read a drag payload, or null when the drag carries none (or malformed JSON —
 * a drop target should ignore it rather than throw).
 *
 * Tolerates a payload that predates `ids` by treating a lone `id` as a
 * single-row block, so a stale writer degrades to a one-item drag instead of a
 * dropped gesture.
 */
export function readDragPayload(
  dataTransfer: DataTransfer,
): DragPayload | null {
  const raw = dataTransfer.getData(DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DragPayload>;
    const ids = Array.isArray(parsed.ids) && parsed.ids.length
      ? parsed.ids
      : parsed.id
      ? [parsed.id]
      : [];
    if (!ids.length) return null;
    return { ids, id: parsed.id ?? ids[0], name: parsed.name };
  } catch {
    return null;
  }
}

/**
 * Whether the cursor is over the top or bottom half of the row the drag event is
 * bound to. Reads `currentTarget` (valid synchronously in the handler) so no ref
 * is needed on the row element.
 */
export function dropPositionFromEvent(
  e: DragEvent<HTMLElement>,
): DropPosition {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
}
