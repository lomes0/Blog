"use client";
import { useCallback, useState } from "react";
import { postsSelectors, type RootState, useSelector } from "@/store";
import {
  type BulkPostActionsResult,
  useBulkPostActions,
} from "@/hooks/useBulkPostActions";
import type { Series } from "@/types";

export interface BulkMenuState {
  mouseX: number;
  mouseY: number;
}

interface SidebarBulkActionsResult extends
  Pick<
    BulkPostActionsResult,
    | "selectedCount"
    | "canMerge"
    | "handleBulkDelete"
    | "handleBulkMove"
    | "handleBulkMerge"
  > {
  menu: BulkMenuState | null;
  openMenu: (event: React.MouseEvent) => void;
  closeMenu: () => void;
  availableSeries: Series[];
}

interface UseSidebarBulkActionsArgs {
  /** Currently multi-selected row ids (posts and/or series). */
  selectedIds: Set<string>;
  /** All selectable rows in render order, for stable merge ordering. */
  orderedIds: string[];
  /** Drop the selection once a bulk action completes. */
  clearSelection: () => void;
}

/**
 * The sidebar's presentation of {@link useBulkPostActions}: a right-click menu
 * anchored at the pointer, over rows sourced from the store. The operations
 * themselves — delete, move-to-series, merge into tabs, and both confirm
 * dialogs — are shared with the /posts action bar and live in that hook; only
 * the menu anchor and the store reads are sidebar-specific.
 */
export function useSidebarBulkActions(
  { selectedIds, orderedIds, clearSelection }: UseSidebarBulkActionsArgs,
): SidebarBulkActionsResult {
  const posts = useSelector((state: RootState) =>
    postsSelectors.selectAll(state)
  );
  const series = useSelector((state: RootState) => state.series);
  const projects = useSelector((state: RootState) => state.projects);

  const [menu, setMenu] = useState<BulkMenuState | null>(null);

  const openMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setMenu({ mouseX: event.clientX + 2, mouseY: event.clientY - 6 });
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);

  const bulk = useBulkPostActions({
    selectedIds,
    orderedIds,
    clearSelection,
    posts,
    series,
    projects,
  });

  // The menu has to be dismissed before the operation's confirm dialog opens,
  // or it stays up behind it.
  const { handleBulkDelete, handleBulkMove, handleBulkMerge } = bulk;
  const deleteSelected = useCallback(() => {
    closeMenu();
    return handleBulkDelete();
  }, [closeMenu, handleBulkDelete]);
  const moveSelected = useCallback(
    (seriesId: string | null) => {
      closeMenu();
      return handleBulkMove(seriesId);
    },
    [closeMenu, handleBulkMove],
  );
  const mergeSelected = useCallback(() => {
    closeMenu();
    return handleBulkMerge();
  }, [closeMenu, handleBulkMerge]);

  return {
    menu,
    openMenu,
    closeMenu,
    selectedCount: bulk.selectedCount,
    availableSeries: series,
    canMerge: bulk.canMerge,
    handleBulkDelete: deleteSelected,
    handleBulkMove: moveSelected,
    handleBulkMerge: mergeSelected,
  };
}
