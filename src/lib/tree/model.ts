import type { RankedSibling } from "@/lib/documentOrder";
import type { PostContainer } from "@/types";

/**
 * The structural shape of the post tree, shared by every surface that renders it.
 *
 * Two surfaces draw the same tree with deliberately different chrome — the
 * sidebar (`RootItem`, nested, `em`-sized rows per DESIGN.md §17.2) and the
 * posts list (`PostsListView`, flat rows in the fixed `dense`/`micro` variants).
 * Their row components are *not* interchangeable and are not meant to be; what
 * they share is the tree beneath them, and the drag engine that operates on it
 * (`./useTreeDnd`). This module is that tree, stated once and structurally: an
 * id, a rank, a kind and children. Neither surface's render model is imported
 * here — each adapts into `TreeNode` at its own edge.
 */

export type TreeNodeKind = "post" | "series" | "project";

/**
 * One row of the tree. `children` is the rows nested under it — a series' posts,
 * a project's series. Omit it (rather than pass `[]`) for a row that is not a
 * container on this surface: an empty array declares an empty container, which
 * a drop can legitimately target.
 */
export interface TreeNode {
  kind: TreeNodeKind;
  id: string;
  rank: string | null;
  /** Display name, carried in the drag payload for confirm prompts. */
  label?: string;
  children?: TreeNode[];
}

/**
 * The container a row lives in, or that a container row stands for. Containers
 * each own a rank space (root: projects + ungrouped series + standalone posts;
 * a project: its series; a series: its posts; a post: its tabs).
 */
export type TreeContainer =
  | { type: "root" }
  | { type: "series"; seriesId: string }
  | { type: "project"; projectId: string }
  | { type: "tabs"; parentId: string };

/** The author's root list. A module constant so it is referentially stable. */
export const ROOT_CONTAINER: TreeContainer = { type: "root" };

/** Map key for a container — containers are compared by value, not identity. */
export const containerKey = (c: TreeContainer): string => {
  switch (c.type) {
    case "root":
      return "root";
    case "series":
      return `series:${c.seriesId}`;
    case "project":
      return `project:${c.projectId}`;
    case "tabs":
      return `tabs:${c.parentId}`;
  }
};

/** The container a node's `children` live in. */
export const childContainer = (node: TreeNode): TreeContainer => {
  switch (node.kind) {
    case "series":
      return { type: "series", seriesId: node.id };
    case "project":
      return { type: "project", projectId: node.id };
    case "post":
      return { type: "tabs", parentId: node.id };
  }
};

/**
 * `movePost`'s `destination` for a container, or null when a post cannot live
 * there (a project holds series, not posts).
 *
 * `PostContainer` is read as a *whole* container, never a partial patch, so this
 * must always name the container in full — that is what keeps a reorder from
 * re-homing the row it moves (see `PostContainer`'s docstring).
 */
export const postDestination = (c: TreeContainer): PostContainer | null => {
  switch (c.type) {
    case "root":
      return {};
    case "series":
      return { seriesId: c.seriesId };
    case "tabs":
      return { parentId: c.parentId };
    case "project":
      return null;
  }
};

/** Read a `PostContainer` (as callers hold it) as a tree container. */
export const containerFromPost = (c: PostContainer): TreeContainer =>
  c.seriesId
    ? { type: "series", seriesId: c.seriesId }
    : c.parentId
    ? { type: "tabs", parentId: c.parentId }
    : ROOT_CONTAINER;

/** What a given row id represents and which container it lives in. */
export interface TreeTargetInfo {
  kind: TreeNodeKind;
  container: TreeContainer;
  label?: string;
}

export interface TreeIndex {
  /** Row id → what it is and where it lives. */
  targetInfo: Map<string, TreeTargetInfo>;
  /** `containerKey` → that container's rows, in render (rank) order. */
  siblings: Map<string, RankedSibling[]>;
}

/**
 * Index a rendered tree for drag-and-drop: every row's kind and container, plus
 * the rank-ordered sibling list of each container (the source of the neighbour
 * ranks that bracket a drop).
 *
 * `root` names the container the top-level rows belong to. It is usually the
 * author's root list, but not always: `/posts/[seriesId]` renders *one series'
 * posts* as its top level, and passing `{ type: "root" }` there would rank every
 * reorder against the root list and detach the post from its series.
 */
export function buildIndex(
  nodes: readonly TreeNode[],
  root: TreeContainer = ROOT_CONTAINER,
): TreeIndex {
  const targetInfo = new Map<string, TreeTargetInfo>();
  const siblings = new Map<string, RankedSibling[]>();

  const walk = (level: readonly TreeNode[], container: TreeContainer) => {
    const list: RankedSibling[] = [];
    for (const node of level) {
      targetInfo.set(node.id, {
        kind: node.kind,
        container,
        label: node.label,
      });
      list.push({ id: node.id, rank: node.rank });
      // `[]` still registers the (empty) container, so a drop into an empty
      // series resolves to a real sibling list rather than a missing one.
      if (node.children) walk(node.children, childContainer(node));
    }
    siblings.set(containerKey(container), list);
  };

  walk(nodes, root);
  return { targetInfo, siblings };
}
