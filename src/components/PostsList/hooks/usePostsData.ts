import { useSelector } from "@/store";
import { UserDocument } from "@/types";

// Import custom hooks
import { usePostsFiltering } from "./usePostsFiltering";
import { usePostsGrouping } from "./usePostsGrouping";

// Import the MonthGroup type from components
import type { MonthGroup } from "../components/MonthSection";

interface UsePostsDataReturn {
  monthGroups: MonthGroup[];
  loading: boolean;
  totalCount: number;
  allPosts: UserDocument[];
}

/**
 * Custom hook to fetch and organize all posts data by month
 * Shows all documents regardless of published status
 */
export const usePostsData = (): UsePostsDataReturn => {
  // Use custom filtering hook to get all posts
  const { allPosts, totalCount } = usePostsFiltering();

  // Use custom grouping hook for month-based organization
  const { monthGroups } = usePostsGrouping({ posts: allPosts });

  return {
    monthGroups,
    loading: false, // TODO: Add actual loading state in future steps
    totalCount,
    allPosts,
  };
};
