import { useMemo } from "react";
import { User } from "@/types";
import {
  createAuthorChip,
  createSeriesChip,
  createStatusChip,
  PostState,
} from "../PostChips";

/**
 * Options for controlling which metadata chips to display
 */
export interface PostMetaOptions {
  showAuthor?: boolean;
  showSeries?: boolean;
}

/**
 * Input parameters for the metadata hook
 */
export interface PostMetaInput {
  postState: PostState;
  author?: User | null;
  series?: any | null; // Using any for now to match existing series type
  seriesOrder?: number | null;
  options?: PostMetaOptions;
}

/**
 * Hook for managing post metadata chip generation
 *
 * This hook consolidates all the chip generation logic that was previously
 * handled by the renderPostChips function, making it more reusable and testable.
 *
 * @param input - The metadata input parameters
 * @returns Array of React elements representing the metadata chips
 */
export const usePostMeta = ({
  postState,
  author,
  series,
  seriesOrder,
  options = {},
}: PostMetaInput) => {
  const { showAuthor = true, showSeries = true } = options;

  return useMemo(() => {
    // Don't render chips during loading state - let the component handle loading UI
    if (postState.isLoading) {
      return [];
    }

    // Generate chips in the desired order
    const chips = [
      createStatusChip(postState),
      createSeriesChip(series, seriesOrder, showSeries),
      createAuthorChip(author, showAuthor),
    ].filter(Boolean); // Remove null/undefined chips

    return chips;
  }, [postState, author, series, seriesOrder, showAuthor, showSeries]);
};

/**
 * Return type for usePostMeta hook
 */
export type PostMetaHookResult = ReturnType<typeof usePostMeta>;
