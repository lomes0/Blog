"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { actions, useDispatch } from "@/store";
import { rankBetween } from "@/lib/ordering";
import { rankOf } from "@/lib/documentOrder";
import type { RootItem } from "@/utils/posts/seriesGrouping";

/** Shared drag payload MIME, matching the posts page (PostsListView). */
export const DRAG_MIME = "application/matheditor-document";

export type DropPosition = "before" | "after";

/**
 * Whether the cursor is over the top or bottom half of the row the drag event is
 * bound to. Reads `currentTarget` (valid synchronously in the handler) so no ref
 * is needed on the row element.
 */
export function dropPositionFromEvent(
  e: React.DragEvent<HTMLElement>,
): DropPosition {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

type DragKind = "post" | "series" | "project";

/** The rows being dragged: the whole selection when a selected row is grabbed. */
interface DragState {
  /** Ids to move, in render order. */
  ids: string[];
  idSet: Set<string>;
  /** Kind of the grabbed row — decides the drop mode (into vs reorder). */
  primaryKind: DragKind;
}

interface Sibling {
  id: string;
  rank: string | null;
}

/** The container a row lives in / a target stands for. */
type Container =
  | { type: "root" }
  | { type: "series"; seriesId: string }
  | { type: "project"; projectId: string };

/** What a given row id represents and which container it lives in / stands for. */
interface TargetInfo {
  kind: DragKind;
  container: Container;
}

/** Resolve the full set of ids a grab should drag (e.g. the multi-selection). */
export type DragSetResolver = (primaryId: string) => string[];

export interface SidebarDndResult {
  isDragging: boolean;
  /** Reorder insertion line: the target row and which edge. */
  dropTarget: { id: string; position: DropPosition } | null;
  /** Series header currently highlighted as a drop-into target (post → series). */
  dragOverSeriesId: string | null;
  /** Project header currently highlighted as a drop-into target (series → project). */
  dragOverProjectId: string | null;
  onPostDragStart: (event: React.DragEvent, id: string) => void;
  onSeriesDragStart: (event: React.DragEvent, id: string) => void;
  onProjectDragStart: (event: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  /** Row reports a hovered reorder position (before/after itself). */
  onReorderDragOver: (targetId: string, position: DropPosition) => void;
  /** Row reports a drop at the given reorder position. */
  onReorderDrop: (targetId: string, position: DropPosition) => void;
  /** A drag left the row without entering another target. */
  onDragLeaveRow: () => void;
}

/**
 * Native HTML5 drag-and-drop for the sidebar tree, dispatching the same
 * `movePost` / `moveSeries` / `moveProject` thunks the posts page uses. A
 * single pair of row handlers covers every case; the meaning of a drop is
 * resolved from the *target* row and the grabbed row's *kind*:
 *
 *   - post → onto a series header        → move the post(s) into that series
 *   - post → between rows in a series     → reorder / move into the series there
 *   - post → between root rows            → reorder / move out to the root list
 *   - series → onto a project header      → move the series into that project
 *   - series → between a project's series  → reorder within (move into) the project
 *   - series → between root rows           → reorder / move out to the root list
 *   - project → between root rows          → reorder the project in the root list
 *
 * Containers share one rank space per level (root: projects + ungrouped series +
 * standalone posts; project: its series; series: its posts), so a "reorder" drop
 * both re-homes and re-ranks a row against the target's siblings.
 *
 * When the grabbed row is part of the multi-selection, `getDragSet` expands the
 * drag to the whole selection (render order); the set is dropped as a contiguous
 * block, each item taking a chained rank so their relative order is preserved.
 *
 * `rootItems` is the rendered, rank-ordered tree, the source of the sibling
 * ranks that bracket a drop.
 */
export function useSidebarDnd(
  rootItems: RootItem[],
  getDragSet?: DragSetResolver,
): SidebarDndResult {
  const dispatch = useDispatch();
  const router = useRouter();
  const draggedRef = useRef<DragState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState<
    { id: string; position: DropPosition } | null
  >(null);
  const [dragOverSeriesId, setDragOverSeriesId] = useState<string | null>(null);
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(
    null,
  );

  // Keep the resolver current without making the drop callbacks depend on it.
  const getDragSetRef = useRef<DragSetResolver | undefined>(getDragSet);
  getDragSetRef.current = getDragSet;

  // Row → container/kind lookup, plus the rank-ordered sibling lists for the
  // root (projects + ungrouped series + standalone posts), each project's series
  // and each series' posts.
  const { targetInfo, rootSiblings, projectSiblings, seriesSiblings } = useMemo(
    () => {
      const targetInfo = new Map<string, TargetInfo>();
      const rootSiblings: Sibling[] = [];
      const projectSiblings = new Map<string, Sibling[]>();
      const seriesSiblings = new Map<string, Sibling[]>();

      const addSeries = (
        seriesId: string,
        seriesRank: string | null,
        posts: { id: string; rank: string | null }[],
        container: Container,
      ) => {
        targetInfo.set(seriesId, { kind: "series", container });
        seriesSiblings.set(seriesId, posts);
        for (const p of posts) {
          targetInfo.set(p.id, {
            kind: "post",
            container: { type: "series", seriesId },
          });
        }
        return { id: seriesId, rank: seriesRank };
      };

      for (const item of rootItems) {
        if (item.type === "project") {
          const pid = item.project.id;
          targetInfo.set(pid, { kind: "project", container: { type: "root" } });
          rootSiblings.push({ id: pid, rank: item.project.rank ?? null });
          const members: Sibling[] = item.children.map((child) =>
            addSeries(
              child.series!.id,
              child.series!.rank ?? null,
              child.posts.map((p) => ({ id: p.id, rank: rankOf(p) })),
              { type: "project", projectId: pid },
            )
          );
          projectSiblings.set(pid, members);
        } else if (item.type === "series" && item.series) {
          rootSiblings.push(
            addSeries(
              item.series.id,
              item.series.rank ?? null,
              item.posts.map((p) => ({ id: p.id, rank: rankOf(p) })),
              { type: "root" },
            ),
          );
        } else {
          const p = item.posts[0];
          if (!p) continue;
          targetInfo.set(p.id, { kind: "post", container: { type: "root" } });
          rootSiblings.push({ id: p.id, rank: rankOf(p) });
        }
      }
      return { targetInfo, rootSiblings, projectSiblings, seriesSiblings };
    },
    [rootItems],
  );

  const startDrag = (
    event: React.DragEvent,
    primaryId: string,
    primaryKind: DragKind,
  ) => {
    const ids = getDragSetRef.current?.(primaryId) ?? [primaryId];
    draggedRef.current = { ids, idSet: new Set(ids), primaryKind };
    event.dataTransfer.setData(DRAG_MIME, JSON.stringify({ ids }));
    event.dataTransfer.effectAllowed = "move";
    setIsDragging(true);
  };

  const onPostDragStart = useCallback((event: React.DragEvent, id: string) => {
    startDrag(event, id, "post");
  }, []);

  const onSeriesDragStart = useCallback(
    (event: React.DragEvent, id: string) => {
      startDrag(event, id, "series");
    },
    [],
  );

  const onProjectDragStart = useCallback(
    (event: React.DragEvent, id: string) => {
      startDrag(event, id, "project");
    },
    [],
  );

  const onDragEnd = useCallback(() => {
    draggedRef.current = null;
    setIsDragging(false);
    setDropTarget(null);
    setDragOverSeriesId(null);
    setDragOverProjectId(null);
  }, []);

  const onDragLeaveRow = useCallback(() => {
    setDragOverSeriesId(null);
    setDragOverProjectId(null);
  }, []);

  // Resolve what a drag over `targetId` means for the current drag.
  const classify = useCallback(
    (
      targetId: string,
      dragged: DragState,
    ):
      | { mode: "into"; seriesId: string }
      | { mode: "intoProject"; projectId: string }
      | { mode: "reorder"; container: Container }
      | { mode: "invalid" } => {
      const info = targetInfo.get(targetId);
      if (!info) return { mode: "invalid" };

      if (info.kind === "project") {
        // Drop a series *into* the project; a project over a project reorders in
        // root. Posts can't live directly in a project.
        if (dragged.primaryKind === "series") {
          return { mode: "intoProject", projectId: targetId };
        }
        if (dragged.primaryKind === "project") {
          return { mode: "reorder", container: { type: "root" } };
        }
        return { mode: "invalid" };
      }

      if (info.kind === "series") {
        // A post drops *into* the series. A series reorders against the target
        // series in its own container (root or a project) — the mechanism for
        // moving a series into/out of a project by position. A project may only
        // reorder against a root-level series.
        if (dragged.primaryKind === "post") {
          return { mode: "into", seriesId: targetId };
        }
        if (dragged.primaryKind === "series") {
          return { mode: "reorder", container: info.container };
        }
        return info.container.type === "root"
          ? { mode: "reorder", container: { type: "root" } }
          : { mode: "invalid" };
      }

      // Target is a post row.
      if (dragged.primaryKind === "post") {
        return { mode: "reorder", container: info.container };
      }
      // A series or project can only live at root, so it may only reorder
      // against a root-level post row — never nest inside a series.
      return info.container.type === "root"
        ? { mode: "reorder", container: { type: "root" } }
        : { mode: "invalid" };
    },
    [targetInfo],
  );

  const onReorderDragOver = useCallback(
    (targetId: string, position: DropPosition) => {
      const dragged = draggedRef.current;
      if (!dragged) return;
      if (dragged.idSet.has(targetId)) {
        // Hovering a row that is itself being dragged: no drop here.
        setDropTarget(null);
        setDragOverSeriesId(null);
        setDragOverProjectId(null);
        return;
      }
      const c = classify(targetId, dragged);
      if (c.mode === "into") {
        setDragOverSeriesId(c.seriesId);
        setDragOverProjectId(null);
        setDropTarget(null);
      } else if (c.mode === "intoProject") {
        setDragOverProjectId(c.projectId);
        setDragOverSeriesId(null);
        setDropTarget(null);
      } else if (c.mode === "reorder") {
        setDragOverSeriesId(null);
        setDragOverProjectId(null);
        setDropTarget({ id: targetId, position });
      } else {
        setDropTarget(null);
        setDragOverSeriesId(null);
        setDragOverProjectId(null);
      }
    },
    [classify],
  );

  const onReorderDrop = useCallback(
    (targetId: string, position: DropPosition) => {
      const dragged = draggedRef.current;
      setDropTarget(null);
      setDragOverSeriesId(null);
      setDragOverProjectId(null);
      if (!dragged || dragged.idSet.has(targetId)) return;

      const c = classify(targetId, dragged);
      if (c.mode === "invalid") return;

      // Move a set of posts into a series: append each (render order preserved).
      if (c.mode === "into") {
        for (const id of dragged.ids) {
          if (targetInfo.get(id)?.kind !== "post") continue;
          dispatch(
            actions.movePost({
              id,
              destination: { seriesId: c.seriesId },
            }),
          );
        }
        router.refresh();
        return;
      }

      // Move a set of series into a project: append each.
      if (c.mode === "intoProject") {
        for (const id of dragged.ids) {
          if (targetInfo.get(id)?.kind !== "series") continue;
          dispatch(
            actions.moveSeries({
              id,
              destination: { projectId: c.projectId },
            }),
          );
        }
        router.refresh();
        return;
      }

      // Reorder: drop the set as a contiguous block at the target slot. The
      // block's outer bracket comes from the target's neighbours (the whole
      // dragged set removed first); each item then takes a chained rank so the
      // set's internal order is preserved.
      const siblings = c.container.type === "series"
        ? seriesSiblings.get(c.container.seriesId) ?? []
        : c.container.type === "project"
        ? projectSiblings.get(c.container.projectId) ?? []
        : rootSiblings;
      const bracket = computeBetween(
        siblings,
        dragged.idSet,
        targetId,
        position,
      );
      if (!bracket) return;
      // Degenerate slot (colliding neighbour ranks): bail rather than let
      // rankBetween throw. A refresh reconciles ranks server-side.
      if (
        bracket.afterRank !== null && bracket.beforeRank !== null &&
        bracket.afterRank >= bracket.beforeRank
      ) {
        return;
      }

      const beforeRank = bracket.beforeRank;
      let afterRank = bracket.afterRank;
      for (const id of dragged.ids) {
        const kind = targetInfo.get(id)?.kind ?? "post";
        const between = { afterRank, beforeRank };
        if (c.container.type === "series") {
          // Only posts can live in a series; skip any dragged series/project.
          if (kind !== "post") continue;
          dispatch(
            actions.movePost({
              id,
              destination: { seriesId: c.container.seriesId },
              between,
            }),
          );
        } else if (c.container.type === "project") {
          // Only series can live in a project; skip posts/projects.
          if (kind !== "series") continue;
          dispatch(
            actions.moveSeries({
              id,
              destination: { projectId: c.container.projectId },
              between,
            }),
          );
        } else if (kind === "series") {
          // Reorder at root moves the series out of any project.
          dispatch(
            actions.moveSeries({ id, destination: { projectId: null }, between }),
          );
        } else if (kind === "project") {
          dispatch(actions.moveProject({ id, between }));
        } else {
          dispatch(
            actions.movePost({ id, destination: {}, between }),
          );
        }
        // Chain: the next item slots just after the one just placed.
        afterRank = rankBetween(afterRank, beforeRank);
      }
      router.refresh();
    },
    [
      classify,
      dispatch,
      router,
      rootSiblings,
      projectSiblings,
      seriesSiblings,
      targetInfo,
    ],
  );

  return {
    isDragging,
    dropTarget,
    dragOverSeriesId,
    dragOverProjectId,
    onPostDragStart,
    onSeriesDragStart,
    onProjectDragStart,
    onDragEnd,
    onReorderDragOver,
    onReorderDrop,
    onDragLeaveRow,
  };
}

/**
 * Ranks that bracket the slot `position` relative to `targetId` in `siblings`,
 * with every dragged row removed first (so the set's own ranks never bracket the
 * drop). Returns null when the target isn't found.
 */
function computeBetween(
  siblings: Sibling[],
  draggedIds: Set<string>,
  targetId: string,
  position: DropPosition,
): { afterRank: string | null; beforeRank: string | null } | null {
  const list = siblings.filter((s) => !draggedIds.has(s.id));
  const ti = list.findIndex((s) => s.id === targetId);
  if (ti === -1) return null;
  const rankAt = (i: number) => (i >= 0 && i < list.length ? list[i].rank : null);
  const afterRank = position === "before" ? rankAt(ti - 1) : rankAt(ti);
  const beforeRank = position === "before" ? rankAt(ti) : rankAt(ti + 1);
  return { afterRank, beforeRank };
}
