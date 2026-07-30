import { Post, Project, Series } from "@/types";
import { comparePostsByRank, rankOf } from "@/lib/documentOrder";
import { compareRankThenId } from "@/lib/ordering";

/**
 * Represents either a series group (with posts) or a standalone post
 */
export interface SeriesGroupItem {
  type: "series" | "standalone";
  /** For series: the series object. For standalone: undefined */
  series?: Series;
  /** For series: posts in the series. For standalone: single post array */
  posts: Post[];
  /** Sort key timestamp for ordering groups/posts together */
  sortKey: number;
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
 * Get the series ID from a Post
 */
export const getPostSeriesId = (doc: Post): string | null => {
  return doc.seriesId ?? null;
};

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

/**
 * Get the creation date timestamp from a Post
 */
const getPostCreatedAtTime = (doc: Post): number => {
  const createdAt = doc.createdAt;
  return createdAt ? new Date(createdAt).getTime() : 0;
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
 * Order standalone posts and series in one shared rank space (ascending),
 * matching the interleaved root list on /posts (see PostsListView). Unranked
 * groups sort last; ties break by id so the result is total and stable.
 */
const compareGroupsByRank = (
  a: SeriesGroupItem,
  b: SeriesGroupItem,
): number =>
  compareRankThenId(groupRank(a), groupId(a), groupRank(b), groupId(b));

/**
 * Get the creation date timestamp from a Series
 */
export const getSeriesCreatedAtTime = (series: Series): number => {
  return series.createdAt ? new Date(series.createdAt).getTime() : 0;
};

/**
 * Group posts by series and return a mixed list of series groups and standalone posts,
 * sorted by their respective creation times (newest first).
 *
 * - Uses series.posts from seriesMap as the authoritative source for series posts
 * - Only posts NOT in any series are added as standalone posts
 * - Series groups are sorted by series.createdAt
 * - Standalone posts (no series) are sorted by post.createdAt
 * - The final list interleaves series groups and standalone posts by their sort keys
 *
 * @param posts - Array of Post posts (used only for standalone posts)
 * @param seriesMap - Map of series ID to Series object (series.posts is the source of truth)
 * @returns Array of SeriesGroupItem sorted by creation time (newest first)
 */
export const groupPostsBySeries = (
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
        sortKey: getSeriesCreatedAtTime(series),
      });
    }
  });

  // Add standalone posts (posts not in any series)
  posts.forEach((post) => {
    if (!seriesPostIds.has(post.id)) {
      result.push({
        type: "standalone",
        posts: [post],
        sortKey: getPostCreatedAtTime(post),
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
export const groupPostsBySeriesWithEmpty = (
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
        sortKey: getSeriesCreatedAtTime(series),
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
 * Flatten the root tree back to series/standalone groups in render order —
 * each project replaced in place by its children. Used where a flat, project-
 * agnostic list of groups is needed (the compact rail, drag sibling lists).
 */
export const flattenRootItems = (items: RootItem[]): SeriesGroupItem[] =>
  items.flatMap((item) => (item.type === "project" ? item.children : [item]));

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
