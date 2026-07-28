"use client";
import { useCallback } from "react";
import { actions, useDispatch, useSelector } from "@/store";
import type { PostCreateInput } from "@/types";

/**
 * Creating a post, for the create-post drawer.
 *
 * There is no "save to cloud" choice any more: a post goes wherever the
 * session's posts live — the cloud when signed in, IndexedDB for a guest.
 */
export function useCreatePostActions() {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.user);

  const createPost = useCallback(
    async (
      payload: PostCreateInput,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      try {
        await dispatch(actions.createPost(payload)).unwrap();
        return { ok: true };
      } catch {
        return { ok: false, error: "Failed to create post. Please try again." };
      }
    },
    [dispatch],
  );

  return { user, createPost };
}
