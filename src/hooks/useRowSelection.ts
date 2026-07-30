"use client";
import { useCallback, useRef, useState } from "react";

/** What a click with no modifier key does to the selection. */
export type PlainClickBehavior =
  /**
   * Drop any active multi-selection and consume the click; with nothing
   * selected, leave the selection alone and let the row act normally. For rows
   * that are navigation targets (the sidebar tree), where a plain click must
   * still open the post.
   */
  | "clear"
  /**
   * Toggle the row, like a file browser. For rows whose primary gesture *is*
   * selection (the /posts list, where navigation lives on the title).
   */
  | "toggle";

export interface RowSelectionResult {
  /** Ids of the rows currently in the multi-selection. */
  selectedIds: Set<string>;
  isSelected: (id: string) => boolean;
  hasSelection: boolean;
  /**
   * Apply a modifier-aware selection gesture for a row activation:
   *   - Shift+click       → extend a contiguous range from the anchor
   *   - Ctrl/Cmd+click    → toggle the row in/out of the selection
   *   - plain click       → per {@link PlainClickBehavior}
   *
   * Returns true when the click was consumed as a selection gesture and the
   * caller should suppress the row's default navigation/toggle.
   */
  handleSelectClick: (id: string, event: React.MouseEvent) => boolean;
  clear: () => void;
  selectAll: () => void;
}

/**
 * Multi-selection state for a flat list of rows, keyed by render order so a
 * Shift-range spans exactly the rows the user can see.
 *
 * Shared by the two surfaces that render the post tree — the sidebar and the
 * /posts list. They differ only in what a plain click means, so that is the one
 * option; everything else (range, toggle, select-all, anchor tracking) is the
 * same gesture vocabulary and lives here once.
 *
 * `allIds` is the flat list of selectable rows in render order (series/project
 * rows plus the children of each *expanded* one). It is only read inside the
 * gesture handlers, so an unstable array reference is fine — the handlers keep
 * stable identities so they can be passed to memoized rows without thrashing
 * them mid-drag.
 */
export function useRowSelection(
  allIds: string[],
  plainClick: PlainClickBehavior,
): RowSelectionResult {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);

  // Read `allIds` lazily inside callbacks without making them depend on its
  // (per-render) identity, which would thrash memoized child rows.
  const allIdsRef = useRef(allIds);
  allIdsRef.current = allIds;
  // Mirror the current selection so the gesture handler can branch on it without
  // depending on `selectedIds` (which would thrash memoized child rows).
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  const isSelected = useCallback((id: string) => selectedIds.has(id), [
    selectedIds,
  ]);

  const toggleId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchorId(id);
  }, []);

  const handleSelectClick = useCallback(
    (id: string, event: React.MouseEvent): boolean => {
      const ids = allIdsRef.current;

      if (event.shiftKey && anchorId) {
        const anchorIndex = ids.indexOf(anchorId);
        const targetIndex = ids.indexOf(id);
        if (anchorIndex !== -1 && targetIndex !== -1) {
          const [start, end] = anchorIndex < targetIndex
            ? [anchorIndex, targetIndex]
            : [targetIndex, anchorIndex];
          const rangeIds = ids.slice(start, end + 1);
          setSelectedIds((prev) => {
            const next = new Set(prev);
            rangeIds.forEach((rid) => next.add(rid));
            return next;
          });
        }
        return true;
      }

      if (event.metaKey || event.ctrlKey) {
        toggleId(id);
        return true;
      }

      if (plainClick === "toggle") {
        toggleId(id);
        return true;
      }

      // "clear": a plain click while a multi-selection is active cancels the
      // selection and consumes the click, so it just exits multi-select instead
      // of navigating.
      if (selectedIdsRef.current.size) {
        setSelectedIds(new Set());
        setAnchorId(id);
        return true;
      }

      // Plain click with no selection: let the row act normally. The clicked row
      // becomes the anchor for a subsequent Shift-range.
      setAnchorId(id);
      return false;
    },
    [anchorId, plainClick, toggleId],
  );

  const clear = useCallback(() => {
    setSelectedIds((prev) => (prev.size ? new Set() : prev));
    setAnchorId(null);
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(allIdsRef.current));
  }, []);

  return {
    selectedIds,
    isSelected,
    hasSelection: selectedIds.size > 0,
    handleSelectClick,
    clear,
    selectAll,
  };
}
