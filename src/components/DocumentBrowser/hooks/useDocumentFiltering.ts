"use client";
import { useMemo } from "react";
import { Post } from "@/types";

interface UseDocumentFilteringProps {
  documents: Post[];
}

/**
 * Custom hook to filter posts for blog structure
 */
export const useDocumentFiltering = ({
  documents,
}: UseDocumentFilteringProps) => {
  // Every document *is* a post: the `type` discriminator had one value and is
  // gone (docs/plans/schema-organization.md §D), so the filter it fed matched
  // everything. Kept as a memo of the same list rather than deleted outright,
  // because the caller's prop is what names it "regular".
  const regularDocuments = useMemo(() => documents, [documents]);

  return { regularDocuments };
};
