"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { actions, useDispatch } from "@/store";
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
interface Dragged {
  id: string;
  kind: DragKind;
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
 * *target* row and the *dragged* kind:
 *
 *   - post → onto a series header        → move the post into that series
 *   - post → between rows in a series     → reorder / move into the series there
 *   - post → between root rows            → reorder / move out to the root list
 *   - series → between root rows          → reorder the series in the root list
 *
 * `groups` is the rendered, rank-ordered tree (series interleaved with
 * standalone posts, each series' posts rank-sorted), the source of the sibling
 * ranks that bracket a drop.
 */
export function useSidebarDnd(groups: SeriesGroupItem[]): SidebarDndResult {
  const dispatch = useDispatch();
  const router = useRouter();
  const draggedRef = useRef<Dragged | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState<
    { id: string; position: DropPosition } | null
  >(null);
  const [dragOverSeriesId, setDragOverSeriesId] = useState<string | null>(null);

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

  const startDrag = (event: React.DragEvent, dragged: Dragged) => {
    draggedRef.current = dragged;
    event.dataTransfer.setData(DRAG_MIME, JSON.stringify(dragged));
    event.dataTransfer.effectAllowed = "move";
    setIsDragging(true);
  };

  const onPostDragStart = useCallback((event: React.DragEvent, id: string) => {
    startDrag(event, { id, kind: "post" });
  }, []);

  const onSeriesDragStart = useCallback(
    (event: React.DragEvent, id: string) => {
      startDrag(event, { id, kind: "series" });
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

  // Resolve what a drag over `targetId` means for the current dragged item.
  const classify = useCallback(
    (
      targetId: string,
      dragged: Dragged,
    ):
      | { mode: "into"; seriesId: string }
      | { mode: "reorder"; container: TargetInfo["container"] }
      | { mode: "invalid" } => {
      const info = targetInfo.get(targetId);
      if (!info) return { mode: "invalid" };
      if (info.kind === "series") {
        // Drop a post *into* the series; a series over a series reorders in root.
        return dragged.kind === "post"
          ? { mode: "into", seriesId: targetId }
          : { mode: "reorder", container: { type: "root" } };
      }
      // Target is a post row.
      if (dragged.kind === "series") {
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
      if (dragged.id === targetId) {
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
      if (!dragged || dragged.id === targetId) return;

      const c = classify(targetId, dragged);
      if (c.mode === "invalid") return;

      if (c.mode === "into") {
        dispatch(
          actions.moveDocument({
            id: dragged.id,
            destination: { seriesId: c.seriesId },
          }),
        );
        router.refresh();
        return;
      }

      const siblings = c.container.type === "root"
        ? rootSiblings
        : seriesSiblings.get(c.container.seriesId) ?? [];
      const between = computeBetween(siblings, dragged.id, targetId, position);
      if (!between) return;

      if (c.container.type === "root" && dragged.kind === "series") {
        dispatch(actions.moveSeries({ id: dragged.id, between }));
      } else {
        const destination = c.container.type === "series"
          ? { seriesId: c.container.seriesId }
          : {};
        dispatch(
          actions.moveDocument({ id: dragged.id, destination, between }),
        );
      }
      router.refresh();
    },
    [classify, dispatch, router, rootSiblings, seriesSiblings],
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
 * with the dragged row removed first (so its own rank never brackets the drop).
 * Returns null when the target isn't found.
 */
function computeBetween(
  siblings: Sibling[],
  draggedId: string,
  targetId: string,
  position: DropPosition,
): { afterRank: string | null; beforeRank: string | null } | null {
  const list = siblings.filter((s) => s.id !== draggedId);
  const ti = list.findIndex((s) => s.id === targetId);
  if (ti === -1) return null;
  const rankAt = (i: number) => (i >= 0 && i < list.length ? list[i].rank : null);
  const afterRank = position === "before" ? rankAt(ti - 1) : rankAt(ti);
  const beforeRank = position === "before" ? rankAt(ti) : rankAt(ti + 1);
  return { afterRank, beforeRank };
}
