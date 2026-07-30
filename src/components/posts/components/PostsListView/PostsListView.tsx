"use client";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Box } from "@mui/material";
import { v4 as uuid } from "uuid";
import { Series, Post } from "@/types";
import { actions, useDispatch } from "@/store";
import { useRouter } from "next/navigation";
import { useExpandedState } from "@/hooks/useExpandedState";
import {
  comparePostsByRank,
  rankOf,
  ranksBracketing,
  type ReorderDirection,
} from "@/lib/documentOrder";
import { compareRankThenId } from "@/lib/ordering";
import { ListDensity } from "./types";
import { PostRow } from "./components/PostRow";
import { SeriesRow } from "./components/SeriesRow";
import { BulkActionBar } from "./components/BulkActionBar";
import { useListSelection } from "./hooks/useListSelection";
import { useInlineRename } from "@/hooks/useInlineRename";

interface PostsListViewProps {
  /** Standalone posts (not in any series). */
  posts: Post[];
  /** All series with their posts. */
  series: Series[];
  /**
   * Series offered as bulk-move destinations. Defaults to `series`. In series
   * mode `series` is empty (no Series section), so this supplies the *other*
   * series to move posts into.
   */
  moveTargetSeries?: Series[];
  density: ListDensity;
}

// A single entry in the interleaved root list: a standalone post or a series.
type RootItem =
  | { kind: "post"; id: string; rank: string | null; post: Post }
  | { kind: "series"; id: string; rank: string | null; series: Series };

// Rank ascending; unranked entries sort last; ties broken by id (total/stable).
// Delegates to the shared primitive so /posts and the sidebar agree on order.
const compareByRank = (a: RootItem, b: RootItem): number =>
  compareRankThenId(a.rank, a.id, b.rank, b.id);

export function PostsListView({
  posts,
  series,
  moveTargetSeries,
  density,
}: PostsListViewProps) {
  const dispatch = useDispatch();
  const router = useRouter();
  const [dragOverSeriesId, setDragOverSeriesId] = useState<string | null>(null);

  const { expandedSeries, toggleSeries } = useExpandedState(
    "postsListExpansion",
  );

  // Each series' posts, wrapped and rank-sorted (so reorder is reflected).
  const seriesPostsById = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const s of series) {
      map.set(
        s.id,
        s.posts
          .slice()
          .sort(comparePostsByRank),
      );
    }
    return map;
  }, [series]);

  // The root list: standalone posts and series interleaved in one shared rank
  // space (the user's chosen free-interleave model). The order here is also the
  // source of the neighbour ranks that bracket a reorder (see
  // handleReorderRoot / handleReorderDrop), so it must stay rank-monotonic —
  // don't group or re-sort it for presentation.
  const rootItems = useMemo((): RootItem[] => {
    const items: RootItem[] = [
      ...posts.map((p) => ({
        kind: "post" as const,
        id: p.id,
        rank: rankOf(p),
        post: p,
      })),
      ...series.map((s) => ({
        kind: "series" as const,
        id: s.id,
        rank: s.rank ?? null,
        series: s,
      })),
    ];
    return items.sort(compareByRank);
  }, [posts, series]);

  // Flat ordered list of all visible IDs for range selection (render order).
  const allVisibleIds = useMemo(() => {
    const ids: string[] = [];
    for (const item of rootItems) {
      ids.push(item.id);
      if (item.kind === "series" && expandedSeries.has(item.id)) {
        (seriesPostsById.get(item.id) ?? []).forEach((p) => ids.push(p.id));
      }
    }
    return ids;
  }, [rootItems, expandedSeries, seriesPostsById]);

  const selection = useListSelection({ allIds: allVisibleIds });

  // Every renameable post: the standalone rows plus each series' children, since
  // a rename can start on either and the hook resolves the row by id.
  const renameablePosts = useMemo(
    () => [...posts, ...series.flatMap((s) => s.posts)],
    [posts, series],
  );

  const postRename = useInlineRename<Post, undefined>({
    items: renameablePosts,
    getId: (post) => post.id,
    // The row shows "Untitled" for an empty name, so the field opens with it —
    // but it is compared against the stored "" so typing it counts as a change.
    getTitle: (post) => post.name || "Untitled",
    getStoredTitle: (post) => post.name || "",
    onCommit: (post, name) => {
      dispatch(actions.updatePost({ id: post.id, partial: { name } }));
      router.refresh();
    },
    initialContext: undefined,
  });

  // Series rename is the same machine over a different entity — updateSeries
  // writes `title`, not `name`.
  const seriesRename = useInlineRename<Series, undefined>({
    items: series,
    getId: (s) => s.id,
    getTitle: (s) => s.title,
    onCommit: (s, title) => {
      dispatch(actions.updateSeries({ id: s.id, data: { title } }));
      router.refresh();
    },
    initialContext: undefined,
  });

  // ── Delete handlers ───────────────────────────────────────────────────────
  const handleDeletePost = useCallback(async (post: Post) => {
    const name = post.name || "This post";
    const alertPayload = {
      title: "Delete Post",
      content: `Delete "${name}"? This cannot be undone.`,
      actions: [
        { label: "Cancel", id: uuid() },
        { label: "Delete", id: uuid() },
      ],
    };
    const response = await dispatch(actions.alert(alertPayload));
    if (response.payload === alertPayload.actions[1].id) {
      await dispatch(actions.deletePost(post.id));
      router.refresh();
    }
  }, [dispatch, router]);

  const handleDeleteSeries = useCallback(
    async (seriesId: string, seriesTitle: string) => {
      const alertPayload = {
        title: "Delete Series",
        content: `Delete "${seriesTitle}"? Posts will not be deleted.`,
        actions: [
          { label: "Cancel", id: uuid() },
          { label: "Delete", id: uuid() },
        ],
      };
      const response = await dispatch(actions.alert(alertPayload));
      if (response.payload === alertPayload.actions[1].id) {
        await dispatch(actions.deleteSeries(seriesId));
        router.refresh();
      }
    },
    [dispatch, router],
  );

  // Map series IDs for O(1) lookup during bulk delete
  const seriesIdSet = useMemo(() => new Set(series.map((s) => s.id)), [series]);

  // Flat map of all post UserDocuments for bulk operations
  const allPostsMap = useMemo(() => {
    const map = new Map<string, Post>();
    posts.forEach((p) => map.set(p.id, p));
    series.forEach((s) =>
      s.posts.forEach((p) =>
        map.set(p.id, p)
      )
    );
    return map;
  }, [posts, series]);

  const handleBulkDelete = useCallback(async () => {
    const count = selection.selectedIds.size;
    if (count === 0) return;
    const alertPayload = {
      title: "Delete Selected",
      content: `Delete ${count} item${
        count !== 1 ? "s" : ""
      }? This cannot be undone.`,
      actions: [
        { label: "Cancel", id: uuid() },
        { label: "Delete", id: uuid() },
      ],
    };
    const response = await dispatch(actions.alert(alertPayload));
    if (response.payload === alertPayload.actions[1].id) {
      for (const id of selection.selectedIds) {
        if (seriesIdSet.has(id)) {
          await dispatch(actions.deleteSeries(id));
        } else {
          const post = allPostsMap.get(id);
          if (post) {
            await dispatch(actions.deletePost(post.id));
          }
        }
      }
      selection.clearAll();
      router.refresh();
    }
  }, [dispatch, router, selection, seriesIdSet, allPostsMap]);

  // ── Merge into tabbed post ────────────────────────────────────────────────
  // Selected posts (excluding series headers) in list order. The first becomes
  // the container; the rest are merged in as tabs.
  const selectedMergeablePosts = useMemo(() => {
    return allVisibleIds
      .filter((id) =>
        selection.selectedIds.has(id) && !seriesIdSet.has(id) &&
        allPostsMap.has(id)
      )
      .map((id) => allPostsMap.get(id)!)
      .filter((p): p is Post => !!p);
  }, [allVisibleIds, selection.selectedIds, seriesIdSet, allPostsMap]);

  // Merging needs at least two posts, none of them a series.
  const canMerge = selectedMergeablePosts.length >= 2 &&
    selectedMergeablePosts.length === selection.selectedIds.size;

  const handleBulkMerge = useCallback(async () => {
    if (!canMerge) return;
    const [target, ...sources] = selectedMergeablePosts;
    const targetName = target.name || "this post";
    const alertPayload = {
      title: "Merge into tabs",
      content: `Merge ${
        sources.length + 1
      } posts into "${targetName}"? The other ${sources.length} post${
        sources.length !== 1 ? "s" : ""
      } will be moved into tabs and permanently deleted. This cannot be undone.`,
      actions: [
        { label: "Cancel", id: uuid() },
        { label: "Merge", id: uuid() },
      ],
    };
    const response = await dispatch(actions.alert(alertPayload));
    if (response.payload !== alertPayload.actions[1].id) return;

    await dispatch(
      actions.mergePostsIntoTabs({
        targetId: target.id,
        sourceIds: sources.map((p) => p.id),
      }),
    );
    selection.clearAll();
    router.refresh();
  }, [canMerge, selectedMergeablePosts, dispatch, selection, router]);

  // ── Bulk move to series ───────────────────────────────────────────────────
  // Non-series selected posts. Series membership is cloud-only, so move is
  // disabled when any local-only post is in the selection (same rule as merge).
  const selectedMovablePosts = useMemo(() => {
    return Array.from(selection.selectedIds)
      .filter((id) => !seriesIdSet.has(id) && allPostsMap.has(id))
      .map((id) => allPostsMap.get(id)!);
  }, [selection.selectedIds, seriesIdSet, allPostsMap]);

  const canMove = selectedMovablePosts.length > 0;

  const handleBulkMove = useCallback(
    async (seriesId: string | null) => {
      if (selectedMovablePosts.length === 0) return;
      for (const post of selectedMovablePosts) {
        await dispatch(
          actions.movePost({
            id: post.id,
            destination: seriesId ? { seriesId } : {},
          }),
        );
      }
      selection.clearAll();
      router.refresh();
    },
    [selectedMovablePosts, dispatch, selection, router],
  );

  // ── Drag and drop ─────────────────────────────────────────────────────────
  // Drag-to-reorder: the id of the row currently being dragged, and the drop
  // target (a root row + which side) used to draw the insertion indicator.
  const draggedIdRef = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<
    { id: string; position: "before" | "after" } | null
  >(null);

  const handleDragStart = useCallback((e: React.DragEvent, postId: string) => {
    const post = allPostsMap.get(postId);
    const name = post?.name || "";
    draggedIdRef.current = postId;
    e.dataTransfer.setData(
      "application/matheditor-document",
      JSON.stringify({ id: postId, name, type: "post" }),
    );
    e.dataTransfer.effectAllowed = "move";
  }, [allPostsMap]);

  const handleDragEnd = useCallback(() => {
    setDragOverSeriesId(null);
    setDropTarget(null);
    draggedIdRef.current = null;
  }, []);

  const handleReorderDragOver = useCallback(
    (targetId: string, position: "before" | "after") => {
      if (draggedIdRef.current && draggedIdRef.current !== targetId) {
        setDropTarget({ id: targetId, position });
      }
    },
    [],
  );

  // Drop a dragged post at a root position (before/after the target row).
  // Reorders within, or moves out of a series into, the interleaved root list.
  const handleReorderDrop = useCallback(
    async (targetId: string, position: "before" | "after") => {
      const draggedId = draggedIdRef.current;
      setDropTarget(null);
      if (!draggedId || draggedId === targetId) return;

      const list = rootItems.filter((it) => it.id !== draggedId);
      const ti = list.findIndex((it) => it.id === targetId);
      if (ti === -1) return;
      const rankAt = (i: number) =>
        i >= 0 && i < list.length ? list[i].rank : null;
      const afterRank = position === "before" ? rankAt(ti - 1) : rankAt(ti);
      const beforeRank = position === "before" ? rankAt(ti) : rankAt(ti + 1);

      await dispatch(
        actions.movePost({
          id: draggedId,
          destination: {},
          between: { afterRank, beforeRank },
        }),
      );
      router.refresh();
    },
    [rootItems, dispatch, router],
  );

  const handleDropPost = useCallback(
    async (seriesId: string, postId: string) => {
      // movePost sets seriesId *and* a fresh rank in the destination series,
      // so the post no longer keeps a rank from its previous container.
      await dispatch(
        actions.movePost({ id: postId, destination: { seriesId } }),
      );
      router.refresh();
    },
    [dispatch, router],
  );

  const handleMoveToSeries = useCallback(
    async (postId: string, seriesId: string) => {
      // movePost sets seriesId *and* a fresh rank in the destination.
      await dispatch(
        actions.movePost({ id: postId, destination: { seriesId } }),
      );
      router.refresh();
    },
    [dispatch, router],
  );

  // ── Manual reorder (menu / keyboard) ──────────────────────────────────────
  // Reposition a post among its siblings within its own container (a series or
  // a tab-group). `siblings` is the rendered, rank-ordered list.
  const handleReorderPost = useCallback(
    async (
      siblings: Post[],
      postId: string,
      direction: ReorderDirection,
    ) => {
      const i = siblings.findIndex((p) => p.id === postId);
      if (i === -1) return;
      const between = ranksBracketing(siblings.map(rankOf), i, direction);
      if (!between) return;

      // Keep the post in its current container; only its position changes.
      const doc = siblings[i];
      const destination = doc?.seriesId
        ? { seriesId: doc.seriesId }
        : doc?.parentId
        ? { parentId: doc.parentId }
        : {};

      await dispatch(
        actions.movePost({ id: postId, destination, between }),
      );
      router.refresh();
    },
    [dispatch, router],
  );

  // Reposition a root-level item (a standalone post or a whole series) within
  // the interleaved root list. Posts move via movePost, series via
  // moveSeries — both re-rank in the shared root space.
  const handleReorderRoot = useCallback(
    async (index: number, direction: ReorderDirection) => {
      const between = ranksBracketing(
        rootItems.map((r) => r.rank),
        index,
        direction,
      );
      if (!between) return;
      const item = rootItems[index];
      if (item.kind === "post") {
        await dispatch(
          actions.movePost({ id: item.id, destination: {}, between }),
        );
      } else {
        await dispatch(actions.moveSeries({ id: item.id, between }));
      }
      router.refresh();
    },
    [rootItems, dispatch, router],
  );

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInputFocused = tag === "INPUT" || tag === "TEXTAREA";

      if (e.key === "Escape") {
        selection.clearAll();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !isInputFocused) {
        if (selection.selectedIds.size > 0) {
          e.preventDefault();
          handleBulkDelete();
        }
        return;
      }
      if (
        (e.key === "a" || e.key === "A") && (e.metaKey || e.ctrlKey) &&
        !isInputFocused
      ) {
        e.preventDefault();
        selection.selectAll();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selection.selectedIds.size,
    selection.clearAll,
    selection.selectAll,
    handleBulkDelete,
  ]);

  const hasSeries = series.length > 0;

  return (
    <Box sx={{ width: "100%", position: "relative" }}>
      {/* Unified root list: standalone posts and series interleaved by rank. */}
      <Box sx={{ mb: 1 }}>
        {rootItems.map((item, i) =>
          item.kind === "post"
            ? (
              <PostRow
                key={item.id}
                post={item.post}
                density={density}
                isSelected={selection.isSelected(item.id)}
                rename={postRename}
                onToggleSelect={selection.toggle}
                onDelete={handleDeletePost}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onReorder={(direction) => handleReorderRoot(i, direction)}
                canMoveUp={i > 0}
                canMoveDown={i < rootItems.length - 1}
                onReorderDragOver={handleReorderDragOver}
                onReorderDrop={handleReorderDrop}
                dropIndicator={dropTarget?.id === item.id
                  ? dropTarget.position
                  : null}
                availableSeries={hasSeries ? series : undefined}
                onMoveToSeries={hasSeries
                  ? (seriesId) => handleMoveToSeries(item.id, seriesId)
                  : undefined}
              />
            )
            : (
              <SeriesRow
                key={item.id}
                series={item.series}
                posts={seriesPostsById.get(item.id) ?? []}
                onReorderPost={handleReorderPost}
                onReorder={(direction) => handleReorderRoot(i, direction)}
                canMoveUp={i > 0}
                canMoveDown={i < rootItems.length - 1}
                density={density}
                isSelected={selection.isSelected(item.id)}
                isPostSelected={selection.isSelected}
                isExpanded={expandedSeries.has(item.id)}
                onToggleExpand={toggleSeries}
                onToggleSelect={selection.toggle}
                seriesRename={seriesRename}
                postRename={postRename}
                onDeleteSeries={handleDeleteSeries}
                onDeletePost={handleDeletePost}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDropPost={handleDropPost}
                dragOverSeriesId={dragOverSeriesId}
                onDragOverSeries={setDragOverSeriesId}
                availableSeries={series.filter((other) => other.id !== item.id)}
                onMovePost={handleMoveToSeries}
              />
            )
        )}
      </Box>

      {/* Bulk action bar */}
      <BulkActionBar
        count={selection.selectedIds.size}
        onDelete={handleBulkDelete}
        onClear={selection.clearAll}
        onMerge={handleBulkMerge}
        canMerge={canMerge}
        availableSeries={moveTargetSeries ?? series}
        onMove={handleBulkMove}
        canMove={canMove}
      />
    </Box>
  );
}
