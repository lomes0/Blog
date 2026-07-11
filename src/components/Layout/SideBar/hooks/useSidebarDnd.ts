"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { actions, useDispatch } from "@/store";
import { rankBetween } from "@/lib/ordering";
import { rankOf } from "@/lib/documentOrder";
import type { SeriesGroupItem } from "@/utils/posts/seriesGrouping";

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

type DragKind = "post" | "series";

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

/** What a given row id represents and which container it lives in / stands for. */
interface TargetInfo {
  kind: DragKind;
  container: { type: "root" } | { type: "series"; seriesId: string };
}

/** Resolve the full set of ids a grab should drag (e.g. the multi-selection). */
export type DragSetResolver = (primaryId: string) => string[];

export interface SidebarDndResult {
  isDragging: boolean;
  /** Reorder insertion line: the target row and which edge. */
  dropTarget: { id: string; position: DropPosition } | null;
  /** Series header currently highlighted as a drop-into target. */
  dragOverSeriesId: string | null;
  onPostDragStart: (event: React.DragEvent, id: string) => void;
  onSeriesDragStart: (event: React.DragEvent, id: string) => void;
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
 * `moveDocument` / `moveSeries` thunks the posts page uses. A single pair of
 * row handlers covers every case; the meaning of a drop is resolved from the
 * *target* row and the grabbed row's *kind*:
 *
 *   - post → onto a series header        → move the post(s) into that series
 *   - post → between rows in a series     → reorder / move into the series there
 *   - post → between root rows            → reorder / move out to the root list
 *   - series → between root rows          → reorder the series in the root list
 *
 * When the grabbed row is part of the multi-selection, `getDragSet` expands the
 * drag to the whole selection (render order); the set is dropped as a contiguous
 * block, each item taking a chained rank so their relative order is preserved.
 *
 * `groups` is the rendered, rank-ordered tree (series interleaved with
 * standalone posts, each series' posts rank-sorted), the source of the sibling
 * ranks that bracket a drop.
 */
export function useSidebarDnd(
  groups: SeriesGroupItem[],
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

  // Keep the resolver current without making the drop callbacks depend on it.
  const getDragSetRef = useRef<DragSetResolver | undefined>(getDragSet);
  getDragSetRef.current = getDragSet;

  // Row → container/kind lookup, plus the rank-ordered sibling lists for the
  // root (posts + series interleaved) and for each series' posts.
  const { targetInfo, rootSiblings, seriesSiblings } = useMemo(() => {
    const targetInfo = new Map<string, TargetInfo>();
    const rootSiblings: Sibling[] = [];
    const seriesSiblings = new Map<string, Sibling[]>();
    for (const group of groups) {
      if (group.type === "series" && group.series) {
        const sid = group.series.id;
        targetInfo.set(sid, { kind: "series", container: { type: "root" } });
        rootSiblings.push({ id: sid, rank: group.series.rank ?? null });
        seriesSiblings.set(
          sid,
          group.posts.map((p) => ({ id: p.id, rank: rankOf(p) })),
        );
        for (const p of group.posts) {
          targetInfo.set(p.id, {
            kind: "post",
            container: { type: "series", seriesId: sid },
          });
        }
      } else {
        const p = group.posts[0];
        if (!p) continue;
        targetInfo.set(p.id, { kind: "post", container: { type: "root" } });
        rootSiblings.push({ id: p.id, rank: rankOf(p) });
      }
    }
    return { targetInfo, rootSiblings, seriesSiblings };
  }, [groups]);

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

  const onDragEnd = useCallback(() => {
    draggedRef.current = null;
    setIsDragging(false);
    setDropTarget(null);
    setDragOverSeriesId(null);
  }, []);

  const onDragLeaveRow = useCallback(() => {
    setDragOverSeriesId(null);
  }, []);

  // Resolve what a drag over `targetId` means for the current drag.
  const classify = useCallback(
    (
      targetId: string,
      dragged: DragState,
    ):
      | { mode: "into"; seriesId: string }
      | { mode: "reorder"; container: TargetInfo["container"] }
      | { mode: "invalid" } => {
      const info = targetInfo.get(targetId);
      if (!info) return { mode: "invalid" };
      if (info.kind === "series") {
        // Drop a post *into* the series; a series over a series reorders in root.
        return dragged.primaryKind === "post"
          ? { mode: "into", seriesId: targetId }
          : { mode: "reorder", container: { type: "root" } };
      }
      // Target is a post row.
      if (dragged.primaryKind === "series") {
        // A series can only live at root, so it may only reorder against a
        // root-level post row — never nest inside a series.
        return info.container.type === "root"
          ? { mode: "reorder", container: { type: "root" } }
          : { mode: "invalid" };
      }
      return { mode: "reorder", container: info.container };
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
        return;
      }
      const c = classify(targetId, dragged);
      if (c.mode === "into") {
        setDragOverSeriesId(c.seriesId);
        setDropTarget(null);
      } else if (c.mode === "reorder") {
        setDragOverSeriesId(null);
        setDropTarget({ id: targetId, position });
      } else {
        setDropTarget(null);
        setDragOverSeriesId(null);
      }
    },
    [classify],
  );

  const onReorderDrop = useCallback(
    (targetId: string, position: DropPosition) => {
      const dragged = draggedRef.current;
      setDropTarget(null);
      setDragOverSeriesId(null);
      if (!dragged || dragged.idSet.has(targetId)) return;

      const c = classify(targetId, dragged);
      if (c.mode === "invalid") return;

      // Move a set of posts into a series: append each (render order preserved).
      if (c.mode === "into") {
        for (const id of dragged.ids) {
          if (targetInfo.get(id)?.kind !== "post") continue;
          dispatch(
            actions.moveDocument({
              id,
              destination: { seriesId: c.seriesId },
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
      const siblings = c.container.type === "root"
        ? rootSiblings
        : seriesSiblings.get(c.container.seriesId) ?? [];
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
        if (c.container.type === "series") {
          // Only posts can live in a series; skip any dragged series.
          if (kind !== "post") continue;
          dispatch(
            actions.moveDocument({
              id,
              destination: { seriesId: c.container.seriesId },
              between: { afterRank, beforeRank },
            }),
          );
        } else if (kind === "series") {
          dispatch(actions.moveSeries({ id, between: { afterRank, beforeRank } }));
        } else {
          dispatch(
            actions.moveDocument({
              id,
              destination: {},
              between: { afterRank, beforeRank },
            }),
          );
        }
        // Chain: the next item slots just after the one just placed.
        afterRank = rankBetween(afterRank, beforeRank);
      }
      router.refresh();
    },
    [classify, dispatch, router, rootSiblings, seriesSiblings, targetInfo],
  );

  return {
    isDragging,
    dropTarget,
    dragOverSeriesId,
    onPostDragStart,
    onSeriesDragStart,
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
