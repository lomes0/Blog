"use client";
import React, { useCallback, useEffect, useMemo } from "react";
import { Box } from "@mui/material";
import { Post, type PostContainer, Series } from "@/types";
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
import { containerFromPost, type TreeNode } from "@/lib/tree/model";
import { useTreeDnd } from "@/lib/tree/useTreeDnd";
import { ListDensity } from "./types";
import { PostRow } from "./components/PostRow";
import { SeriesRow } from "./components/SeriesRow";
import { BulkActionBar } from "./components/BulkActionBar";
import { useRowSelection } from "@/hooks/useRowSelection";
import { useInlineRename } from "@/hooks/useInlineRename";
import { useBulkPostActions } from "@/hooks/useBulkPostActions";
import { useConfirm } from "@/hooks/useConfirm";

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
  /**
   * The container whose contents the root list is rendering. Defaults to the
   * author's root list. In series mode the rows are a *series'* posts, so this
   * must name that series — `movePost`'s destination fully specifies the
   * container, so reordering with the default would silently detach every row
   * from its series.
   */
  rootContainer?: PostContainer;
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
  rootContainer = {},
  density,
}: PostsListViewProps) {
  const dispatch = useDispatch();
  const router = useRouter();
  const confirm = useConfirm();

  // Pinned to the two ids rather than the prop's identity: callers pass this
  // inline, and the reorder handlers below are React.memo'd row props — a fresh
  // object each render would re-create them and re-render every row mid-drag.
  const container = useMemo<PostContainer>(
    () => ({
      seriesId: rootContainer.seriesId ?? null,
      parentId: rootContainer.parentId ?? null,
    }),
    [rootContainer.seriesId, rootContainer.parentId],
  );

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

  const selection = useRowSelection(allVisibleIds, "toggle");

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
    const confirmed = await confirm({
      title: "Delete Post",
      content: `Delete "${name}"? This cannot be undone.`,
      confirmLabel: "Delete",
    });
    if (!confirmed) return;
    await dispatch(actions.deletePost(post.id));
    router.refresh();
  }, [confirm, dispatch, router]);

  const handleDeleteSeries = useCallback(
    async (seriesId: string, seriesTitle: string) => {
      const confirmed = await confirm({
        title: "Delete Series",
        content: `Delete "${seriesTitle}"? Posts will not be deleted.`,
        confirmLabel: "Delete",
      });
      if (!confirmed) return;
      await dispatch(actions.deleteSeries(seriesId));
      router.refresh();
    },
    [confirm, dispatch, router],
  );

  // ── Bulk actions ──────────────────────────────────────────────────────────
  // Delete / move-to-series / merge-into-tabs, shared with the sidebar's
  // right-click bulk menu. Only the chrome differs here: a persistent bar.
  // `renameablePosts` is already every post a row can name — the standalone rows
  // plus each series' children — which is exactly what a selected id can resolve
  // to. `projects` is left off: this surface has no project rows.
  const bulk = useBulkPostActions({
    selectedIds: selection.selectedIds,
    orderedIds: allVisibleIds,
    clearSelection: selection.clear,
    posts: renameablePosts,
    series,
  });
  const { handleBulkDelete } = bulk;

  // ── Drag and drop ─────────────────────────────────────────────────────────
  // The rendered tree, as the shared engine indexes it: the root list, with each
  // series carrying its *full* rank-ordered post list (not the truncated preview
  // `SeriesRow` shows past 20), since that list is the source of the sibling
  // ranks that bracket a drop.
  const treeNodes = useMemo(
    (): TreeNode[] =>
      rootItems.map((item) =>
        item.kind === "post"
          ? {
            kind: "post" as const,
            id: item.id,
            rank: item.rank,
            label: item.post.name,
          }
          : {
            kind: "series" as const,
            id: item.id,
            rank: item.rank,
            label: item.series.title,
            children: (seriesPostsById.get(item.id) ?? []).map((p) => ({
              kind: "post" as const,
              id: p.id,
              rank: rankOf(p),
              label: p.name,
            })),
          }
      ),
    [rootItems, seriesPostsById],
  );

  // Which container the top-level rows are in — the author's root list, or the
  // one series whose contents this list is rendering (`/posts/[seriesId]`).
  const dndRoot = useMemo(() => containerFromPost(container), [container]);

  // Depend on `selectedIds` rather than the whole `selection` object, which is a
  // fresh literal each render — the rows below are memoized, so a churning
  // handler identity would re-render every one of them on every render.
  const { selectedIds } = selection;
  // Grabbing a row that is part of the multi-selection drags the whole selection
  // (render order, so the block keeps its relative order at the destination);
  // otherwise just the grabbed row.
  const getDragSet = useCallback(
    (primaryId: string): string[] =>
      selectedIds.has(primaryId) && selectedIds.size > 1
        ? allVisibleIds.filter((id) => selectedIds.has(id))
        : [primaryId],
    [allVisibleIds, selectedIds],
  );

  // `rendersProjects` is left off: this surface has no project rows, so a series
  // reordered here must not assert (and thereby clear) its project membership.
  const dnd = useTreeDnd(treeNodes, { root: dndRoot, getDragSet });

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
          actions.movePost({ id: item.id, destination: container, between }),
        );
      } else {
        await dispatch(actions.moveSeries({ id: item.id, between }));
      }
      router.refresh();
    },
    [rootItems, dispatch, router, container],
  );

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInputFocused = tag === "INPUT" || tag === "TEXTAREA";

      if (e.key === "Escape") {
        selection.clear();
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
    selection.clear,
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
                onToggleSelect={selection.handleSelectClick}
                onDelete={handleDeletePost}
                onDragStart={dnd.onPostDragStart}
                onDragEnd={dnd.onDragEnd}
                onReorder={(direction) => handleReorderRoot(i, direction)}
                canMoveUp={i > 0}
                canMoveDown={i < rootItems.length - 1}
                onReorderDragOver={dnd.onReorderDragOver}
                onReorderDrop={dnd.onReorderDrop}
                dropIndicator={dnd.dropTarget?.id === item.id
                  ? dnd.dropTarget.position
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
                onToggleSelect={selection.handleSelectClick}
                seriesRename={seriesRename}
                postRename={postRename}
                onDeleteSeries={handleDeleteSeries}
                onDeletePost={handleDeletePost}
                onPostDragStart={dnd.onPostDragStart}
                onSeriesDragStart={dnd.onSeriesDragStart}
                onDragEnd={dnd.onDragEnd}
                onReorderDragOver={dnd.onReorderDragOver}
                onReorderDrop={dnd.onReorderDrop}
                onDragLeaveRow={dnd.onDragLeaveRow}
                isDragOver={dnd.dragOverSeriesId === item.id}
                dropIndicator={dnd.dropTarget?.id === item.id
                  ? dnd.dropTarget.position
                  : null}
                availableSeries={series.filter((other) => other.id !== item.id)}
                onMovePost={handleMoveToSeries}
              />
            )
        )}
      </Box>

      {/* Bulk action bar */}
      <BulkActionBar
        count={bulk.selectedCount}
        onDelete={bulk.handleBulkDelete}
        onClear={selection.clear}
        onMerge={bulk.handleBulkMerge}
        canMerge={bulk.canMerge}
        availableSeries={moveTargetSeries ?? series}
        onMove={bulk.handleBulkMove}
        canMove={bulk.canMove}
      />
    </Box>
  );
}
