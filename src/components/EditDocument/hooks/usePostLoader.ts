"use client";
import { useState } from "react";
import { useAsyncEffect } from "@/hooks/useAsyncEffect";
import { actions, useDispatch } from "@/store";
import { useErrorAnnounce } from "@/hooks/useErrorAnnounce";
import { isPendingSaveAhead, readPendingSave } from "@/lib/pendingSaves";
import {
  EMPTY_EDITOR_STATE,
  type Post,
  WELCOME_NOTES_EDITOR_STATE,
} from "@/types";
import { v4 as uuidv4 } from "uuid";

/**
 * Load a post into the editor.
 *
 * Reads from the session's backend, then checks the unconfirmed-save buffer: a
 * record whose head storage doesn't know about means the last save never landed
 * (the tab was closed or crashed during a disconnect), so that content wins and
 * the tab is marked dirty.
 *
 * `savedBaseline` is set to whatever storage actually holds, so dirty tracking
 * agrees there are unsaved changes to persist.
 *
 * Recovered content still has to be delivered, and nothing here can do it: the
 * editor is not mounted yet, so there is no state to save. `restoredFromPending`
 * is the signal for the caller to flush once it is — see `EditorTabPanel`.
 * Without that kick a recovered edit would sit in the buffer showing
 * "Reconnecting…" until the user happened to type again.
 */
export function usePostLoader(
  id: string | undefined,
  savedBaseline: React.MutableRefObject<string | null>,
) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ title: string; subtitle?: string }>();
  // Holds the post with real content as loaded. Used to initialise the editor,
  // bypassing the Redux selector which may return a stale reference due to its
  // custom equality function (a, b) => a?.id === b?.id.
  const [loadedPost, setLoadedPost] = useState<Post | undefined>();
  // Whether `loadedPost` came from the unconfirmed-save buffer rather than storage.
  const [restoredFromPending, setRestoredFromPending] = useState(false);
  const dispatch = useDispatch();
  const errorAnnounce = useErrorAnnounce();

  useAsyncEffect(async (isCancelled) => {
    setIsLoading(true);
    setLoadedPost(undefined);
    setRestoredFromPending(false);
    setError(undefined);

    // The load body is nested so every path falls through to the cleanup below;
    // returning early from the effect itself would skip registering it.
    const load = async () => {
      if (!id) {
        if (!isCancelled()) setError({ title: "Post Not Found" });
        return;
      }

      let post: Post | undefined;
      try {
        post = await dispatch(actions.getPost(id)).unwrap();
      } catch {
        post = undefined;
      }
      if (isCancelled()) return;

      if (!post) {
        // The `notes` handle is a well-known personal post, created on first
        // visit rather than 404ing.
        if (id === "notes") {
          try {
            const created = await createNotesPost(dispatch);
            if (!isCancelled()) {
              savedBaseline.current = JSON.stringify(created.data);
              setLoadedPost(created);
              setIsLoading(false);
            }
          } catch (err) {
            errorAnnounce("Failed to create notes post", err);
            if (!isCancelled()) {
              setError({
                title: "Failed to Create Notes",
                subtitle: "Please try again",
              });
            }
          }
          return;
        }
        if (!isCancelled()) setError({ title: "Post Not Found" });
        return;
      }

      savedBaseline.current = JSON.stringify(post.data ?? EMPTY_EDITOR_STATE);

      const pending = await readPendingSave(post.id);
      if (isCancelled()) return;

      if (isPendingSaveAhead(pending, post.head)) {
        // An earlier save never made it through. Show that content and flag it
        // for delivery once the editor is up.
        setLoadedPost({ ...post, data: pending.data });
        setRestoredFromPending(true);
        dispatch(actions.markDocDirty(post.id));
        dispatch(actions.setSaveStatus({ id: post.id, status: "retrying" }));
      } else {
        setLoadedPost(post);
      }
      setIsLoading(false);
    };

    await load();

    return () => {
      dispatch(actions.setDiffOpen(false));
      if (id) dispatch(actions.markDocClean(id));
    };
  }, [dispatch, id]);

  return { isLoading, error, loadedPost, restoredFromPending };
}

async function createNotesPost(
  dispatch: ReturnType<typeof useDispatch>,
): Promise<Post> {
  const now = new Date().toISOString();
  const id = uuidv4();
  const head = uuidv4();
  const data = WELCOME_NOTES_EDITOR_STATE;

  const created = await dispatch(
    actions.createPost({
      id,
      name: "My Notes",
      description: "Your personal notes document",
      handle: "notes",
      head,
      createdAt: now,
      updatedAt: now,
      type: "DOCUMENT",
      private: true,
      published: false,
      collab: false,
      data,
      revisions: [{ id: head, documentId: id, createdAt: now, data }],
    }),
  ).unwrap();

  // The cloud backend echoes metadata only; carry the content we just sent so
  // the editor has something to open.
  return { ...created, data: created.data ?? data };
}
