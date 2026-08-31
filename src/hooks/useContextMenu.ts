import { useCallback, useState } from "react";

/**
 * A cursor-anchored context menu's position plus whatever it was opened on —
 * an entity id for the sidebar's post/series/project rows, a richer object where
 * the menu needs more than an id (see `SubTabList`).
 */
export interface ContextMenuState<T> {
  mouseX: number;
  mouseY: number;
  target: T;
}

interface ContextMenuResult<T> {
  contextMenu: ContextMenuState<T> | null;
  /** Right-click handler: anchors the menu at the cursor, keyed to `target`. */
  open: (event: React.MouseEvent, target: T) => void;
  close: () => void;
}

/**
 * State for a right-click menu anchored at the cursor. `open` suppresses the
 * native menu and records the click position; a second right-click while one is
 * already open closes it instead, since the open menu swallows the outside
 * click that would otherwise dismiss it.
 *
 * `stopPropagation` is for rows nested inside another right-clickable row (a
 * series header inside the tree, a sub-tab inside a post), where the ancestor
 * would otherwise open its own menu from the same event.
 */
export function useContextMenu<T>(
  options: { stopPropagation?: boolean } = {},
): ContextMenuResult<T> {
  const { stopPropagation = false } = options;
  const [contextMenu, setContextMenu] = useState<ContextMenuState<T> | null>(
    null,
  );

  const open = useCallback(
    (event: React.MouseEvent, target: T) => {
      event.preventDefault();
      if (stopPropagation) event.stopPropagation();
      // Offset from the cursor so the menu's corner doesn't sit under it.
      setContextMenu((prev) =>
        prev === null
          ? { mouseX: event.clientX + 2, mouseY: event.clientY - 6, target }
          : null
      );
    },
    [stopPropagation],
  );

  const close = useCallback(() => setContextMenu(null), []);

  return { contextMenu, open, close };
}
