"use client";
import { useCallback, useEffect, useState } from "react";
import { Post } from "@/types";
import { apiClient } from "@/api";

interface UseDocumentsResult {
  documents: Post[];
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Hook for managing documents with server-side initial data and client-side refresh.
 *
 * `GET /api/documents` is signed-in only, so refreshing is too: a logged-out
 * visitor keeps the server-rendered list, which is the same published content
 * the endpoint would return and does not change while they sit on the page.
 * Refreshing anyway would just 401 on every window focus.
 *
 * @param initialDocuments - Server-rendered documents for instant first paint
 * @param enabled - Whether the session may call the API; false for guests
 * @returns documents state, loading state, and refresh function
 */
export function useDocuments(
  initialDocuments: Post[],
  enabled: boolean,
): UseDocumentsResult {
  const [documents, setDocuments] = useState<Post[]>(initialDocuments);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      // First page only: this drives a "recent posts" preview, so paging to the
      // end would fetch the author's entire library to show eight cards.
      const page = await apiClient.documents.list();
      if (page) setDocuments(page.documents);
    } catch (error) {
      console.error("Failed to refresh documents:", error);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    // Refresh when window gains focus (user returns to tab)
    const handleFocus = () => refresh();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [enabled, refresh]);

  return {
    documents,
    loading,
    refresh,
  };
}
