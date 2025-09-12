import { useMemo } from "react";
import { UserDocument } from "@/types";
import { PartitionGranularity, TimeGroup } from "@/types/partitioning";
import { groupPostsByMonth } from "../utils/monthGrouping";
import { getGroupingFunction } from "../utils/timeGrouping";
import type { MonthGroup } from "../components/MonthSection";

interface UsePostsGroupingProps {
  posts: UserDocument[];
  granularity?: PartitionGranularity;
}

interface UsePostsGroupingReturn {
  monthGroups: MonthGroup[]; // Backward compatibility
  timeGroups: TimeGroup[]; // New flexible groups
  totalCount: number;
  granularity: PartitionGranularity;
}

/**
 * Custom hook for flexible time-based grouping logic
 * Transforms flat posts array into time-grouped structure based on granularity
 * Maintains backward compatibility with month-based grouping
 */
export const usePostsGrouping = ({
  posts,
  granularity = "month",
}: UsePostsGroupingProps): UsePostsGroupingReturn => {
  const { monthGroups, timeGroups, totalCount } = useMemo(() => {
    // Always provide month groups for backward compatibility
    const monthGroups = groupPostsByMonth(posts);

    // Provide flexible time groups based on granularity
    const groupingFunction = getGroupingFunction(granularity);
    const timeGroups = groupingFunction(posts);

    const totalCount = posts.length;

    return { monthGroups, timeGroups, totalCount };
  }, [posts, granularity]);

  return {
    monthGroups,
    timeGroups,
    totalCount,
    granularity,
  };
};
