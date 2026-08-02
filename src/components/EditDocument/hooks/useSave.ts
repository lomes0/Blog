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
 * How long one revision may keep absorbing autosaves before the next save
 * starts a fresh one. Bounds how much writing a single checkpoint can span.
 */
const REVISION_SESSION_MS = 10 * 60 * 1000;

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
  // The revision the current writing stretch is being folded into, and when it
  // opened. Null means the next save opens a new one.
  const revisionId = useRef<string | null>(null);
  const revisionOpenedAt = useRef(0);

  const postId = post?.id;

  const cancelRetry = useCallback(() => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
  }, []);

  /**
   * Seal the revision autosaves are folding into, so the next one opens a fresh
   * record. Called at the moments a user would recognise as a checkpoint; the
   * sealed row stays in history untouched.
   */
  const closeRevision = useCallback(() => {
    revisionId.current = null;
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
      // "retrying" with nothing left to deliver.
      cancelRetry();
      await clearPendingSave(postId);
      dispatch(actions.setSaveStatus({ id: postId, status: "idle" }));
      return true;
    }

    // Autosaves fold into one revision instead of minting a row every attempt.
    // A new id opens a revision; reusing it rewrites that row in place, so a
    // long writing stretch costs one record rather than one per two seconds.
    // `closeRevision` ends the stretch at a checkpoint worth keeping — an
    // explicit save, leaving the tab, or closing the editor — and the ceiling
    // below stops a continuous session from folding into a single row forever.
    const now = Date.now();
    if (
      !revisionId.current ||
      now - revisionOpenedAt.current >= REVISION_SESSION_MS
    ) {
      revisionId.current = uuidv4();
      revisionOpenedAt.current = now;
    }
    const headId = revisionId.current;
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
          partial: { head: headId, updatedAt, data },
        }),
      ).unwrap();

      await clearPendingSave(postId);
      savedBaseline.current = serialized;
      attempt.current = 0;
      dispatch(actions.setSaveStatus({ id: postId, status: "idle" }));
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
  }, [postId, dispatch, editorRef, errorAnnounce, cancelRetry]);

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

  // One Save action persists every open tab (see saveRegistry). An explicit
  // save is a checkpoint: it seals the revision so later edits start a new one.
  useEffect(() => {
    if (!postId) return;
    registerSaveCallback(postId, async () => {
      const saved = await saveRef.current();
      if (saved) closeRevision();
      return saved;
    });
    return () => unregisterSaveCallback(postId);
  }, [postId, closeRevision]);

  // Leaving the tab is the other natural checkpoint, and the last moment we can
  // rely on being able to write. Flush, then seal.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState !== "hidden") return;
      scheduleSave.clear();
      void saveRef.current().then((saved) => {
        if (saved) closeRevision();
      });
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [scheduleSave, closeRevision]);

  // Flush pending edits when the editor goes away (e.g. edit → view).
  useEffect(() => () => {
    scheduleSave.clear();
    cancelRetry();
    void saveRef.current();
    closeRevision();
  }, [scheduleSave, cancelRetry, closeRevision]);

  return { save, savedBaseline, track };
}
