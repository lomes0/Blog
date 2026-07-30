"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { actions, useDispatch } from "@/store";
import { rankBetween } from "@/lib/ordering";
import { bracketForDrop } from "@/lib/documentOrder";
import {
  buildIndex,
  containerKey,
  postDestination,
  ROOT_CONTAINER,
  type TreeContainer,
  type TreeNode,
  type TreeNodeKind,
} from "./model";
import {
  DRAG_MIME,
  type DropPosition,
  readDragPayload,
  setDragPayload,
} from "@/lib/dragDrop";

/** The rows being dragged: the whole selection when a selected row is grabbed. */
interface DragState {
  /** Ids to move, in render order. */
  ids: string[];
  idSet: Set<string>;
  /** Kind of the grabbed row — decides the drop mode (into vs reorder). */
  primaryKind: TreeNodeKind;
}

/**
 * A gesture that started on *another* tree surface. The sidebar and the posts
 * list are on screen together, so a drag can cross between them, and the
 * receiving hook holds no `DragState` for it. The grabbed kind is unknowable
 * mid-drag (the payload is unreadable until `drop`), so it is taken to be a
 * post — the only kind a container drop accepts, and the only kind the other
 * surfaces drag onto this one.
 */
const FOREIGN_DRAG: DragState = {
  ids: [],
  idSet: new Set(),
  primaryKind: "post",
};

/**
 * The drag a gesture is carrying, and whether it came from another surface. A
 * row opts into accepting a foreign drag by passing its event; a row that
 * passes none behaves exactly as if no drag were in flight.
 */
const resolveDrag = (
  local: DragState | null,
  event?: React.DragEvent,
): { dragged: DragState; foreign: boolean } | null => {
  if (local) return { dragged: local, foreign: false };
  if (!event?.dataTransfer.types.includes(DRAG_MIME)) return null;
  return { dragged: FOREIGN_DRAG, foreign: true };
};

/** Resolve the full set of ids a grab should drag (e.g. the multi-selection). */
export type DragSetResolver = (primaryId: string) => string[];

export interface TreeDndOptions {
  /**
   * The container the top-level rows belong to. Defaults to the author's root
   * list. Must be referentially stable — it is a memo dependency.
   */
  root?: TreeContainer;
  /**
   * Whether this surface renders projects. When it does, reordering a series
   * into the root list *is* the gesture for taking it out of a project, so the
   * move asserts `projectId: null`. When it does not, project membership is
   * invisible here and a reorder leaves it untouched rather than silently
   * unfiling a series the user cannot see is filed.
   */
  rendersProjects?: boolean;
  getDragSet?: DragSetResolver;
}

export interface TreeDndResult {
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
  /**
   * Row reports a hovered reorder position (before/after itself). Pass `event`
   * to also accept drags that started on another tree surface.
   */
  onReorderDragOver: (
    targetId: string,
    position: DropPosition,
    event?: React.DragEvent,
  ) => void;
  /** Row reports a drop at the given reorder position. */
  onReorderDrop: (
    targetId: string,
    position: DropPosition,
    event?: React.DragEvent,
  ) => void;
  /** A drag left the row without entering another target. */
  onDragLeaveRow: () => void;
}

/**
 * Native HTML5 drag-and-drop for the post tree, dispatching the `movePost` /
 * `moveSeries` / `moveProject` thunks. One pair of row handlers covers every
 * case; the meaning of a drop is resolved from the *target* row and the grabbed
 * row's *kind*:
 *
 *   - post → onto a series header         → move the post(s) into that series
 *   - post → between rows in a series      → reorder / move into the series there
 *   - post → between root rows             → reorder / move out to the root list
 *   - series → onto a project header       → move the series into that project
 *   - series → between a project's series   → reorder within (move into) the project
 *   - series → between root rows            → reorder / move out to the root list
 *   - project → between root rows           → reorder the project in the root list
 *
 * Containers share one rank space per level (see `TreeContainer`), so a
 * "reorder" drop both re-homes and re-ranks a row against the target's siblings.
 * The destination is always the container in *full* — never a patch of it — so a
 * reorder inside a series keeps its rows in that series.
 *
 * When the grabbed row is part of the multi-selection, `getDragSet` expands the
 * drag to the whole selection (render order); the set is dropped as a contiguous
 * block, each item taking a **chained** rank so their relative order is
 * preserved. Dispatching the block against one shared bracket would scramble it.
 *
 * `nodes` is the rendered, rank-ordered tree — the source of the sibling ranks
 * that bracket a drop. Both the sidebar and the posts list adapt into it.
 */
export function useTreeDnd(
  nodes: readonly TreeNode[],
  options: TreeDndOptions = {},
): TreeDndResult {
  const { root = ROOT_CONTAINER, rendersProjects = false, getDragSet } =
    options;
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

  // Row → container/kind lookup, plus each container's rank-ordered siblings.
  const { targetInfo, siblings } = useMemo(
    () => buildIndex(nodes, root),
    [nodes, root],
  );

  // Same reason as `getDragSetRef`: the drag-start callbacks below are declared
  // with no deps (their other inputs are refs/setters), so they must not close
  // over a render-scoped map or they would serve labels from the first render.
  const targetInfoRef = useRef(targetInfo);
  targetInfoRef.current = targetInfo;

  const startDrag = (
    event: React.DragEvent,
    primaryId: string,
    primaryKind: TreeNodeKind,
  ) => {
    const ids = getDragSetRef.current?.(primaryId) ?? [primaryId];
    draggedRef.current = { ids, idSet: new Set(ids), primaryKind };
    setDragPayload(
      event.dataTransfer,
      ids,
      targetInfoRef.current.get(primaryId)?.label,
    );
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
      | { mode: "reorder"; container: TreeContainer }
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
          return { mode: "reorder", container: ROOT_CONTAINER };
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
          ? { mode: "reorder", container: ROOT_CONTAINER }
          : { mode: "invalid" };
      }

      // Target is a post row.
      if (dragged.primaryKind === "post") {
        return { mode: "reorder", container: info.container };
      }
      // A series or project can only live at root, so it may only reorder
      // against a root-level post row — never nest inside a series.
      return info.container.type === "root"
        ? { mode: "reorder", container: ROOT_CONTAINER }
        : { mode: "invalid" };
    },
    [targetInfo],
  );

  const onReorderDragOver = useCallback(
    (targetId: string, position: DropPosition, event?: React.DragEvent) => {
      const resolved = resolveDrag(draggedRef.current, event);
      if (!resolved) return;
      const { dragged, foreign } = resolved;
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
      } else if (c.mode === "reorder" && !foreign) {
        // A foreign drag gets no insertion line: it cannot be ranked (below).
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
    async (
      targetId: string,
      position: DropPosition,
      event?: React.DragEvent,
    ) => {
      const resolved = resolveDrag(draggedRef.current, event);
      setDropTarget(null);
      setDragOverSeriesId(null);
      setDragOverProjectId(null);
      if (!resolved || resolved.dragged.idSet.has(targetId)) return;

      const c = classify(targetId, resolved.dragged);
      if (c.mode === "invalid") return;

      let dragged = resolved.dragged;
      if (resolved.foreign) {
        // A foreign gesture can name an absolute destination but not a slot: the
        // block's render order and this list's sibling ranks are not its own.
        if (c.mode === "reorder") return;
        const payload = event && readDragPayload(event.dataTransfer);
        if (!payload) return;
        dragged = {
          ids: payload.ids,
          idSet: new Set(payload.ids),
          primaryKind: "post",
        };
      }

      // Move a set of posts into a series: append each (render order preserved).
      if (c.mode === "into") {
        for (const id of dragged.ids) {
          if (targetInfo.get(id)?.kind !== "post") continue;
          await dispatch(
            actions.movePost({ id, destination: { seriesId: c.seriesId } }),
          );
        }
        router.refresh();
        return;
      }

      // Move a set of series into a project: append each.
      if (c.mode === "intoProject") {
        for (const id of dragged.ids) {
          if (targetInfo.get(id)?.kind !== "series") continue;
          await dispatch(
            actions.moveSeries({ id, destination: { projectId: c.projectId } }),
          );
        }
        router.refresh();
        return;
      }

      // Reorder: drop the set as a contiguous block at the target slot. The
      // block's outer bracket comes from the target's neighbours (the whole
      // dragged set removed first); each item then takes a chained rank so the
      // set's internal order is preserved.
      const container = c.container;
      // Null covers both "target vanished" and a degenerate slot whose colliding
      // neighbour ranks would make rankBetween throw — see bracketForDrop.
      const bracket = bracketForDrop(
        siblings.get(containerKey(container)) ?? [],
        dragged.idSet,
        targetId,
        position,
      );
      if (!bracket) return;

      const destination = postDestination(container);
      const beforeRank = bracket.beforeRank;
      let afterRank = bracket.afterRank;
      for (const id of dragged.ids) {
        const kind = targetInfo.get(id)?.kind ?? "post";
        const between = { afterRank, beforeRank };
        if (kind === "post") {
          // Posts can't live directly in a project; skip them there.
          if (!destination) continue;
          await dispatch(actions.movePost({ id, destination, between }));
        } else if (kind === "series") {
          if (container.type === "project") {
            await dispatch(
              actions.moveSeries({
                id,
                destination: { projectId: container.projectId },
                between,
              }),
            );
          } else if (container.type === "root") {
            await dispatch(
              actions.moveSeries({
                id,
                // Only a surface that renders projects may assert membership.
                ...(rendersProjects
                  ? { destination: { projectId: null } }
                  : {}),
                between,
              }),
            );
          } else {
            // A series can nest in neither a series nor a tab group.
            continue;
          }
        } else {
          if (container.type !== "root") continue;
          await dispatch(actions.moveProject({ id, between }));
        }
        // Chain: the next item slots just after the one just placed.
        afterRank = rankBetween(afterRank, beforeRank);
      }
      router.refresh();
    },
    [classify, dispatch, router, siblings, targetInfo, rendersProjects],
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
