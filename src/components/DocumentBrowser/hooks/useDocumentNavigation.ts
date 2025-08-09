"use client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

interface UseDocumentNavigationProps {
  directoryId?: string;
  domainId?: string;
  domainInfo?: any; // Domain information including slug
}

/**
 * Custom hook for document navigation actions
 * Encapsulates URL construction logic and provides consistent navigation
 */
export const useDocumentNavigation = (
  { directoryId, domainId, domainInfo }: UseDocumentNavigationProps,
) => {
  const router = useRouter();

  const createDocument = useCallback(() => {
    let url = "/new";
    const params = new URLSearchParams();

    if (directoryId) {
      params.append("parentId", directoryId);
    }

    if (domainInfo) {
      params.append("domain", domainInfo.id);
    }

    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    router.push(url);
  }, [router, directoryId, domainInfo]);

  const createDirectory = useCallback(() => {
    let url = "/new-directory";
    const params = new URLSearchParams();

    if (directoryId) {
      url += `/${directoryId}`;
    }

    if (domainInfo) {
      params.append("domain", domainInfo.id);
      params.append("domainSlug", domainInfo.slug);
    }

    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    router.push(url);
  }, [router, directoryId, domainInfo]);

  return {
    createDocument,
    createDirectory,
  };
};
