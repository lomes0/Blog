"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { debounce } from "@mui/material/utils";
import { v4 as uuidv4 } from "uuid";
import { actions, useDispatch } from "@/store";
import { useErrorAnnounce } from "@/hooks/useErrorAnnounce";
import {
  clearPendingSave,
  isTransient,
  pendingSaveOf,
  writePendingSave,
} from "@/lib/pendingSaves";
import { registerSaveCallback, unregisterSaveCallback } from "../saveRegistry";
import type { Post } from "@/types";
import type { EditorState, LexicalEditor } from "lexical";
import type { RefObject } from "react";

/** How long after the last keystroke a save is attempted. */
const AUTOSAVE_DELAY_MS = 2000;
const MAX_BACKOFF_MS = 30_000;

/**
 * Persist a post's content, and keep persisting it through a bad connection.
 *
 * Every attempt records the pending content in IndexedDB *before* talking to
 * storage and clears it only once storage acknowledges. So a save is never held
 * solely in memory, and a disconnect degrades to "not yet acknowledged" rather
 * than "lost": the user keeps typing, a retry runs on a backoff and on the next
 * `online` event, and the edit lands when the network returns.
 *
 * There is no local-vs-cloud branching here. For a guest the backend is
 * IndexedDB, which never fails on network, so the pending record is written and
 * cleared in the same tick and the retry machinery simply never engages.
 *
 * Returns `savedBaseline` — the content storage last confirmed — which drives
 * dirty tracking and the editor's reset action, and an `onChange` handler to
 * compose with the other editor change handlers.
 */
export function useSave(
  post: Post | undefined,
  editorRef: RefObject<LexicalEditor | null>,
) {
  const dispatch = useDispatch();
  const errorAnnounce = useErrorAnnounce();

  const savedBaseline = useRef<string | null>(null);
  const inFlight = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempt = useRef(0);
  // The editor unmounts before this hook's cleanup runs (children tear down
  // first), so `editorRef` is already null by the time we flush. Stash the last
  // state seen on change and fall back to it.
  const latestState = useRef<EditorState | null>(null);

  const postId = post?.id;
  const parentId = post?.parentId;

  const cancelRetry = useCallback(() => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    if (!postId) return false;
    const editorState = editorRef.current?.getEditorState() ??
      latestState.current;
    if (!editorState) return false;

    // Overlapping attempts would race on `head`; the trailing debounce or the
    // scheduled retry picks up anything typed meanwhile.
    if (inFlight.current) return false;

    const data = editorState.toJSON();
    const serialized = JSON.stringify(data);
    if (savedBaseline.current === serialized) {
      // Storage already holds this content, so any buffered record is stale. A
      // restore that turned out to match must still settle, or the tab would sit
      // dirty and "retrying" with nothing left to deliver.
      cancelRetry();
      await clearPendingSave(postId);
      dispatch(actions.setSaveStatus({ id: postId, status: "idle" }));
      dispatch(actions.markTabClean(postId));
      return true;
    }

    // A fresh revision id every attempt, so the upsert creates a record rather
    // than hitting a no-op update.
    const headId = uuidv4();
    const updatedAt = new Date().toISOString();

    inFlight.current = true;
    cancelRetry();
    await writePendingSave(pendingSaveOf(postId, headId, data, updatedAt));
    dispatch(actions.setSaveStatus({ id: postId, status: "saving" }));

    try {
      await dispatch(
        actions.createRevision({
          id: headId,
          documentId: postId,
          createdAt: updatedAt,
          data,
        }),
      ).unwrap();
      // `data` is carried so the local backend's stored copy advances with the
      // head; the cloud backend drops it, since the revision above already has
      // the content.
      await dispatch(
        actions.updatePost({
          id: postId,
          partial: { head: headId, updatedAt, parentId, data },
        }),
      ).unwrap();

      await clearPendingSave(postId);
      savedBaseline.current = serialized;
      attempt.current = 0;
      dispatch(actions.setSaveStatus({ id: postId, status: "idle" }));
      dispatch(actions.markTabClean(postId));
      return true;
    } catch (error) {
      // The content is already in `pendingSaves`, so nothing is lost either way.
      if (isTransient(error)) {
        const delay = Math.min(
          MAX_BACKOFF_MS,
          1000 * 2 ** attempt.current++,
        );
        dispatch(actions.setSaveStatus({ id: postId, status: "retrying" }));
        retryTimer.current = setTimeout(() => void save(), delay);
      } else {
        dispatch(actions.setSaveStatus({ id: postId, status: "error" }));
        errorAnnounce("Failed to save post", error);
      }
      return false;
    } finally {
      inFlight.current = false;
    }
  }, [postId, parentId, dispatch, editorRef, errorAnnounce, cancelRetry]);

  // Keep a live handle so unmount and event listeners never call a stale save.
  const saveRef = useRef(save);
  saveRef.current = save;

  const scheduleSave = useMemo(
    () => debounce(() => void saveRef.current(), AUTOSAVE_DELAY_MS),
    [],
  );

  const track = useCallback(
    (_editorState: EditorState, editor: LexicalEditor) => {
      latestState.current = editor.getEditorState();
      scheduleSave();
    },
    [scheduleSave],
  );

  // Reconnecting is the moment most likely to succeed — don't wait out the backoff.
  useEffect(() => {
    const onOnline = () => void saveRef.current();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // One Save action persists every open tab (see saveRegistry).
  useEffect(() => {
    if (!postId) return;
    registerSaveCallback(postId, () => saveRef.current());
    return () => unregisterSaveCallback(postId);
  }, [postId]);

  // Flush pending edits when the editor goes away (e.g. edit → view).
  useEffect(() => () => {
    scheduleSave.clear();
    cancelRetry();
    void saveRef.current();
  }, [scheduleSave, cancelRetry]);

  return { save, savedBaseline, track };
}
