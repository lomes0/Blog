import { Post, Project, Series } from "@/types";
import { orderBy } from "@/lib/orderArray";
import type { TreeNode } from "@/lib/tree/model";

/**
 * Represents either a series group (with posts) or a standalone post
 */
export interface SeriesGroupItem {
  type: "series" | "standalone";
  /** For series: the series object. For standalone: undefined */
  series?: Series;
  /** For series: posts in the series. For standalone: single post array */
  posts: Post[];
}

/**
 * A project group in the sidebar tree: a named grouping whose children are the
 * series groups assigned to it (`series.projectId`), in the project's own
 * `seriesOrder`.
 */
export interface ProjectGroupItem {
  type: "project";
  project: Project;
  /** Member series groups, in the project's own `seriesOrder`. */
  children: SeriesGroupItem[];
}

/**
 * A top-level entry in the author's root list as rendered by the sidebar: a
 * project, an ungrouped series, or a standalone post. All three are named by
 * one array — `User.rootOrder` — so they interleave (see
 * {@link groupRootItems}).
 */
export type RootItem = ProjectGroupItem | SeriesGroupItem;

/**
 * A post's 1-based position within its series, read from the series' own
 * `postOrder` (docs/plans/archive/ordering-simplification.md §2). Returns null
 * if the doc isn't found in the series.
 */
export const seriesPositionOf = (
  series: Series | null | undefined,
  docId: string,
): number | null => {
  if (!series?.posts?.length) return null;
  const ordered = orderBy(series.postOrder ?? [], series.posts);
  const idx = ordered.findIndex((p) => p.id === docId);
  return idx === -1 ? null : idx + 1;
};

/** The id of the row a group stands for: its series, or its lone post. */
const groupId = (item: SeriesGroupItem): string =>
  item.type === "series" ? (item.series?.id ?? "") : (item.posts[0]?.id ?? "");

/** When a group's subject was created — the tolerant reader's tiebreaker. */
const groupCreatedAt = (item: SeriesGroupItem): string | Date | undefined =>
  item.type === "series"
    ? item.series?.createdAt
    : item.posts[0]?.createdAt;

/**
 * Order a list of root-level items (or a project's members) by a container's
 * order array — `User.rootOrder` for the root list, `Project.seriesOrder` for a
 * project's series (docs/plans/archive/ordering-simplification.md §2).
 *
 * The items are groups rather than rows, so each is presented to `orderBy` as
 * the id and creation time of the thing it stands for: a series for a series
 * group, the lone post for a standalone one, the project for a project row.
 * That is the whole of what makes one array able to order three kinds of thing
 * at once — the ids come from three tables but never collide, being UUIDs
 * (§10).
 */
const orderItems = <T extends RootItem>(
  order: readonly string[],
  items: T[],
): T[] =>
  orderBy(
    order,
    items.map((item) => ({
      id: rootItemId(item),
      createdAt: rootItemCreatedAt(item),
      item,
    })),
  ).map((wrapped) => wrapped.item);

/**
 * Group posts by series and return a mixed list of series groups and standalone
 * posts. **Unordered** — the container's array decides the order of the result,
 * and only the caller knows which container that is
 * (docs/plans/archive/ordering-simplification.md §2), so {@link groupRootItems}
 * applies it.
 *
 * - Uses series.posts from seriesMap as the authoritative source for series posts
 * - Only posts NOT in any series are added as standalone posts
 * - A series with no post in this partition is dropped
 *
 * @param posts - Array of Post posts (used only for standalone posts)
 * @param seriesMap - Map of series ID to Series object (series.posts is the source of truth)
 * @returns Array of SeriesGroupItem, in no particular order
 */
const groupPostsBySeries = (
  posts: Post[],
  seriesMap: Map<string, Series>,
): SeriesGroupItem[] => {
  // Build a set of post IDs actually present in this partition
  const postIdsInPartition = new Set(posts.map((p) => p.id));

  // Build a map from post ID to the store's copy of that post
  const postsByIdMap = new Map<string, Post>(
    posts.map((p) => [p.id, p]),
  );

  // Collect all post IDs that belong to displayed series
  const seriesPostIds = new Set<string>();
  const result: SeriesGroupItem[] = [];

  // Add series groups — only if at least one of its posts is in this partition
  seriesMap.forEach((series) => {
    if (series.posts && series.posts.length > 0) {
      // Skip series that have no posts in the current partition
      const hasPostInPartition = series.posts.some((post) =>
        postIdsInPartition.has(post.id)
      );
      if (!hasPostInPartition) return;

      // Mark all series post IDs so they don't appear as standalone
      series.posts.forEach((post) => seriesPostIds.add(post.id));

      // Prefer the store's copy of each post — it carries anything loaded
      // since the series was fetched (content, a fresher name) — and fall back
      // to the copy embedded in the series.
      const seriesPosts: Post[] = series.posts.map((post) =>
        postsByIdMap.get(post.id) ?? post
      );

      result.push({
        type: "series",
        series,
        posts: orderBy(series.postOrder ?? [], seriesPosts),
      });
    }
  });

  // Add standalone posts (posts not in any series)
  posts.forEach((post) => {
    if (!seriesPostIds.has(post.id)) {
      result.push({
        type: "standalone",
        posts: [post],
      });
    }
  });

  return result;
};

/**
 * Like groupPostsBySeries but also includes series that have no posts in the
 * current partition. Also unordered; see {@link groupRootItems}.
 */
const groupPostsBySeriesWithEmpty = (
  posts: Post[],
  seriesMap: Map<string, Series>,
): SeriesGroupItem[] => {
  const baseGroups = groupPostsBySeries(posts, seriesMap);
  const existingSeriesIds = new Set(
    baseGroups.flatMap((g) =>
      g.type === "series" && g.series ? [g.series.id] : []
    ),
  );
  const emptyGroups: SeriesGroupItem[] = [];
  seriesMap.forEach((series) => {
    if (!existingSeriesIds.has(series.id)) {
      emptyGroups.push({
        type: "series",
        series,
        posts: [],
      });
    }
  });
  return [...baseGroups, ...emptyGroups];
};

/** The id of the row a root item stands for: its project, series, or post. */
export const rootItemId = (item: RootItem): string =>
  item.type === "project" ? item.project.id : groupId(item);

/** When that row was created — the tolerant reader's tiebreaker (§6). */
const rootItemCreatedAt = (item: RootItem): string | Date | undefined =>
  item.type === "project" ? item.project.createdAt : groupCreatedAt(item);

/**
 * Build the sidebar's nested root tree: projects (each wrapping its member series
 * groups), ungrouped series and standalone posts, interleaved in `order`.
 *
 * Starts from {@link groupPostsBySeriesWithEmpty} (flat series groups + standalone
 * posts, empty series included), then lifts every series whose `projectId` names
 * a known project into that project's `children`. A series pointing at an unknown
 * project (e.g. projects not yet loaded) falls back to the root list, so the tree
 * degrades gracefully and matches the "ungrouped renders inline at root" rule.
 *
 * @param posts - Standalone-post source (series posts come from seriesMap).
 * @param seriesMap - Series ID → Series (series.posts is authoritative).
 * @param projects - The author's projects, in any order.
 * @param order - The order array of the container these rows live in: the
 *   author's `rootOrder` on /posts and in the sidebar, a series' `postOrder`
 *   when /posts is rendering one series' posts as its top level. Passing the
 *   wrong one is the same class of mistake `buildIndex`'s `root` argument
 *   guards against, which is why it is a parameter rather than read from the
 *   store here.
 * @returns Root items in that order, with anything the array does not name
 *   falling to the end by creation time (§6).
 */
export const groupRootItems = (
  posts: Post[],
  seriesMap: Map<string, Series>,
  projects: Project[],
  order: readonly string[] = [],
): RootItem[] => {
  const flatGroups = groupPostsBySeriesWithEmpty(posts, seriesMap);
  const knownProjectIds = new Set(projects.map((p) => p.id));

  // Partition the flat groups: series assigned to a known project are nested;
  // everything else (ungrouped series, standalone posts) stays at root.
  const membersByProject = new Map<string, SeriesGroupItem[]>();
  const rootGroups: SeriesGroupItem[] = [];
  for (const group of flatGroups) {
    const projectId = group.type === "series"
      ? (group.series?.projectId ?? null)
      : null;
    if (projectId && knownProjectIds.has(projectId)) {
      const members = membersByProject.get(projectId) ?? [];
      members.push(group);
      membersByProject.set(projectId, members);
    } else {
      rootGroups.push(group);
    }
  }

  // A project's children are ordered by the project's own array, not by root's.
  const projectItems: RootItem[] = projects.map((project) => ({
    type: "project",
    project,
    children: orderItems(
      project.seriesOrder ?? [],
      membersByProject.get(project.id) ?? [],
    ),
  }));

  return orderItems(order, [...projectItems, ...rootGroups]);
};

/**
 * Split the ordered root list into the two sections the sidebar renders:
 * standalone posts ("Notes"), then projects and ungrouped series ("Projects").
 * The shared space is untouched — each section is an ordered subset of it, so
 * drag-reorder still agrees with the server.
 *
 * Lives here rather than in the tree component because the compact rail orders
 * itself the same way; see {@link flattenRootItems}.
 */
export const partitionRootItems = (
  items: RootItem[],
): { noteItems: SeriesGroupItem[]; groupItems: RootItem[] } => ({
  noteItems: items.filter(
    (item): item is SeriesGroupItem => item.type === "standalone",
  ),
  groupItems: items.filter(
    (item) => item.type === "project" || item.type === "series",
  ),
});

/**
 * Flatten the root tree back to series/standalone groups in render order —
 * each project replaced in place by its children, for the project-agnostic
 * compact rail.
 */
const flattenRootItems = (items: RootItem[]): SeriesGroupItem[] =>
  items.flatMap((item) => (item.type === "project" ? item.children : [item]));

/**
 * The compact rail's item list: the same notes-then-groups order the expanded
 * tree renders, with projects collapsed away (their series inlined in place).
 */
export const railItems = (items: RootItem[]): SeriesGroupItem[] => {
  const { noteItems, groupItems } = partitionRootItems(items);
  return [...noteItems, ...flattenRootItems(groupItems)];
};

const postTreeNode = (post: Post): TreeNode => ({
  kind: "post",
  id: post.id,
  label: post.title,
});

/** A series group, or the lone post a standalone group wraps. */
const groupTreeNode = (group: SeriesGroupItem): TreeNode | null => {
  if (group.type === "series" && group.series) {
    return {
      kind: "series",
      id: group.series.id,
      label: group.series.title,
      children: group.posts.map(postTreeNode),
    };
  }
  const post = group.posts[0];
  return post ? postTreeNode(post) : null;
};

/**
 * Adapt the sidebar's render tree to the structural {@link TreeNode} the shared
 * drag engine indexes (`@/lib/tree`). The two shapes differ only in encoding —
 * this one discriminates on `type`, embeds a series' posts, and models a
 * standalone post as a one-element array — so the mapping is mechanical.
 */
export const rootItemsToTreeNodes = (items: RootItem[]): TreeNode[] =>
  items.flatMap((item): TreeNode[] => {
    if (item.type === "project") {
      return [{
        kind: "project",
        id: item.project.id,
        label: item.project.title,
        children: item.children.flatMap((child) => {
          const node = groupTreeNode(child);
          return node ? [node] : [];
        }),
      }];
    }
    const node = groupTreeNode(item);
    return node ? [node] : [];
  });

/**
 * Build a Map of series ID to Series object from an array of Series
 */
export const buildSeriesMap = (seriesList: Series[]): Map<string, Series> => {
  const map = new Map<string, Series>();
  seriesList.forEach((series) => {
    map.set(series.id, series);
  });
  return map;
};
