"use client";
import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { actions, useDispatch } from "@/store";
import type { Post, Project, Series } from "@/types";
import { useConfirm } from "./useConfirm";

/**
 * What a selected row id names. Resolving an id to exactly one of these is what
 * makes bulk delete's routing total: adding a row kind to a surface means adding
 * an arm here, and the switch below stops compiling until it is handled.
 */
type BulkTarget =
  | { kind: "post"; post: Post }
  | { kind: "series"; id: string }
  | { kind: "project"; id: string };

export interface BulkPostActionsResult {
  selectedCount: number;
  /** Merge needs 2+ rows selected and every one of them a post. */
  canMerge: boolean;
  /** Move needs at least one post in the selection. */
  canMove: boolean;
  handleBulkDelete: () => Promise<void>;
  handleBulkMove: (seriesId: string | null) => Promise<void>;
  handleBulkMerge: () => Promise<void>;
}

export interface UseBulkPostActionsArgs {
  /** Currently multi-selected row ids. */
  selectedIds: Set<string>;
  /** All selectable rows in render order, for stable operation ordering. */
  orderedIds: string[];
  /** Drop the selection once a bulk action completes. */
  clearSelection: () => void;
  /**
   * Every post a selected row can name — the surface's own rows, not the whole
   * store. The two callers get their rows from different places (the sidebar
   * from the store, /posts from props), so the source is a parameter rather than
   * a `useSelector` baked in here.
   */
  posts: Post[];
  /** Every series a selected row can name. */
  series: Series[];
  /**
   * Every project a selected row can name. Neither surface renders a selectable
   * project row today (the sidebar's project headers are structural), so this is
   * only ever the empty case in practice — but bulk delete routes it correctly
   * rather than silently skipping ids it cannot classify, so a project row is a
   * render change and not a rewrite of this hook.
   */
  projects?: Project[];
}

/**
 * The three bulk operations a post-tree selection offers — delete,
 * move-to-series (or out to root), and merge into tabs — with their confirm
 * flows.
 *
 * Presentation is deliberately *not* here. The sidebar surfaces these through a
 * right-click menu and /posts through a persistent action bar; those are
 * different UI and stay that way. What was duplicated, down to the wording of
 * both confirm dialogs, is the operations themselves.
 */
export function useBulkPostActions({
  selectedIds,
  orderedIds,
  clearSelection,
  posts,
  series,
  projects,
}: UseBulkPostActionsArgs): BulkPostActionsResult {
  const dispatch = useDispatch();
  const router = useRouter();
  const confirm = useConfirm();

  const index = useMemo(() => {
    const map = new Map<string, BulkTarget>();
    for (const post of posts) map.set(post.id, { kind: "post", post });
    for (const s of series) map.set(s.id, { kind: "series", id: s.id });
    for (const p of projects ?? []) {
      map.set(p.id, { kind: "project", id: p.id });
    }
    return map;
  }, [posts, series, projects]);

  // The selection in render order. `orderedIds` *orders* the selection, it does
  // not gate it: a row stays selected when its series is collapsed out of view
  // (`useRowSelection` never prunes), and the "N selected" count still counts it,
  // so those rows sort last rather than dropping out of the operation.
  const orderedSelection = useMemo(() => {
    const rank = new Map(orderedIds.map((id, i) => [id, i]));
    return [...selectedIds]
      .map((id, i) => ({ id, at: rank.get(id) ?? orderedIds.length + i }))
      .sort((a, b) => a.at - b.at)
      .map((entry) => entry.id);
  }, [orderedIds, selectedIds]);

  // Selected posts only, in render order — the container for a merge is the
  // first of them, and a move lands them in the destination in this order.
  const selectedPosts = useMemo(
    () =>
      orderedSelection.flatMap((id) => {
        const target = index.get(id);
        return target?.kind === "post" ? [target.post] : [];
      }),
    [orderedSelection, index],
  );

  const canMerge = selectedPosts.length >= 2 &&
    selectedPosts.length === selectedIds.size;
  const canMove = selectedPosts.length > 0;

  const handleBulkDelete = useCallback(async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    const confirmed = await confirm({
      title: "Delete Selected",
      content: `Delete ${count} item${
        count !== 1 ? "s" : ""
      }? This cannot be undone.`,
      confirmLabel: "Delete",
    });
    if (!confirmed) return;

    for (const id of orderedSelection) {
      const target = index.get(id);
      if (!target) continue;
      switch (target.kind) {
        case "post":
          await dispatch(actions.deletePost(target.post.id));
          break;
        case "series":
          await dispatch(actions.deleteSeries(target.id));
          break;
        case "project":
          await dispatch(actions.deleteProject(target.id));
          break;
      }
    }
    clearSelection();
    router.refresh();
  }, [
    confirm,
    dispatch,
    router,
    clearSelection,
    selectedIds,
    orderedSelection,
    index,
  ]);

  const handleBulkMove = useCallback(
    async (seriesId: string | null) => {
      if (selectedPosts.length === 0) return;
      for (const post of selectedPosts) {
        await dispatch(
          actions.movePost({
            id: post.id,
            destination: seriesId ? { seriesId } : {},
          }),
        );
      }
      clearSelection();
      router.refresh();
    },
    [dispatch, router, clearSelection, selectedPosts],
  );

  const handleBulkMerge = useCallback(async () => {
    if (!canMerge) return;
    const [target, ...sources] = selectedPosts;
    const targetName = target.name || "this post";
    const confirmed = await confirm({
      title: "Merge into tabs",
      content: `Merge ${sources.length + 1} posts into "${targetName}"? ` +
        `The other ${sources.length} post${
          sources.length !== 1 ? "s" : ""
        } will be moved into tabs and permanently deleted. ` +
        `This cannot be undone.`,
      confirmLabel: "Merge",
    });
    if (!confirmed) return;

    await dispatch(
      actions.mergePostsIntoTabs({
        targetId: target.id,
        sourceIds: sources.map((p) => p.id),
      }),
    );
    clearSelection();
    router.refresh();
  }, [confirm, dispatch, router, clearSelection, canMerge, selectedPosts]);

  return {
    selectedCount: selectedIds.size,
    canMerge,
    canMove,
    handleBulkDelete,
    handleBulkMove,
    handleBulkMerge,
  };
}
