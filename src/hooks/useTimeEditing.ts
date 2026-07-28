"use client";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PendingTimeChange } from "@/types/posts";
import { Post } from "@/types";
import { useErrorAnnounce } from "@/hooks/useErrorAnnounce";
import { apiClient } from "@/api";

export function useTimeEditing(posts: Post[]) {
  const router = useRouter();
  const errorAnnounce = useErrorAnnounce();
  const [isTimeEditMode, setIsTimeEditMode] = useState(false);
  const [pendingTimeChanges, setPendingTimeChanges] = useState<
    Map<string, PendingTimeChange>
  >(new Map());
  const [isSavingTimeChanges, setIsSavingTimeChanges] = useState(false);

  const handleToggleTimeEditMode = useCallback(() => {
    if (isTimeEditMode) {
      setPendingTimeChanges(new Map());
    }
    setIsTimeEditMode((prev) => !prev);
  }, [isTimeEditMode]);

  const handleTimeAdjust = useCallback(
    (postId: string, originalDate: Date, days: number) => {
      setPendingTimeChanges((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(postId);
        const currentDate = existing
          ? existing.newDate
          : new Date(originalDate);
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + days);
        newMap.set(postId, {
          originalDate: existing
            ? existing.originalDate
            : new Date(originalDate),
          newDate,
        });
        return newMap;
      });
    },
    [],
  );

  const handleTimeReset = useCallback((postId: string) => {
    setPendingTimeChanges((prev) => {
      const newMap = new Map(prev);
      newMap.delete(postId);
      return newMap;
    });
  }, []);

  const handleSaveTimeChanges = useCallback(async () => {
    if (pendingTimeChanges.size === 0) return;
    setIsSavingTimeChanges(true);
    try {
      await apiClient.documents.updateTimes(
        Array.from(pendingTimeChanges.entries()).map(([id, change]) => ({
          id,
          createdAt: change.newDate,
        })),
      );
      setPendingTimeChanges(new Map());
      setIsTimeEditMode(false);
      router.refresh();
    } catch (error) {
      errorAnnounce("Failed to save time changes", error);
    } finally {
      setIsSavingTimeChanges(false);
    }
  }, [pendingTimeChanges, router, errorAnnounce]);

  const handleDiscardTimeChanges = useCallback(() => {
    setPendingTimeChanges(new Map());
    setIsTimeEditMode(false);
  }, []);

  /** Posts with pending time changes applied for live re-ordering */
  const sortedWithPending = useMemo(
    () =>
      [...posts].sort((a, b) => {
        const pendingA = pendingTimeChanges.get(a.id);
        const pendingB = pendingTimeChanges.get(b.id);
        const dateA = (pendingA ? pendingA.newDate : new Date(a.createdAt || 0))
          .getTime();
        const dateB = (pendingB ? pendingB.newDate : new Date(b.createdAt || 0))
          .getTime();
        return dateB - dateA;
      }),
    [posts, pendingTimeChanges],
  );

  return {
    isTimeEditMode,
    pendingTimeChanges,
    isSavingTimeChanges,
    sortedWithPending,
    handleToggleTimeEditMode,
    handleTimeAdjust,
    handleTimeReset,
    handleSaveTimeChanges,
    handleDiscardTimeChanges,
  };
}
