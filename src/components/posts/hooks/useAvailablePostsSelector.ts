"use client";
import { useEffect, useState } from "react";
import { Document } from "@/types";
import { apiClient } from "@/api";

export function useAvailablePostsSelector(
  open: boolean,
  seriesId: string,
  existingPosts: Document[],
  onPostsAdded: () => void,
  onClose: () => void,
) {
  const [availablePosts, setAvailablePosts] = useState<Document[]>([]);
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAvailablePosts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.series.availablePosts();
      setAvailablePosts(data ?? []);
    } catch {
      setError("Failed to load available posts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchAvailablePosts();
      setSelectedPosts(new Set(existingPosts.map((p) => p.id)));
    }
  }, [open, existingPosts]);

  const handleTogglePost = (postId: string) => {
    setSelectedPosts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(postId)) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (allPostCount: number) => {
    if (selectedPosts.size === allPostCount) {
      setSelectedPosts(new Set());
    } else {
      setSelectedPosts(
        new Set([
          ...existingPosts.map((p) => p.id),
          ...availablePosts.map((p) => p.id),
        ]),
      );
    }
  };

  const handleAddPosts = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const existingPostIds = new Set(existingPosts.map((p) => p.id));
      const currentlySelected = Array.from(selectedPosts);

      const postsToAdd = currentlySelected
        .filter((id) => !existingPostIds.has(id));

      const postsToRemove = existingPosts
        .map((p) => p.id)
        .filter((id) => !selectedPosts.has(id));

      await apiClient.series.updatePosts(seriesId, {
        postsToAdd,
        postsToRemove,
      });

      onPostsAdded();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update posts");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedPosts(new Set());
    setError(null);
    onClose();
  };

  return {
    availablePosts,
    selectedPosts,
    loading,
    submitting,
    error,
    handleTogglePost,
    handleSelectAll,
    handleAddPosts,
    handleClose,
  };
}
