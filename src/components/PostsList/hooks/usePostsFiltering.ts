"use client";
import { useSelector } from "@/store";
import { useMemo } from "react";
import { UserDocument } from "@/types";

/**
 * Hook to filter documents for all posts (regardless of published status)
 */
export const usePostsFiltering = () => {
  const documents = useSelector((state) => state.documents);

  const filteredPosts = useMemo(() => {
    // Show all documents that are DOCUMENT type (i.e., posts/articles)
    return documents.filter((doc) => {
      const docData = doc.cloud || doc.local;
      return docData?.type === "DOCUMENT";
    });
  }, [documents]);

  return {
    allPosts: filteredPosts,
    totalCount: filteredPosts.length,
  };
};
