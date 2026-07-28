"use client";
import { useCallback } from "react";
import { actions, useDispatch, useSelector } from "@/store";
import type { PostCreateInput } from "@/types";

/**
 * Creating and forking a post, for the new-document page.
 *
 * There is no "save to cloud" choice any more: a post goes wherever the
 * session's posts live — the cloud when signed in, IndexedDB for a guest.
 */
export function useCreateDocumentActions() {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.user);

  /** Load the content to seed a new post with, from any readable source. */
  const forkDocument = useCallback(
    async (id: string, revisionId: string | null) => {
      try {
        return await dispatch(actions.forkPost({ id, revisionId })).unwrap();
      } catch {
        return null;
      }
    },
    [dispatch],
  );

  const createDocument = useCallback(
    async (payload: PostCreateInput) => {
      await dispatch(actions.createPost(payload)).unwrap();
    },
    [dispatch],
  );

  return { user, forkDocument, createDocument };
}
