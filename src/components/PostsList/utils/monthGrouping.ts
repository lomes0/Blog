import { UserDocument } from "@/types";
import { formatMonthHeader, getMonthKey } from "./dateHelpers";
import { getPostCreatedAt, sortPostsByDate } from "./postHelpers";

// Import the MonthGroup type
import type { MonthGroup } from "../components/MonthSection";

/**
 * Group posts by month/year based on createdAt field
 * @param posts - Array of UserDocument posts
 * @returns Array of MonthGroup objects sorted by most recent months first
 */
export const groupPostsByMonth = (posts: UserDocument[]): MonthGroup[] => {
  const groups = new Map<string, UserDocument[]>();

  posts.forEach((post) => {
    const createdAt = getPostCreatedAt(post);
    if (!createdAt) return; // Skip posts without creation date

    const monthKey = getMonthKey(createdAt);

    if (!groups.has(monthKey)) {
      groups.set(monthKey, []);
    }
    groups.get(monthKey)!.push(post);
  });

  return Array.from(groups.entries())
    .map(([monthKey, posts]) => ({
      monthKey,
      monthLabel: formatMonthHeader(new Date(monthKey + "-01")),
      posts: sortPostsByDate(posts), // Sort posts within each month by date desc
      count: posts.length,
    }))
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey)); // Most recent months first
};
