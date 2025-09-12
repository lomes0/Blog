import { useSelector } from "@/store";
import { UserDocument } from "@/types";
import { PartitionGranularity, TimeGroup } from "@/types/partitioning";
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
  timeGroups: TimeGroup[]; // New flexible groups
  loading: boolean;
  totalCount: number;
  filteredCount: number;
  allPosts: UserDocument[];
  // Search and filter states
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  timeFilter: TimeFilterValue;
  setTimeFilter: (filter: TimeFilterValue) => void;
  // Partitioning control
  granularity: PartitionGranularity;
  setGranularity: (granularity: PartitionGranularity) => void;
  // Filter stats
  hasActiveFilters: boolean;
  searchResults: {
    total: number;
    hasResults: boolean;
  };
}

/**
 * Custom hook to fetch and organize all posts data with flexible partitioning
 * Shows all documents regardless of published status
 * Supports day, week, month, and year partitioning
 */
export const usePostsData = (): UsePostsDataReturn => {
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilterValue>("all");
  const [granularity, setGranularity] = useState<PartitionGranularity>("month");

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

  // Use flexible grouping hook with granularity support
  const { monthGroups, timeGroups } = usePostsGrouping({
    posts: searchFilteredPosts,
    granularity,
  });

  // Calculate filter stats
  const filteredCount = searchFilteredPosts.length;
  const hasActiveFilters = searchQuery.trim() !== "" || timeFilter !== "all";

  return {
    monthGroups,
    timeGroups,
    loading: false, // TODO: Add actual loading state in future steps
    totalCount,
    filteredCount,
    allPosts,
    // Search and filter states
    searchQuery,
    setSearchQuery,
    timeFilter,
    setTimeFilter,
    // Partitioning control
    granularity,
    setGranularity,
    // Filter stats
    hasActiveFilters,
    searchResults,
  };
};
