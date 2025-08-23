"use client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

interface UseDocumentNavigationProps {
  // No props needed for simplified blog structure
}

/**
 * Custom hook for blog post navigation actions
 * Simplified for blog structure without directories or domains
 */
export const useDocumentNavigation = (
  {}: UseDocumentNavigationProps = {},
) => {
  const router = useRouter();

  const createDocument = useCallback(() => {
    // In blog structure, just navigate to new post creation
    router.push("/new");
  }, [router]);

  const createDirectory = useCallback(() => {
    // No directories in blog structure, so this does nothing
    // Keep for compatibility but don't navigate anywhere
    console.warn("Directory creation not supported in blog structure");
  }, []);

  return {
    createDocument,
    createDirectory,
  };
};
