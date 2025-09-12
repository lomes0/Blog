import { UserDocument } from "@/types";
import { PartitionGranularity, TimeGroup } from "@/types/partitioning";
import { formatTimeHeader, getTimeKey } from "./dateHelpers";
import { getPostCreatedAt, sortPostsByDate } from "./postHelpers";

/**
 * Group posts by time period based on granularity
 * @param posts - Array of UserDocument posts
 * @param granularity - Time period granularity (day, week, month, year)
 * @returns Array of TimeGroup objects sorted by most recent periods first
 */
export const groupPostsByTime = (
  posts: UserDocument[],
  granularity: PartitionGranularity = "month"
): TimeGroup[] => {
  const groups = new Map<string, UserDocument[]>();

  posts.forEach((post) => {
    const createdAt = getPostCreatedAt(post);
    if (!createdAt) return; // Skip posts without creation date

    const timeKey = getTimeKey(createdAt, granularity);

    if (!groups.has(timeKey)) {
      groups.set(timeKey, []);
    }
    groups.get(timeKey)!.push(post);
  });

  return Array.from(groups.entries())
    .map(([timeKey, posts]) => ({
      timeKey,
      timeLabel: formatTimeHeader(timeKey, granularity),
      posts: sortPostsByDate(posts), // Sort posts within each group by date desc
      count: posts.length,
      granularity,
    }))
    .sort((a, b) => b.timeKey.localeCompare(a.timeKey)); // Most recent periods first
};

/**
 * Group posts by day based on createdAt field
 * @param posts - Array of UserDocument posts
 * @returns Array of TimeGroup objects sorted by most recent days first
 */
export const groupPostsByDay = (posts: UserDocument[]): TimeGroup[] => {
  return groupPostsByTime(posts, "day");
};

/**
 * Group posts by week based on createdAt field
 * @param posts - Array of UserDocument posts
 * @returns Array of TimeGroup objects sorted by most recent weeks first
 */
export const groupPostsByWeek = (posts: UserDocument[]): TimeGroup[] => {
  return groupPostsByTime(posts, "week");
};

/**
 * Group posts by month/year based on createdAt field (existing functionality)
 * @param posts - Array of UserDocument posts
 * @returns Array of TimeGroup objects sorted by most recent months first
 */
export const groupPostsByMonth = (posts: UserDocument[]): TimeGroup[] => {
  return groupPostsByTime(posts, "month");
};

/**
 * Group posts by year based on createdAt field
 * @param posts - Array of UserDocument posts
 * @returns Array of TimeGroup objects sorted by most recent years first
 */
export const groupPostsByYear = (posts: UserDocument[]): TimeGroup[] => {
  return groupPostsByTime(posts, "year");
};

/**
 * Group posts by quarter based on createdAt field
 * @param posts - Array of UserDocument posts
 * @returns Array of TimeGroup objects sorted by most recent quarters first
 */
export const groupPostsByQuarter = (posts: UserDocument[]): TimeGroup[] => {
  return groupPostsByTime(posts, "quarter");
};

/**
 * Group posts by half-year based on createdAt field
 * @param posts - Array of UserDocument posts
 * @returns Array of TimeGroup objects sorted by most recent half-years first
 */
export const groupPostsByHalfYear = (posts: UserDocument[]): TimeGroup[] => {
  return groupPostsByTime(posts, "halfyear");
};

/**
 * Get the appropriate grouping function based on granularity
 * @param granularity - Time period granularity
 * @returns Grouping function
 */
export const getGroupingFunction = (
  granularity: PartitionGranularity
): ((posts: UserDocument[]) => TimeGroup[]) => {
  switch (granularity) {
    case "day":
      return groupPostsByDay;
    case "week":
      return groupPostsByWeek;
    case "month":
      return groupPostsByMonth;
    case "quarter":
      return groupPostsByQuarter;
    case "halfyear":
      return groupPostsByHalfYear;
    case "year":
      return groupPostsByYear;
    default:
      return groupPostsByMonth; // Default to month
  }
};
