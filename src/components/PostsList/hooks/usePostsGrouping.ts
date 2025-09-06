import { useMemo } from "react";
import { UserDocument } from "@/types";
import { groupPostsByMonth } from "../utils/monthGrouping";
import type { MonthGroup } from "../components/MonthSection";

interface UsePostsGroupingProps {
  posts: UserDocument[];
}

interface UsePostsGroupingReturn {
  monthGroups: MonthGroup[];
  totalCount: number;
}

/**
 * Custom hook for month-based grouping logic
 * Transforms flat posts array into month-grouped structure
 */
export const usePostsGrouping = ({
  posts,
}: UsePostsGroupingProps): UsePostsGroupingReturn => {
  const { monthGroups, totalCount } = useMemo(() => {
    const monthGroups = groupPostsByMonth(posts);
    const totalCount = posts.length;

    return { monthGroups, totalCount };
  }, [posts]);

  return {
    monthGroups,
    totalCount,
  };
};
