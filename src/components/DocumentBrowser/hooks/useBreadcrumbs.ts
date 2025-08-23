"use client";
import { useMemo } from "react";
import { UserDocument } from "@/types";

interface BreadcrumbItem {
  id: string;
  name: string;
}

/**
 * Custom hook for breadcrumb navigation in blog structure
 * Returns empty array since we don't have directory navigation in blogs
 */
export const useBreadcrumbs = (
  directoryId: string | undefined,
  documents: UserDocument[],
): BreadcrumbItem[] => {
  return useMemo(() => {
    // In blog structure, we don't have directory navigation
    // So we always return an empty breadcrumb trail
    return [];
  }, []); // No dependencies needed since we always return empty array
};
