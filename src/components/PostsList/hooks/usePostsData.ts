import { useSelector } from "@/store";
import { UserDocument } from "@/types";
import { useState } from "react";

// Import custom hooks
import { usePostsFiltering } from "./usePostsFiltering";
import { usePostsGrouping } from "./usePostsGrouping";
import { usePostsSearch } from "./usePostsSearch";
import { TimeFilterValue, usePostsTimeFilter } from "./usePostsTimeFilter";

// Import the MonthGroup type from components
import type { MonthGroup } from "../components/MonthSection";

interface UsePostsDataReturn {
  monthGroups: MonthGroup[];
  loading: boolean;
  totalCount: number;
  filteredCount: number;
  allPosts: UserDocument[];
  // Search and filter states
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  timeFilter: TimeFilterValue;
  setTimeFilter: (filter: TimeFilterValue) => void;
  // Filter stats
  hasActiveFilters: boolean;
  searchResults: {
    total: number;
    hasResults: boolean;
  };
}

/**
 * Custom hook to fetch and organize all posts data by month with search and filtering
 * Shows all documents regardless of published status
 */
export const usePostsData = (): UsePostsDataReturn => {
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilterValue>("all");

  // Use custom filtering hook to get all posts
  const { allPosts, totalCount } = usePostsFiltering();

  // Apply time filter first
  const { filteredPosts: timeFilteredPosts } = usePostsTimeFilter({
    posts: allPosts,
    timeFilter,
  });

  // Apply search filter
  const { filteredPosts: searchFilteredPosts, searchResults } = usePostsSearch({
    posts: timeFilteredPosts,
    searchQuery,
  });

  // Use custom grouping hook for month-based organization
  const { monthGroups } = usePostsGrouping({ posts: searchFilteredPosts });

  // Calculate filter stats
  const filteredCount = searchFilteredPosts.length;
  const hasActiveFilters = searchQuery.trim() !== "" || timeFilter !== "all";

  return {
    monthGroups,
    loading: false, // TODO: Add actual loading state in future steps
    totalCount,
    filteredCount,
    allPosts,
    // Search and filter states
    searchQuery,
    setSearchQuery,
    timeFilter,
    setTimeFilter,
    // Filter stats
    hasActiveFilters,
    searchResults,
  };
};
