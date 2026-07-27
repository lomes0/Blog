"use client";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import {
  actions,
  documentsSelectors,
  type RootState,
  useDispatch,
  useSelector,
} from "@/store";
import type { Series, UserDocument } from "@/types";

export interface BulkMenuState {
  mouseX: number;
  mouseY: number;
}

export interface SidebarBulkActionsResult {
  menu: BulkMenuState | null;
  openMenu: (event: React.MouseEvent) => void;
  closeMenu: () => void;
  selectedCount: number;
  availableSeries: Series[];
  canMerge: boolean;
  handleBulkDelete: () => Promise<void>;
  handleBulkMove: (seriesId: string | null) => Promise<void>;
  handleBulkMerge: () => Promise<void>;
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
 * Bulk operations for a sidebar multi-selection, mirroring the posts page
 * `BulkActionBar`: delete, move-to-series (or out to root), and merge into tabs.
 * Series membership and merge are cloud-only, matching the thunks' constraints.
 */
export function useSidebarBulkActions(
  { selectedIds, orderedIds, clearSelection }: UseSidebarBulkActionsArgs,
): SidebarBulkActionsResult {
  const dispatch = useDispatch();
  const router = useRouter();
  const documents = useSelector((state: RootState) =>
    documentsSelectors.selectAll(state)
  );
  const series = useSelector((state: RootState) => state.series);

  const [menu, setMenu] = useState<BulkMenuState | null>(null);

  const openMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setMenu({ mouseX: event.clientX + 2, mouseY: event.clientY - 6 });
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);

  const seriesIdSet = useMemo(
    () => new Set(series.map((s) => s.id)),
    [series],
  );
  const docsById = useMemo(() => {
    const map = new Map<string, UserDocument>();
    for (const d of documents) map.set(d.id, d);
    return map;
  }, [documents]);

  // Selected posts (series rows excluded), in render order.
  const selectedPosts = useMemo(
    () =>
      orderedIds
        .filter((id) => selectedIds.has(id) && !seriesIdSet.has(id))
        .map((id) => docsById.get(id))
        .filter((d): d is UserDocument => Boolean(d)),
    [orderedIds, selectedIds, seriesIdSet, docsById],
  );

  // Merge is cloud-only, needs ≥2 posts, and no series in the selection.
  const canMerge = selectedPosts.length >= 2 &&
    selectedPosts.length === selectedIds.size &&
    selectedPosts.every((p) => Boolean(p.cloud));

  const handleBulkDelete = useCallback(async () => {
    closeMenu();
    const count = selectedIds.size;
    if (count === 0) return;
    const cancelId = uuid();
    const confirmId = uuid();
    const response = await dispatch(
      actions.alert({
        title: "Delete Selected",
        content: `Delete ${count} item${
          count !== 1 ? "s" : ""
        }? This cannot be undone.`,
        actions: [
          { label: "Cancel", id: cancelId },
          { label: "Delete", id: confirmId },
        ],
      }),
    );
    if (response.payload !== confirmId) return;
    for (const id of selectedIds) {
      if (seriesIdSet.has(id)) {
        await dispatch(actions.deleteSeries(id));
      } else {
        const doc = docsById.get(id);
        if (!doc) continue;
        if (doc.cloud) await dispatch(actions.deleteCloudDocument(id));
        // Always remove the local (IndexedDB) copy so the post is deleted
        // completely; the delete is idempotent when there is nothing to remove.
        await dispatch(actions.deleteLocalDocument(id));
      }
    }
    clearSelection();
    router.refresh();
  }, [
    dispatch,
    router,
    closeMenu,
    clearSelection,
    selectedIds,
    seriesIdSet,
    docsById,
  ]);

  const handleBulkMove = useCallback(
    async (seriesId: string | null) => {
      closeMenu();
      const movable = selectedPosts.filter((p) => Boolean(p.cloud));
      if (movable.length === 0) return;
      for (const post of movable) {
        await dispatch(
          actions.moveDocument({
            id: post.id,
            destination: seriesId ? { seriesId } : {},
          }),
        );
      }
      clearSelection();
      router.refresh();
    },
    [dispatch, router, closeMenu, clearSelection, selectedPosts],
  );

  const handleBulkMerge = useCallback(async () => {
    closeMenu();
    if (!canMerge) return;
    const [target, ...sources] = selectedPosts;
    const targetName = target.cloud?.name || target.local?.name || "this post";
    const cancelId = uuid();
    const confirmId = uuid();
    const response = await dispatch(
      actions.alert({
        title: "Merge into tabs",
        content: `Merge ${sources.length + 1} posts into "${targetName}"? ` +
          `The other ${sources.length} post${
            sources.length !== 1 ? "s" : ""
          } will be moved into tabs and permanently deleted. ` +
          `This cannot be undone.`,
        actions: [
          { label: "Cancel", id: cancelId },
          { label: "Merge", id: confirmId },
        ],
      }),
    );
    if (response.payload !== confirmId) return;
    await dispatch(
      actions.mergeCloudDocumentsIntoTabs({
        targetId: target.id,
        sourceIds: sources.map((p) => p.id),
      }),
    );
    clearSelection();
    router.refresh();
  }, [dispatch, router, closeMenu, clearSelection, canMerge, selectedPosts]);

  return {
    menu,
    openMenu,
    closeMenu,
    selectedCount: selectedIds.size,
    availableSeries: series,
    canMerge,
    handleBulkDelete,
    handleBulkMove,
    handleBulkMerge,
  };
}
