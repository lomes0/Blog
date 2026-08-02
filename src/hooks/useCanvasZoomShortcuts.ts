import { RefObject, useEffect } from "react";

interface UseCanvasZoomShortcutsOptions {
  enabled: boolean;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
}

/**
 * Attaches ctrl+wheel and ctrl+keyboard (=, -, 0) zoom shortcuts to a
 * scrollable canvas container. Has no effect when `enabled` is false.
 *
 * Both listeners hang off the container, never `window`. A window-level keydown
 * handler answered a Ctrl+= pressed with the caret in the *document*, and
 * answered it on every board in that document at once: the board scaled up
 * while the column around it did not, and since the board's scale clamps at
 * 2.0 (`useNotesZoom`) while the browser's own zoom ladder does not, the same
 * number of Ctrl+- afterwards did not bring it back — it was left magnified,
 * persisted, over a column that had returned to its old width.
 *
 * The container is `tabIndex=0` and every note editor lives inside it, so a
 * keydown from the board the author is actually in still bubbles here.
 */
export function useCanvasZoomShortcuts({
  enabled,
  scrollContainerRef,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: UseCanvasZoomShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;
    const el = scrollContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (e.deltaY < 0) {
        onZoomIn?.();
      } else {
        onZoomOut?.();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        onZoomIn?.();
      } else if (e.key === "-") {
        e.preventDefault();
        onZoomOut?.();
      } else if (e.key === "0") {
        e.preventDefault();
        onResetZoom?.();
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    el.addEventListener("keydown", handleKeyDown);
    return () => {
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, scrollContainerRef, onZoomIn, onZoomOut, onResetZoom]);
}
