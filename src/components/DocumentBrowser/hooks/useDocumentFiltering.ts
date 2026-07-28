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
  const regularDocuments = useMemo(
    () =>
      documents.filter((doc) => {
        const docData = doc;
        return docData?.type === "DOCUMENT";
      }),
    [documents],
  );

  return { regularDocuments };
};
