import { Series, UserDocument } from "@/types";
import { PartitionGranularity } from "@/types/partitioning";
import { formatTimeHeader, getTimeKey } from "./dateHelpers";

/**
 * Represents either a series group (with posts) or a standalone post
 */
export interface SeriesGroupItem {
  type: "series" | "standalone";
  /** For series: the series object. For standalone: undefined */
  series?: Series;
  /** For series: posts in the series. For standalone: single post array */
  posts: UserDocument[];
  /** Sort key timestamp for ordering groups/posts together */
  sortKey: number;
}

/**
 * Get the series ID from a UserDocument
 */
export const getPostSeriesId = (doc: UserDocument): string | null => {
  return doc.cloud?.seriesId || doc.local?.seriesId || null;
};

/**
 * Get the series order from a UserDocument
 */
export const getPostSeriesOrder = (doc: UserDocument): number | null => {
  return doc.cloud?.seriesOrder ?? doc.local?.seriesOrder ?? null;
};

/**
 * Get the creation date timestamp from a UserDocument
 */
const getPostCreatedAtTime = (doc: UserDocument): number => {
  const createdAt = doc.cloud?.createdAt || doc.local?.createdAt;
  return createdAt ? new Date(createdAt).getTime() : 0;
};

const sortPostsByCreatedAtDesc = (posts: UserDocument[]): UserDocument[] =>
  [...posts].sort((a, b) => getPostCreatedAtTime(b) - getPostCreatedAtTime(a));

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
 * @param posts - Array of UserDocument posts (used only for standalone posts)
 * @param seriesMap - Map of series ID to Series object (series.posts is the source of truth)
 * @returns Array of SeriesGroupItem sorted by creation time (newest first)
 */
export const groupPostsBySeries = (
  posts: UserDocument[],
  seriesMap: Map<string, Series>,
): SeriesGroupItem[] => {
  // Build a set of post IDs actually present in this partition
  const postIdsInPartition = new Set(posts.map((p) => p.id));

  // Build a map from post ID to full UserDocument (preserves local draft info)
  const postsByIdMap = new Map<string, UserDocument>(
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

      // Convert series posts to UserDocument format, reusing the full UserDocument
      // (with both local and cloud) when available so the dirty indicator works correctly
      const seriesPosts: UserDocument[] = series.posts.map((post) =>
        postsByIdMap.get(post.id) ?? { id: post.id, cloud: post }
      );

      const sortedPosts = sortPostsByCreatedAtDesc(seriesPosts);

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

  // Sort all items by sortKey (newest first)
  result.sort((a, b) => b.sortKey - a.sortKey);

  return result;
};

/**
 * Like groupPostsBySeries but also includes series that have no posts in the
 * current partition, appending them as empty groups sorted by creation time.
 */
export const groupPostsBySeriesWithEmpty = (
  posts: UserDocument[],
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
  if (!emptyGroups.length) return baseGroups;
  return [...baseGroups, ...emptyGroups].sort((a, b) => b.sortKey - a.sortKey);
};

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

/**
 * Flatten grouped items back to a sorted array of posts
 * Useful when you need a flat list but with series posts grouped together
 */
export const flattenGroupedPosts = (
  groups: SeriesGroupItem[],
): UserDocument[] => {
  return groups.flatMap((group) => group.posts);
};

/**
 * Ensure time groups include partitions for series creation dates
 * This creates empty partitions for time periods where a series was created
 * even if no posts were created in that period
 * @param timeGroups - Existing time groups from posts
 * @param seriesMap - Map of series
 * @param granularity - Time granularity
 * @returns Time groups including partitions for series creation dates
 */
export const ensureSeriesPartitions = <
  T extends { timeKey: string; granularity: string; posts: UserDocument[] },
>(
  timeGroups: T[],
  seriesMap: Map<string, Series>,
  granularity: PartitionGranularity,
): T[] => {
  const existingTimeKeys = new Set(timeGroups.map((g) => g.timeKey));
  const newPartitions: T[] = [];

  // Check each series to see if we need to create a partition for it
  seriesMap.forEach((series) => {
    if (series.createdAt) {
      const seriesCreatedAt = new Date(series.createdAt);
      const timeKey = getTimeKey(seriesCreatedAt, granularity);

      // If this partition doesn't exist yet, create it
      if (!existingTimeKeys.has(timeKey)) {
        newPartitions.push({
          timeKey,
          timeLabel: formatTimeHeader(timeKey, granularity),
          posts: [],
          count: 0,
          granularity,
        } as unknown as T);
        existingTimeKeys.add(timeKey);
      }
    }
  });

  // Merge and sort all partitions
  return [...timeGroups, ...newPartitions]
    .sort((a, b) => b.timeKey.localeCompare(a.timeKey));
};

/**
 * Deduplicate series across time partitions by consolidating all posts
 * of a series into the partition corresponding to the series creation time.
 *
 * This solves the problem where a series with posts spanning multiple time periods
 * would appear in each period with only the posts from that period, creating
 * multiple fragmented series cards instead of one unified card.
 *
 * Example scenario:
 * - Series "Web Dev Basics" created in Q1 2025, has 4 posts:
 *   - Post 1 (Jan 2025, Q1)
 *   - Post 2 (Feb 2025, Q1)
 *   - Post 3 (May 2025, Q2)
 *   - Post 4 (Aug 2025, Q3)
 *
 * Without deduplication (old behavior):
 * - Q1 2025: Series card with Posts 1, 2
 * - Q2 2025: Series card with Post 3
 * - Q3 2025: Series card with Post 4
 *
 * With deduplication (current behavior):
 * - Q1 2025: Series card with ALL Posts 1, 2, 3, 4 (because series was created in Q1)
 * - Q2 2025: (no series card)
 * - Q3 2025: (no series card)
 *
 * This ensures that:
 * 1. Each series appears only once across all partitions
 * 2. The series card appears in the partition matching series.createdAt
 * 3. The series card contains ALL posts from that series (not just from that time period)
 * 4. Individual posts from the series don't appear in later partitions
 * 5. Standalone posts (not in a series) continue to appear in their respective partitions
 *
 * @param timeGroups - Array of time groups with posts (sorted by time, newest first)
 * @param allPosts - All available posts to get complete series data
 * @param seriesMap - Map of series ID to Series object for metadata lookup
 * @returns Modified time groups with deduplicated series
 */
export const deduplicateSeriesAcrossPartitions = <
  T extends { posts: UserDocument[]; timeKey: string; granularity: string },
>(
  timeGroups: T[],
  allPosts: UserDocument[],
  seriesMap: Map<string, Series>,
): T[] => {
  // Track which series IDs we've already placed in a partition
  const placedSeries = new Set<string>();

  // Build a map of seriesId -> all posts in that series (from allPosts)
  const seriesAllPostsMap = new Map<string, UserDocument[]>();
  allPosts.forEach((post) => {
    const seriesId = getPostSeriesId(post);
    if (seriesId) {
      if (!seriesAllPostsMap.has(seriesId)) {
        seriesAllPostsMap.set(seriesId, []);
      }
      seriesAllPostsMap.get(seriesId)!.push(post);
    }
  });

  // Sort posts within each series by seriesOrder and deduplicate by ID
  seriesAllPostsMap.forEach((posts, seriesId) => {
    // Remove duplicates by post ID
    const uniquePosts = Array.from(
      new Map(posts.map((post) => [post.id, post])).values(),
    );

    seriesAllPostsMap.set(seriesId, sortPostsByCreatedAtDesc(uniquePosts));
  });

  // Build a map of seriesId -> correct timeKey based on series.createdAt
  // Only include series whose creation time partition exists in the filtered results
  const seriesToTimeKeyMap = new Map<string, string>();
  const availableTimeKeys = new Set(timeGroups.map((g) => g.timeKey));

  seriesMap.forEach((series, seriesId) => {
    const seriesCreatedAt = series.createdAt
      ? new Date(series.createdAt)
      : null;
    if (seriesCreatedAt) {
      // Get the time key for this series based on its creation date and granularity
      // Use the granularity from the first timeGroup (they all have the same granularity)
      const granularity = timeGroups.length > 0
        ? timeGroups[0].granularity as PartitionGranularity
        : "month";
      const idealTimeKey = getTimeKey(seriesCreatedAt, granularity);

      // Only show series card if its natural partition exists in the filtered results
      // This prevents showing series in wrong time periods (e.g., 2024 series in 2026 partition)
      if (availableTimeKeys.has(idealTimeKey)) {
        seriesToTimeKeyMap.set(seriesId, idealTimeKey);
      }
      // If partition doesn't exist, series posts will appear as standalone posts
    }
  });

  // Process each time group
  return timeGroups.map((group, groupIndex) => {
    const newPosts: UserDocument[] = [];
    const addedPostIds = new Set<string>(); // Track added post IDs to avoid duplicates

    // First, add standalone posts from this partition
    group.posts.forEach((post) => {
      const seriesId = getPostSeriesId(post);
      if (!seriesId && !addedPostIds.has(post.id)) {
        // Standalone post - include it
        newPosts.push(post);
        addedPostIds.add(post.id);
      }
    });

    // Then, add series that belong to this partition based on series.createdAt
    seriesAllPostsMap.forEach((allSeriesPosts, seriesId) => {
      if (placedSeries.has(seriesId)) {
        return; // Already placed this series in another partition
      }

      const seriesTimeKey = seriesToTimeKeyMap.get(seriesId);
      if (seriesTimeKey === group.timeKey) {
        // This series belongs to this partition
        allSeriesPosts.forEach((seriesPost) => {
          if (!addedPostIds.has(seriesPost.id)) {
            newPosts.push(seriesPost);
            addedPostIds.add(seriesPost.id);
          }
        });
        placedSeries.add(seriesId);
      }
    });

    // Collect zero-post series for this partition.
    // A zero-post series is one present in seriesMap but absent from seriesAllPostsMap.
    // It goes into the partition that matches its createdAt, or falls back to the
    // latest (first) partition when no matching partition exists.
    const groupEmptySeries: Series[] = [];
    seriesMap.forEach((series, seriesId) => {
      if (placedSeries.has(seriesId)) return;
      if (seriesAllPostsMap.has(seriesId)) return; // has posts, handled above

      const seriesTimeKey = seriesToTimeKeyMap.get(seriesId);
      if (
        seriesTimeKey === group.timeKey ||
        (groupIndex === 0 && seriesTimeKey === undefined)
      ) {
        groupEmptySeries.push(series);
        placedSeries.add(seriesId);
      }
    });

    return {
      ...group,
      posts: newPosts,
      count: newPosts.length,
      ...(groupEmptySeries.length > 0 ? { emptySeries: groupEmptySeries } : {}),
    };
  });
};
