"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box } from "@mui/material";
import { v4 as uuid } from "uuid";
import { Series, User, UserDocument } from "@/types";
import { actions, useDispatch } from "@/store";
import { useRouter } from "next/navigation";
import { useExpandedState } from "@/hooks/useExpandedState";
import { compareDocumentsByRank, rankOf } from "@/lib/documentOrder";
import { ListDensity, TagStyle } from "./types";
import { SectionBand } from "./components/SectionBand";
import { PostRow } from "./components/PostRow";
import { SeriesRow } from "./components/SeriesRow";
import { BulkActionBar } from "./components/BulkActionBar";
import { useListSelection } from "./hooks/useListSelection";
import { useInlineRename } from "./hooks/useInlineRename";

interface PostsListViewProps {
  /** Standalone posts (not in any series). */
  posts: UserDocument[];
  /** All series with their posts. */
  series: Series[];
  /**
   * Series offered as bulk-move destinations. Defaults to `series`. In series
   * mode `series` is empty (no Series section), so this supplies the *other*
   * series to move posts into.
   */
  moveTargetSeries?: Series[];
  user?: User;
  density: ListDensity;
  tagStyle: TagStyle;
}

export function PostsListView({
  posts,
  series,
  moveTargetSeries,
  user: _user,
  density,
  tagStyle,
}: PostsListViewProps) {
  const dispatch = useDispatch();
  const router = useRouter();
  const [dragOverSeriesId, setDragOverSeriesId] = useState<string | null>(null);

  const { expandedSeries, toggleSeries } = useExpandedState(
    "postsListExpansion",
  );
  // Independent persisted expansion state for each post's tab list.
  const {
    expandedSeries: expandedTabs,
    toggleSeries: toggleTabs,
  } = useExpandedState("postsListTabsExpansion");

  // Flat ordered list of all visible IDs for range selection
  const allVisibleIds = useMemo(() => {
    const ids: string[] = posts.map((p) => p.id);
    series.forEach((s) => {
      ids.push(s.id);
      if (expandedSeries.has(s.id)) {
        s.posts.forEach((p) => ids.push(p.id));
      }
    });
    return ids;
  }, [posts, series, expandedSeries]);

  const selection = useListSelection({ allIds: allVisibleIds });
  const postRename = useInlineRename();

  // Series rename state — uses updateSeries (different from updateCloudDocument)
  const [editingSeriesNames, setEditingSeriesNames] = useState<
    Map<string, string>
  >(new Map());

  const handleSeriesRenameStart = useCallback(
    (seriesId: string, currentName: string) => {
      setEditingSeriesNames((prev) => new Map(prev).set(seriesId, currentName));
    },
    [],
  );

  const handleSeriesRenameChange = useCallback(
    (seriesId: string, value: string) => {
      setEditingSeriesNames((prev) => new Map(prev).set(seriesId, value));
    },
    [],
  );

  const handleSeriesRenameCommit = useCallback(async (seriesId: string) => {
    const newTitle = editingSeriesNames.get(seriesId)?.trim();
    setEditingSeriesNames((prev) => {
      const m = new Map(prev);
      m.delete(seriesId);
      return m;
    });
    if (!newTitle) return;
    const s = series.find((s_) => s_.id === seriesId);
    if (!s || newTitle === s.title) return;
    await dispatch(
      actions.updateSeries({ id: seriesId, data: { title: newTitle } }),
    );
    router.refresh();
  }, [dispatch, router, series, editingSeriesNames]);

  const handleSeriesRenameCancel = useCallback((seriesId: string) => {
    setEditingSeriesNames((prev) => {
      const m = new Map(prev);
      m.delete(seriesId);
      return m;
    });
  }, []);

  // ── Delete handlers ───────────────────────────────────────────────────────
  const handleDeletePost = useCallback(async (post: UserDocument) => {
    const name = post.cloud?.name || post.local?.name || "This post";
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
      if (post.cloud) await dispatch(actions.deleteCloudDocument(post.id));
      if (post.local) await dispatch(actions.deleteLocalDocument(post.id));
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
    const map = new Map<string, UserDocument>();
    posts.forEach((p) => map.set(p.id, p));
    series.forEach((s) =>
      s.posts.forEach((p) =>
        map.set(p.id, { id: p.id, cloud: p, local: undefined })
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
            if (post.cloud) {
              await dispatch(actions.deleteCloudDocument(post.id));
            }
            if (post.local) {
              await dispatch(actions.deleteLocalDocument(post.id));
            }
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
      .filter((p): p is UserDocument => !!p);
  }, [allVisibleIds, selection.selectedIds, seriesIdSet, allPostsMap]);

  // Merge is cloud-only and needs at least two posts, none of them a series.
  const canMerge = selectedMergeablePosts.length >= 2 &&
    selectedMergeablePosts.length === selection.selectedIds.size &&
    selectedMergeablePosts.every((p) => !!p.cloud);

  const handleBulkMerge = useCallback(async () => {
    if (!canMerge) return;
    const [target, ...sources] = selectedMergeablePosts;
    const targetName = target.cloud?.name || target.local?.name || "this post";
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
      actions.mergeCloudDocumentsIntoTabs({
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

  const canMove = selectedMovablePosts.length > 0 &&
    selectedMovablePosts.every((p) => !!p.cloud);

  const handleBulkMove = useCallback(
    async (seriesId: string | null) => {
      if (selectedMovablePosts.length === 0) return;
      for (const post of selectedMovablePosts) {
        if (!post.cloud) continue;
        await dispatch(
          actions.updateCloudDocument({ id: post.id, partial: { seriesId } }),
        );
      }
      selection.clearAll();
      router.refresh();
    },
    [selectedMovablePosts, dispatch, selection, router],
  );

  // ── Drag and drop ─────────────────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, postId: string) => {
    const post = allPostsMap.get(postId);
    const name = post?.cloud?.name || post?.local?.name || "";
    e.dataTransfer.setData(
      "application/matheditor-document",
      JSON.stringify({ id: postId, name, type: "post" }),
    );
    e.dataTransfer.effectAllowed = "move";
  }, [allPostsMap]);

  const handleDragEnd = useCallback(() => {
    setDragOverSeriesId(null);
  }, []);

  const handleDropPost = useCallback(
    async (seriesId: string, postId: string) => {
      // moveDocument sets seriesId *and* a fresh rank in the destination series,
      // so the post no longer keeps a rank from its previous container.
      await dispatch(
        actions.moveDocument({ id: postId, destination: { seriesId } }),
      );
      router.refresh();
    },
    [dispatch, router],
  );

  const handleMoveToSeries = useCallback(
    async (postId: string, seriesId: string) => {
      // moveDocument sets seriesId *and* a fresh rank in the destination.
      await dispatch(
        actions.moveDocument({ id: postId, destination: { seriesId } }),
      );
      router.refresh();
    },
    [dispatch, router],
  );

  // ── Manual reorder (menu / keyboard) ──────────────────────────────────────
  // Reposition a post among its siblings by computing the ranks of the
  // neighbours that should bracket its new slot, then re-ranking it there.
  // `siblings` is the rendered, rank-ordered list the post belongs to.
  const handleReorderPost = useCallback(
    async (
      siblings: UserDocument[],
      postId: string,
      direction: "up" | "down" | "top" | "bottom",
    ) => {
      const i = siblings.findIndex((p) => p.id === postId);
      if (i === -1) return;
      const last = siblings.length - 1;
      const rankAt = (idx: number) =>
        idx >= 0 && idx <= last ? rankOf(siblings[idx]) : null;

      let afterRank: string | null = null;
      let beforeRank: string | null = null;
      switch (direction) {
        case "up":
          if (i === 0) return;
          afterRank = rankAt(i - 2);
          beforeRank = rankAt(i - 1);
          break;
        case "down":
          if (i === last) return;
          afterRank = rankAt(i + 1);
          beforeRank = rankAt(i + 2);
          break;
        case "top":
          if (i === 0) return;
          beforeRank = rankAt(0);
          break;
        case "bottom":
          if (i === last) return;
          afterRank = rankAt(last);
          break;
      }

      // Keep the post in its current container; only its position changes.
      const doc = siblings[i].cloud ?? siblings[i].local;
      const destination = doc?.seriesId
        ? { seriesId: doc.seriesId }
        : doc?.parentId
        ? { parentId: doc.parentId }
        : {};

      await dispatch(
        actions.moveDocument({
          id: postId,
          destination,
          between: { afterRank, beforeRank },
        }),
      );
      router.refresh();
    },
    [dispatch, router],
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

  const hasPosts = posts.length > 0;
  const hasSeries = series.length > 0;

  return (
    <Box sx={{ width: "100%", position: "relative" }}>
      {/* Posts section */}
      {hasPosts && (
        <Box sx={{ mb: 1 }}>
          <SectionBand
            label="Posts"
            count={posts.length}
            color="primary.main"
          />
          {posts.map((post, i) => (
            <PostRow
              key={post.id}
              post={post}
              density={density}
              tagStyle={tagStyle}
              isSelected={selection.isSelected(post.id)}
              editingName={postRename.editingNames.get(post.id)}
              expandedTabs={expandedTabs}
              onToggleTabs={toggleTabs}
              onToggleSelect={selection.toggle}
              onRenameStart={postRename.startRename}
              onRenameChange={postRename.handleChange}
              onRenameCommit={postRename.handleCommit}
              onRenameCancel={postRename.handleCancel}
              onDelete={handleDeletePost}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onReorder={(direction) =>
                handleReorderPost(posts, post.id, direction)}
              canMoveUp={i > 0}
              canMoveDown={i < posts.length - 1}
              availableSeries={hasSeries ? series : undefined}
              onMoveToSeries={hasSeries
                ? (seriesId) => handleMoveToSeries(post.id, seriesId)
                : undefined}
            />
          ))}
        </Box>
      )}

      {/* Series section */}
      {hasSeries && (
        <Box sx={{ mb: 1 }}>
          <SectionBand
            label="Series"
            count={series.length}
            color="primary.main"
          />
          {series.map((s) => {
            // Sort by rank so manual reordering is reflected reactively (the
            // server returns rank order, but in-place updates don't re-sort).
            const seriesPosts: UserDocument[] = s.posts
              .map((p) => ({ id: p.id, cloud: p, local: undefined }))
              .sort(compareDocumentsByRank);
            return (
              <SeriesRow
                key={s.id}
                series={s}
                posts={seriesPosts}
                onReorderPost={handleReorderPost}
                density={density}
                tagStyle={tagStyle}
                isSelected={selection.isSelected(s.id)}
                isExpanded={expandedSeries.has(s.id)}
                onToggleExpand={toggleSeries}
                expandedTabs={expandedTabs}
                onToggleTabs={toggleTabs}
                onToggleSelect={selection.toggle}
                editingSeriesName={editingSeriesNames.get(s.id)}
                onSeriesRenameStart={handleSeriesRenameStart}
                onSeriesRenameChange={handleSeriesRenameChange}
                onSeriesRenameCommit={handleSeriesRenameCommit}
                onSeriesRenameCancel={handleSeriesRenameCancel}
                editingPostNames={postRename.editingNames}
                onPostRenameStart={postRename.startRename}
                onPostRenameChange={postRename.handleChange}
                onPostRenameCommit={postRename.handleCommit}
                onPostRenameCancel={postRename.handleCancel}
                onDeleteSeries={handleDeleteSeries}
                onDeletePost={handleDeletePost}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDropPost={handleDropPost}
                dragOverSeriesId={dragOverSeriesId}
                onDragOverSeries={setDragOverSeriesId}
                availableSeries={series.filter((other) => other.id !== s.id)}
                onMovePost={handleMoveToSeries}
              />
            );
          })}
        </Box>
      )}

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
