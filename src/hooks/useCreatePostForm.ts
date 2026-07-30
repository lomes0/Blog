"use client";
import { useCallback, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { actions, useDispatch, useSelector } from "@/store";
import type { Post, PostCreateInput, User } from "@/types";
import { getEditorData } from "@/utils/getEditorData";
import { useHandleValidation } from "./useHandleValidation";

/**
 * A new post starts published and public; the visibility checkboxes narrow it
 * from there.
 */
const BLANK: Partial<PostCreateInput> = {
  published: true,
  private: false,
  collab: false,
};

interface UseCreatePostFormOptions {
  /** The container the new post lands in. */
  seriesId?: string | null;
  parentId?: string | null;
}

/**
 * Everything a post-creation surface does apart from its own chrome: hold the
 * draft input, validate the handle, assemble the payload, and create the post.
 *
 * The /new page and the create-post drawer differ in where they live — a route
 * versus a drawer over a series — not in what creating a post means, so that
 * part lives here once.
 *
 * There is no "save to cloud" choice any more: a post goes wherever the
 * session's posts live — the cloud when signed in, IndexedDB for a guest.
 */
export function useCreatePostForm(
  { seriesId = null, parentId = null }: UseCreatePostFormOptions = {},
) {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user);
  const [input, setInput] = useState<Partial<PostCreateInput>>(BLANK);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateInput = useCallback((partial: Partial<PostCreateInput>) => {
    setInput((prev) => ({ ...prev, ...partial }));
  }, []);

  const {
    validating,
    validationErrors,
    hasErrors,
    updateHandle,
    resetValidation,
  } = useHandleValidation({
    onChange: (handle) => updateInput({ handle }),
  });

  const updateCoauthors = useCallback((users: (User | string)[]) => {
    updateInput({
      coauthors: users.flatMap((u) =>
        typeof u === "string" ? [u] : u.email ? [u.email] : []
      ),
    });
  }, [updateInput]);

  const reset = useCallback(() => {
    setInput(BLANK);
    setError(null);
    resetValidation();
  }, [resetValidation]);

  /**
   * Seed the draft from an existing post — the fork case. Returns the source so
   * the caller can show what it is forking.
   */
  const seedFrom = useCallback(
    async (
      baseId: string,
      revisionId?: string | null,
    ): Promise<Post | null> => {
      try {
        const source = await dispatch(
          actions.forkPost({ id: baseId, revisionId: revisionId ?? null }),
        ).unwrap();
        updateInput({ data: source.data, baseId: source.id });
        return source;
      } catch {
        return null; // the thunk already announced the failure
      }
    },
    [dispatch, updateInput],
  );

  const submit = useCallback(async (): Promise<
    { ok: true; id: string } | { ok: false }
  > => {
    setError(null);
    setSubmitting(true);
    try {
      const createdAt = new Date().toISOString();
      const id = uuidv4();
      const payload: PostCreateInput = {
        ...input,
        id,
        head: uuidv4(),
        name: input.name || "Untitled Document",
        data: input.data ?? getEditorData(),
        type: "DOCUMENT",
        parentId,
        seriesId,
        createdAt,
        updatedAt: createdAt,
      };
      await dispatch(actions.createPost(payload)).unwrap();
      return { ok: true, id };
    } catch {
      // The thunk announces the failure globally; surfaces with an inline error
      // area read `error` as well.
      setError("Failed to create post. Please try again.");
      return { ok: false };
    } finally {
      setSubmitting(false);
    }
  }, [dispatch, input, parentId, seriesId]);

  return {
    user,
    input,
    updateInput,
    updateCoauthors,
    updateHandle,
    validating,
    validationErrors,
    hasErrors,
    submitting,
    error,
    setError,
    reset,
    seedFrom,
    submit,
    /** Whether the Create button should be live. */
    canSubmit: !validating && !hasErrors && !submitting,
  };
}

export type CreatePostForm = ReturnType<typeof useCreatePostForm>;
