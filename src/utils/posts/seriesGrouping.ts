import { Post, Project, Series } from "@/types";
import { comparePostsByRank, rankOf } from "@/lib/documentOrder";
import { compareRankThenId } from "@/lib/ordering";
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
 * series groups assigned to it (`series.projectId`), ordered by rank within the
 * project.
 */
export interface ProjectGroupItem {
  type: "project";
  project: Project;
  /** Member series groups, ordered by rank within the project. */
  children: SeriesGroupItem[];
}

/**
 * A top-level entry in the author's root list as rendered by the sidebar: a
 * project, an ungrouped series, or a standalone post. Projects, ungrouped series
 * and standalone posts share one rank space, so they interleave (see
 * {@link groupRootItems}).
 */
export type RootItem = ProjectGroupItem | SeriesGroupItem;

/**
 * A post's 1-based position within its series, derived from the manual `rank`
 * ordering of the series' posts (replaces the former stored `seriesOrder`).
 * Returns null if the doc isn't found in the series.
 */
export const seriesPositionOf = (
  series: Series | null | undefined,
  docId: string,
): number | null => {
  if (!series?.posts?.length) return null;
  const ordered = [...series.posts].sort((a, b) => {
    const ar = a.rank ?? "";
    const br = b.rank ?? "";
    return ar < br ? -1 : ar > br ? 1 : a.id < b.id ? -1 : 1;
  });
  const idx = ordered.findIndex((p) => p.id === docId);
  return idx === -1 ? null : idx + 1;
};

/** The rank governing a group's position in the interleaved root list. */
const groupRank = (item: SeriesGroupItem): string | null =>
  item.type === "series"
    ? (item.series?.rank ?? null)
    : (item.posts[0] ? rankOf(item.posts[0]) : null);

/** Stable tie-breaker id for a group when ranks are equal or absent. */
const groupId = (item: SeriesGroupItem): string =>
  item.type === "series" ? (item.series?.id ?? "") : (item.posts[0]?.id ?? "");

/**
 * Order standalone posts and series in one shared rank space (ascending) — the
 * same space /posts ranks them in (see PostsListView), so the two surfaces agree
 * on order even though each splits the result into its own sections. Unranked
 * groups sort last; ties break by id so the result is total and stable.
 */
const compareGroupsByRank = (
  a: SeriesGroupItem,
  b: SeriesGroupItem,
): number =>
  compareRankThenId(groupRank(a), groupId(a), groupRank(b), groupId(b));

/**
 * Group posts by series and return a mixed list of series groups and standalone
 * posts, interleaved in one shared rank space (see {@link compareGroupsByRank}).
 *
 * - Uses series.posts from seriesMap as the authoritative source for series posts
 * - Only posts NOT in any series are added as standalone posts
 * - A series with no post in this partition is dropped
 *
 * @param posts - Array of Post posts (used only for standalone posts)
 * @param seriesMap - Map of series ID to Series object (series.posts is the source of truth)
 * @returns Array of SeriesGroupItem in manual (rank) order
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

      // Prefer the store's copy of each post — it carries anything loaded since
      // the series was fetched (content, fresher rank) — and fall back to the
      // copy embedded in the series.
      const seriesPosts: Post[] = series.posts.map((post) =>
        postsByIdMap.get(post.id) ?? post
      );

      const sortedPosts = [...seriesPosts].sort(comparePostsByRank);

      result.push({
        type: "series",
        series,
        posts: sortedPosts,
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

  // Interleave standalone posts and series by their manual rank.
  result.sort(compareGroupsByRank);

  return result;
};

/**
 * Like groupPostsBySeries but also includes series that have no posts in the
 * current partition. Standalone posts and series are interleaved in one shared
 * rank space (matching the /posts root list), so manual reordering on /posts is
 * reflected here.
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
  return [...baseGroups, ...emptyGroups].sort(compareGroupsByRank);
};

/** The rank governing a root item's position in the interleaved root list. */
const rootItemRank = (item: RootItem): string | null =>
  item.type === "project" ? (item.project.rank ?? null) : groupRank(item);

/** Stable tie-breaker id for a root item when ranks are equal or absent. */
const rootItemId = (item: RootItem): string =>
  item.type === "project" ? item.project.id : groupId(item);

/**
 * Order projects, ungrouped series and standalone posts in one shared rank space
 * (ascending) — the same space the server ranks them in, so drag-reorder and
 * this view agree. Unranked entries sort last; ties break by id.
 */
const compareRootItemsByRank = (a: RootItem, b: RootItem): number =>
  compareRankThenId(
    rootItemRank(a),
    rootItemId(a),
    rootItemRank(b),
    rootItemId(b),
  );

/**
 * Build the sidebar's nested root tree: projects (each wrapping its member series
 * groups), ungrouped series and standalone posts, interleaved by rank.
 *
 * Starts from {@link groupPostsBySeriesWithEmpty} (flat series groups + standalone
 * posts, empty series included), then lifts every series whose `projectId` names
 * a known project into that project's `children`. A series pointing at an unknown
 * project (e.g. projects not yet loaded) falls back to the root list, so the tree
 * degrades gracefully and matches the "ungrouped renders inline at root" rule.
 *
 * @param posts - Standalone-post source (series posts come from seriesMap).
 * @param seriesMap - Series ID → Series (series.posts is authoritative).
 * @param projects - The author's projects, in any order (sorted here by rank).
 * @returns Root items sorted by their shared rank (newest manual order).
 */
export const groupRootItems = (
  posts: Post[],
  seriesMap: Map<string, Series>,
  projects: Project[],
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

  const projectItems: RootItem[] = projects.map((project) => ({
    type: "project",
    project,
    children: (membersByProject.get(project.id) ?? []).sort(
      compareGroupsByRank,
    ),
  }));

  return [...projectItems, ...rootGroups].sort(compareRootItemsByRank);
};

/**
 * Split the rank-ordered root list into the two sections the sidebar renders:
 * standalone posts ("Notes"), then projects and ungrouped series ("Projects").
 * The shared rank space is untouched — each section is a rank-sorted subset of
 * it, so drag-reorder still agrees with the server.
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
  rank: rankOf(post),
  label: post.name,
});

/** A series group, or the lone post a standalone group wraps. */
const groupTreeNode = (group: SeriesGroupItem): TreeNode | null => {
  if (group.type === "series" && group.series) {
    return {
      kind: "series",
      id: group.series.id,
      rank: group.series.rank ?? null,
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
        rank: item.project.rank ?? null,
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
