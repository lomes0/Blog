import { useMemo } from "react";
import { UserDocument } from "@/types";
import { getPostCreatedAt } from "../utils/postHelpers";

export type TimeFilterValue = 
  | "all" 
  | "thisYear" 
  | "thisMonth" 
  | "lastMonth" 
  | "last3Months" 
  | "last6Months";

interface UsePostsTimeFilterProps {
  posts: UserDocument[];
  timeFilter: TimeFilterValue;
}

interface UsePostsTimeFilterReturn {
  filteredPosts: UserDocument[];
  filterStats: {
    total: number;
    filtered: number;
    filterLabel: string;
  };
}

/**
 * Custom hook for filtering posts by time periods
 * Supports various predefined time ranges
 */
export const usePostsTimeFilter = ({
  posts,
  timeFilter,
}: UsePostsTimeFilterProps): UsePostsTimeFilterReturn => {
  const filteredPosts = useMemo(() => {
    if (timeFilter === "all") {
      return posts;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Calculate date ranges
    const getDateRange = () => {
      switch (timeFilter) {
        case "thisYear":
          return {
            start: new Date(currentYear, 0, 1), // January 1st
            end: new Date(currentYear, 11, 31, 23, 59, 59), // December 31st
          };
        case "thisMonth":
          return {
            start: new Date(currentYear, currentMonth, 1), // First day of current month
            end: new Date(currentYear, currentMonth + 1, 0, 23, 59, 59), // Last day of current month
          };
        case "lastMonth":
          const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
          const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
          return {
            start: new Date(lastMonthYear, lastMonth, 1),
            end: new Date(lastMonthYear, lastMonth + 1, 0, 23, 59, 59),
          };
        case "last3Months":
          return {
            start: new Date(currentYear, currentMonth - 3, 1),
            end: now,
          };
        case "last6Months":
          return {
            start: new Date(currentYear, currentMonth - 6, 1),
            end: now,
          };
        default:
          return null;
      }
    };

    const dateRange = getDateRange();
    if (!dateRange) return posts;

    return posts.filter((post) => {
      const createdAt = getPostCreatedAt(post);
      if (!createdAt) return false;

      return createdAt >= dateRange.start && createdAt <= dateRange.end;
    });
  }, [posts, timeFilter]);

  const filterStats = useMemo(() => {
    const filterLabels: Record<TimeFilterValue, string> = {
      all: "All Time",
      thisYear: "This Year",
      thisMonth: "This Month", 
      lastMonth: "Last Month",
      last3Months: "Last 3 Months",
      last6Months: "Last 6 Months",
    };

    return {
      total: posts.length,
      filtered: filteredPosts.length,
      filterLabel: filterLabels[timeFilter],
    };
  }, [posts.length, filteredPosts.length, timeFilter]);

  return {
    filteredPosts,
    filterStats,
  };
};
