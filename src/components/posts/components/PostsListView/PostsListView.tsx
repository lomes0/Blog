"use client";
import React, { useCallback, useEffect, useMemo } from "react";
import { Box } from "@mui/material";
import { Post, type PostContainer, Project, Series } from "@/types";
import { actions, useDispatch } from "@/store";
import { useRouter } from "next/navigation";
import { useExpandedState } from "@/hooks/useExpandedState";
import {
  applySubsetOrder,
  moveByDirection,
  type ReorderDirection,
} from "@/lib/orderMove";
import { containerFromPost, type TreeContainer } from "@/lib/tree/model";
import {
  groupRootItems,
  partitionRootItems,
  type RootItem,
  rootItemId,
  rootItemsToTreeNodes,
  type SeriesGroupItem,
} from "@/utils/posts/seriesGrouping";
import { useTreeDnd } from "@/lib/tree/useTreeDnd";
import { ListDensity } from "./types";
import { PostRow } from "./components/PostRow";
import { ProjectRow } from "./components/ProjectRow";
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
   * The author's projects, so a project renders as a row containing its series
   * — `docs/plans/archive/tree-model-brief.md` §0, answered yes on 27 Aug 2026.
   * Empty or omitted keeps the flat list this surface used to be, which is what
   * series mode and a signed-out reader get: `capabilities().projects` is
   * signed-in only, and a project row nobody can act on is chrome pretending to
   * be a feature.
   */
  projects?: Project[];
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
  /**
   * The order array of the container the top-level rows live in — the author's
   * `rootOrder`, or a series' `postOrder` in series mode
   * (docs/plans/archive/ordering-simplification.md §2). Pairs with
   * `rootContainer`: they name the same container, one for reads and one for
   * writes.
   */
  rootOrder?: readonly string[];
  density: ListDensity;
}

/**
 * The one post a standalone group wraps.
 *
 * `SeriesGroupItem` models a loose post as a one-element `posts` array, which is
 * the encoding the sidebar's tree uses and which this surface now shares. The
 * accessor is here so no render site has to know that.
 */
const lonePost = (group: SeriesGroupItem): Post | undefined => group.posts[0];

export function PostsListView({
  posts,
  series,
  projects,
  moveTargetSeries,
  rootContainer = {},
  rootOrder = [],
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
  // Projects keep their own expansion key, so collapsing a drawer does not
  // collapse the series inside it and lose the user's place twice over.
  const { expandedSeries: expandedProjects, toggleSeries: toggleProject } =
    useExpandedState("postsListProjectExpansion");

  // Each series by id, which is the shape `groupRootItems` takes. `series.posts`
  // is authoritative and the grouping sorts it, so nothing needs pre-sorting
  // here any more.
  const seriesMap = useMemo(
    () => new Map(series.map((s) => [s.id, s])),
    [series],
  );

  /**
   * The root list, built by the **same** function the sidebar builds it with.
   *
   * This was two implementations of one tree until 27 Aug 2026 — a nested one
   * here and a flat `{kind, id}` union there — which is what
   * `docs/plans/bloat-remediation.md` step 7 existed to collapse. The order
   * comes from one array shared by projects, ungrouped series and standalone
   * posts, so the result must stay in that order: don't group or re-sort it for
   * presentation.
   */
  const rootItems = useMemo(
    () => groupRootItems(posts, seriesMap, projects ?? [], rootOrder),
    [posts, seriesMap, projects, rootOrder],
  );

  // Split the ordered root list into the two rendered sections — standalone
  // posts above, projects and ungrouped series below — matching the sidebar,
  // which renders the same tree as "Notes" then "Projects". The order space
  // stays shared (so a drag between the sections is still a single well-ordered
  // move); each section is just an ordered subset of it.
  const { noteItems: postItems, groupItems } = useMemo(
    () => partitionRootItems(rootItems),
    [rootItems],
  );

  // Flat ordered list of all visible IDs for range selection, in *visual* order
  // (posts section, then the groups section with each expanded container's
  // contents) — it drives Shift-range and Select-All, so it must match what the
  // user sees, including a project's series and those series' posts.
  const allVisibleIds = useMemo(() => {
    const ids: string[] = [];
    const pushSeriesGroup = (group: SeriesGroupItem) => {
      if (group.type !== "series" || !group.series) {
        const post = lonePost(group);
        if (post) ids.push(post.id);
        return;
      }
      ids.push(group.series.id);
      if (expandedSeries.has(group.series.id)) {
        group.posts.forEach((p) => ids.push(p.id));
      }
    };

    for (const item of postItems) pushSeriesGroup(item);
    for (const item of groupItems) {
      if (item.type === "project") {
        ids.push(item.project.id);
        if (expandedProjects.has(item.project.id)) {
          item.children.forEach(pushSeriesGroup);
        }
        continue;
      }
      pushSeriesGroup(item);
    }
    return ids;
  }, [postItems, groupItems, expandedSeries, expandedProjects]);

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
    getTitle: (post) => post.title || "Untitled",
    getStoredTitle: (post) => post.title || "",
    onCommit: (post, title) => {
      dispatch(actions.updatePost({ id: post.id, partial: { title } }));
      router.refresh();
    },
    initialContext: undefined,
  });

  // Project rename is the third instance of the same machine. `updateProject`
  // takes `{ id, data }` rather than `{ id, partial }`, which is the only
  // difference between this and the series one.
  const projectRename = useInlineRename<Project, undefined>({
    items: projects ?? [],
    getId: (p) => p.id,
    getTitle: (p) => p.title,
    onCommit: (p, title) => {
      dispatch(actions.updateProject({ id: p.id, data: { title } }));
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
    const name = post.title || "This post";
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

  const handleDeleteProject = useCallback(
    async (projectId: string, title: string) => {
      const confirmed = await confirm({
        title: "Delete Project",
        content:
          `Delete "${title}"? Its series and posts will not be deleted — they ` +
          `return to the root list.`,
        confirmLabel: "Delete",
      });
      if (!confirmed) return;
      await dispatch(actions.deleteProject(projectId));
      router.refresh();
    },
    [confirm, dispatch, router],
  );

  // ── Bulk actions ──────────────────────────────────────────────────────────
  // Delete / move-to-series / merge-into-tabs, shared with the sidebar's
  // right-click bulk menu. Only the chrome differs here: a persistent bar.
  // `renameablePosts` is already every post a row can name — the standalone rows
  // plus each series' children — which is exactly what a selected id can resolve
  // to. `projects` goes with them now that a project row can be selected: a
  // selected id that resolves to nothing is a bulk delete that silently skips
  // it.
  const bulk = useBulkPostActions({
    selectedIds: selection.selectedIds,
    orderedIds: allVisibleIds,
    clearSelection: selection.clear,
    posts: renameablePosts,
    series,
    projects,
  });
  const { handleBulkDelete } = bulk;

  // ── Drag and drop ─────────────────────────────────────────────────────────
  // The rendered tree, as the shared engine indexes it: the root list, with
  // each series carrying its *full* ordered post list (not the truncated
  // preview `SeriesRow` shows past 20), since a drop rewrites that whole list
  // and a truncated one would persist the truncation.
  const treeNodes = useMemo(
    () => rootItemsToTreeNodes(rootItems),
    [rootItems],
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

  // `rendersProjects` follows the prop rather than being hard-coded either way.
  // It is what tells the engine that a series reordered here knows which project
  // it is in — asserting that from a surface with no project rows would clear
  // the membership of every series dragged on it, which is exactly why this used
  // to be off.
  const rendersProjects = (projects?.length ?? 0) > 0;
  const dnd = useTreeDnd(treeNodes, {
    root: dndRoot,
    getDragSet,
    rendersProjects,
  });

  const handleMoveToSeries = useCallback(
    async (postId: string, seriesId: string) => {
      // movePost sets seriesId *and* appends the id to the destination's
      // order array (docs/plans/archive/ordering-simplification.md §4).
      await dispatch(
        actions.movePost({ id: postId, destination: { seriesId } }),
      );
      router.refresh();
    },
    [dispatch, router],
  );

  // ── Manual reorder (menu / keyboard) ──────────────────────────────────────
  // One shape for all three: take the ids the surface is rendering, move one of
  // them, and write the container's array
  // (docs/plans/archive/ordering-simplification.md §4). No container changes,
  // so no move — a reorder is now only an order write.
  const reorder = useCallback(
    async (container: TreeContainer, orderedIds: string[]) => {
      await dispatch(actions.setOrder({ container, orderedIds }));
      router.refresh();
    },
    [dispatch, router],
  );

  // Reposition a post among its siblings within its own container (a series or
  // a tab-group). `siblings` is the rendered list.
  const handleReorderPost = useCallback(
    async (
      siblings: Post[],
      postId: string,
      direction: ReorderDirection,
    ) => {
      const doc = siblings.find((p) => p.id === postId);
      if (!doc) return;
      const next = moveByDirection(
        siblings.map((p) => p.id),
        postId,
        direction,
      );
      if (!next) return;
      await reorder(containerFromPost(doc), next);
    },
    [reorder],
  );

  // Reposition a root-level item within its own rendered *section* — the posts
  // list or the projects/series list, each an ordered subset of the one root
  // array. The section is reordered and then written back into the slots it
  // already occupies (`applySubsetOrder`), which is what makes "move down" land
  // where the user watched the row go: the other section's rows sit between
  // them and must not shift.
  const handleReorderRoot = useCallback(
    async (
      section: RootItem[],
      index: number,
      direction: ReorderDirection,
    ) => {
      const id = rootItemId(section[index]);
      const nextSection = moveByDirection(
        section.map(rootItemId),
        id,
        direction,
      );
      if (!nextSection) return;
      await reorder(
        dndRoot,
        applySubsetOrder(rootItems.map(rootItemId), nextSection),
      );
    },
    [reorder, dndRoot, rootItems],
  );

  /**
   * Reposition a series among the members of one project.
   *
   * A separate handler from the root one because it is a different container:
   * a project owns the order of its members in its own `seriesOrder`, and
   * writing that list into the root array instead would take every one of them
   * out of the project as far as any read is concerned.
   */
  const handleReorderProjectSeries = useCallback(
    async (
      projectId: string,
      siblings: SeriesGroupItem[],
      index: number,
      direction: ReorderDirection,
    ) => {
      const seriesId = siblings[index]?.series?.id;
      if (!seriesId) return;
      const next = moveByDirection(
        siblings.map((group) => group.series?.id ?? ""),
        seriesId,
        direction,
      );
      if (!next) return;
      await reorder({ type: "project", projectId }, next);
    },
    [reorder],
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
      {
        /* Standalone posts, above the series — the sidebar's "Notes" section.
          Each section is skipped when empty so it contributes no stray margin
          (series mode renders posts only; a fresh account, series only). */
      }
      {postItems.length > 0 && (
        <Box sx={{ mb: 1 }}>
          {postItems.map((item, i) => {
            const post = lonePost(item);
            if (!post) return null;
            return (
              <PostRow
                key={post.id}
                post={post}
                density={density}
                isSelected={selection.isSelected(post.id)}
                rename={postRename}
                onToggleSelect={selection.handleSelectClick}
                onDelete={handleDeletePost}
                onDragStart={dnd.onPostDragStart}
                onDragEnd={dnd.onDragEnd}
                onReorder={(direction) =>
                  handleReorderRoot(postItems, i, direction)}
                canMoveUp={i > 0}
                canMoveDown={i < postItems.length - 1}
                onReorderDragOver={dnd.onReorderDragOver}
                onReorderDrop={dnd.onReorderDrop}
                dropIndicator={dnd.dropTarget?.id === post.id
                  ? dnd.dropTarget.position
                  : null}
                availableSeries={hasSeries ? series : undefined}
                onMoveToSeries={hasSeries
                  ? (seriesId) => handleMoveToSeries(post.id, seriesId)
                  : undefined}
              />
            );
          })}
        </Box>
      )}

      {
        /* Projects and ungrouped series, below the standalone posts — one
          section ordered by `rootOrder`, so a project and a loose series
          interleave here exactly as they do in the sidebar. */
      }
      {groupItems.length > 0 && (
        <Box sx={{ mb: 1 }}>
          {groupItems.map((item, i) => {
            const reorder = (direction: ReorderDirection) =>
              handleReorderRoot(groupItems, i, direction);
            const canMoveUp = i > 0;
            const canMoveDown = i < groupItems.length - 1;

            if (item.type === "project") {
              return (
                <ProjectRow
                  key={item.project.id}
                  project={item.project}
                  groups={item.children}
                  density={density}
                  isSelected={selection.isSelected(item.project.id)}
                  isRowSelected={selection.isSelected}
                  isExpanded={expandedProjects.has(item.project.id)}
                  onToggleExpand={toggleProject}
                  onToggleSelect={selection.handleSelectClick}
                  projectRename={projectRename}
                  seriesRename={seriesRename}
                  postRename={postRename}
                  onDeleteProject={handleDeleteProject}
                  onDeleteSeries={handleDeleteSeries}
                  onDeletePost={handleDeletePost}
                  expandedSeries={expandedSeries}
                  onToggleSeries={toggleSeries}
                  onPostDragStart={dnd.onPostDragStart}
                  onSeriesDragStart={dnd.onSeriesDragStart}
                  onProjectDragStart={dnd.onProjectDragStart}
                  onDragEnd={dnd.onDragEnd}
                  onReorderDragOver={dnd.onReorderDragOver}
                  onReorderDrop={dnd.onReorderDrop}
                  onDragLeaveRow={dnd.onDragLeaveRow}
                  isDragOver={dnd.dragOverProjectId === item.project.id}
                  dragOverId={dnd.dragOverSeriesId}
                  dropIndicator={dnd.dropTarget?.id === item.project.id
                    ? dnd.dropTarget.position
                    : null}
                  childDropIndicator={(id) =>
                    dnd.dropTarget?.id === id ? dnd.dropTarget.position : null}
                  onReorder={reorder}
                  canMoveUp={canMoveUp}
                  canMoveDown={canMoveDown}
                  onReorderSeries={(siblings, index, direction) =>
                    handleReorderProjectSeries(
                      item.project.id,
                      siblings,
                      index,
                      direction,
                    )}
                  onReorderPost={handleReorderPost}
                  availableSeries={series}
                  onMovePost={handleMoveToSeries}
                />
              );
            }

            const seriesItem = item.series;
            if (!seriesItem) return null;
            return (
              <SeriesRow
                key={seriesItem.id}
                series={seriesItem}
                posts={item.posts}
                onReorderPost={handleReorderPost}
                onReorder={reorder}
                canMoveUp={canMoveUp}
                canMoveDown={canMoveDown}
                density={density}
                isSelected={selection.isSelected(seriesItem.id)}
                isPostSelected={selection.isSelected}
                isExpanded={expandedSeries.has(seriesItem.id)}
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
                isDragOver={dnd.dragOverSeriesId === seriesItem.id}
                dropIndicator={dnd.dropTarget?.id === seriesItem.id
                  ? dnd.dropTarget.position
                  : null}
                availableSeries={series.filter((other) =>
                  other.id !== seriesItem.id
                )}
                onMovePost={handleMoveToSeries}
              />
            );
          })}
        </Box>
      )}

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
