"use client";
import { useCallback, useRef, useState } from "react";

export interface SidebarSelectionResult {
  /** Ids of the rows currently in the multi-selection. */
  selectedIds: Set<string>;
  isSelected: (id: string) => boolean;
  hasSelection: boolean;
  /**
   * Apply a modifier-aware selection gesture for a row activation. Sidebar rows
   * are navigation targets, so selection is *modifier-only*:
   *   - Shift+click       → extend a contiguous range from the anchor
   *   - Ctrl/Cmd+click    → toggle the row in/out of the selection
   *   - plain click       → drop any multi-selection (the row then navigates)
   *
   * Returns true when the click was consumed as a selection gesture and the
   * caller should suppress the row's default navigation/toggle; false for a
   * plain click, where the caller proceeds as normal.
   */
  handleSelectClick: (id: string, event: React.MouseEvent) => boolean;
  clear: () => void;
  selectAll: () => void;
}

/**
 * Multi-selection state for the sidebar tree (posts + series rows), keyed by
 * render order so Shift-range spans the visible rows. Mirrors the file-browser
 * behavior of {@link useListSelection} on the posts page, but gated to modifier
 * clicks so a plain click still opens the post.
 *
 * `allIds` is the flat list of selectable rows in render order (series rows plus
 * the posts of each *expanded* series and the standalone posts); it is only read
 * inside the gesture handlers, so an unstable array reference is fine.
 */
export function useSidebarSelection(allIds: string[]): SidebarSelectionResult {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  // Read `allIds` lazily inside callbacks without making them depend on its
  // (per-render) identity, which would thrash memoized child rows.
  const allIdsRef = useRef(allIds);
  allIdsRef.current = allIds;

  const isSelected = useCallback((id: string) => selectedIds.has(id), [
    selectedIds,
  ]);

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
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        setAnchorId(id);
        return true;
      }

      // Plain click: drop any multi-selection and let the row act normally. The
      // clicked row becomes the anchor for a subsequent Shift-range.
      setSelectedIds((prev) => (prev.size ? new Set() : prev));
      setAnchorId(id);
      return false;
    },
    [anchorId],
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
