"use client";
import { useCallback } from "react";
import { actions, useDispatch, useSelector } from "@/store";
import type { DocumentCreateInput } from "@/types";

/**
 * Encapsulates Redux dispatch calls and apiClient usage for CreatePostDrawer,
 * keeping the component free of direct store and network imports.
 */
export function useCreatePostActions() {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.user);

  const createPost = useCallback(
    async (
      payload: DocumentCreateInput,
      options: { saveToCloud: boolean; isOnline: boolean },
    ): Promise<
      { ok: true; cloudSaved: boolean } | { ok: false; error: string }
    > => {
      try {
        await dispatch(actions.createLocalDocument(payload)).unwrap();
        let cloudSaved = false;
        if (options.saveToCloud && options.isOnline && user) {
          try {
            await dispatch(actions.createCloudDocument(payload)).unwrap();
            cloudSaved = true;
          } catch {
            // cloud save is optional – local succeeded, that's enough
          }
        }
        return { ok: true, cloudSaved };
      } catch {
        return { ok: false, error: "Failed to create post. Please try again." };
      }
    },
    [dispatch, user],
  );

  return { user, createPost };
}
