"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Panel geometry, stated once.
 *
 * The shell has three drag-resizable panels — the left sidebar, the right rail
 * and the Copilot panel — and "persist a width, track a resize drag" was written
 * three times. Two of those three were the same code with the constants swapped;
 * they use `useResizablePanel` now.
 *
 * The sidebar is genuinely different and is deliberately *not* folded in, and it
 * shares nothing here at all. Two reasons, either of which would be enough.
 * One drag of its handle is three behaviours — a discrete mode selector below a
 * measured threshold, a 1:1 splitter above it, and a dead band between (see
 * `components/Layout/SideBar/dragGeometry.ts`, which documents the geometry).
 * And its drag does not resize anything: it previews a destination and commits
 * once on release, over pointer capture rather than `document` listeners, so
 * even the capture below is the wrong shape for it. Expressing that as
 * configuration would mean passing the whole loop in as callbacks.
 *
 * (`readStoredWidth` is not shared with it either — the sidebar's bounds are
 * measured at runtime, so there is no static range to validate against at read
 * time.)
 */

/**
 * Read a persisted width, or `null` when there isn't a usable one.
 *
 * Out-of-range values are dropped rather than clamped: a width outside
 * [min, max] is either from a build with different limits or hand-edited, and
 * the default is a better answer than the nearest legal value.
 *
 * Callers must do this in an effect, never in a `useState` initialiser — the
 * server renders the default, so reading during the first render is a hydration
 * mismatch on every panel at once. (That is why these do not use
 * `useLocalStorage`, which reads in its initialiser.)
 */
const readStoredWidth = (
  key: string,
  min: number,
  max: number,
): number | null => {
  const saved = localStorage.getItem(key);
  if (!saved) return null;
  const parsed = parseInt(saved, 10);
  return parsed >= min && parsed <= max ? parsed : null;
};

/**
 * Hold the pointer for the duration of a resize drag.
 *
 * Listeners go on `document`, not on the gripper: the cursor routinely leaves a
 * 4px strip mid-drag, and `col-resize` + `user-select: none` on the body are
 * what stop the page selecting text under a drag that started on a divider.
 */
export const useDragCapture = (
  active: boolean,
  onMove: (e: MouseEvent) => void,
  onUp: () => void,
): void => {
  useEffect(() => {
    if (!active) return;
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [active, onMove, onUp]);
};

export interface ResizablePanelConfig {
  /** LocalStorage key for the user's preferred width. */
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}

interface ResizablePanel {
  /** Current width in px — live during a drag. */
  width: number;
  /** Whether the user is dragging this panel's gripper right now. */
  isResizing: boolean;
  /** Begin a drag from the gripper's `onMouseDown`. */
  startResize: (e: React.MouseEvent) => void;
}

/**
 * A panel docked to the **right** of the content, with its gripper on its left
 * edge: dragging left widens it. Both current users (right rail, Copilot) sit
 * there, so the sign is fixed rather than configurable — a left-docked panel
 * would need the opposite sign, and the one we have does not use this hook.
 *
 * The width is committed to localStorage on release, not per frame: a drag emits
 * a width every mousemove and localStorage writes are synchronous.
 */
export const useResizablePanel = (
  { storageKey, defaultWidth, minWidth, maxWidth }: ResizablePanelConfig,
): ResizablePanel => {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const stored = readStoredWidth(storageKey, minWidth, maxWidth);
    if (stored !== null) setWidth(stored);
  }, [storageKey, minWidth, maxWidth]);

  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  // Mirrored so the release handler can persist the final width without taking
  // `width` as a dependency, which would re-subscribe the drag every frame.
  const widthRef = useRef(width);
  widthRef.current = width;

  const handleMove = useCallback((e: MouseEvent) => {
    setWidth(
      Math.min(
        Math.max(
          startWidthRef.current - (e.clientX - startXRef.current),
          minWidth,
        ),
        maxWidth,
      ),
    );
  }, [minWidth, maxWidth]);

  const handleUp = useCallback(() => {
    setIsResizing(false);
    localStorage.setItem(storageKey, widthRef.current.toString());
  }, [storageKey]);

  useDragCapture(isResizing, handleMove, handleUp);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = widthRef.current;
  }, []);

  return { width, isResizing, startResize };
};
