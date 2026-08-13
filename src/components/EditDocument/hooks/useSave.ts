"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { debounce } from "@mui/material/utils";
import { v4 as uuidv4 } from "uuid";
import { actions, useDispatch } from "@/store";
import { useErrorAnnounce } from "@/hooks/useErrorAnnounce";
import {
  clearPendingSave,
  isConflict,
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
 * the editor's reset action, an `onChange` handler to compose with the other
 * editor change handlers, and two answers derived from that same baseline:
 * `hasUnsavedChanges()` and `adoptSavedState()`.
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
  // The head this tab believes storage holds — the one its last save wrote, or
  // the one the document was loaded at. Sent with every save as the
  // compare-and-set precondition, so a save that would overwrite someone else's
  // work is refused rather than silently winning.
  const lastSavedHead = useRef<string | null>(null);
  // Set once storage has refused this tab's head. It cannot become true again
  // by trying: every later save carries the same precondition and is refused
  // identically, so the loop stops asking and only keeps buffering.
  const conflicted = useRef(false);

  const postId = post?.id;
  // Read through a ref: the seed below must run when the *document* changes, not
  // every time its head advances — which is what a `post.head` dependency would
  // mean, and it would reset the precondition to whatever we just wrote.
  const postRef = useRef(post);
  postRef.current = post;

  useEffect(() => {
    lastSavedHead.current = postRef.current?.head ?? null;
    conflicted.current = false;
  }, [postId]);

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

    if (conflicted.current) {
      // Storage is ahead of this tab and will refuse anything it sends, so
      // asking again would only stack another snackbar every couple of seconds.
      // The buffer still has to keep up, or everything typed after the conflict
      // would be the thing that actually got lost — it is what `usePostLoader`
      // restores from on the next open.
      await writePendingSave(
        pendingSaveOf(
          postId,
          revisionId.current ?? uuidv4(),
          data,
          new Date().toISOString(),
        ),
      );
      return false;
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
          partial: {
            head: headId,
            updatedAt,
            data,
            expectedHead: lastSavedHead.current,
          },
        }),
      ).unwrap();

      await clearPendingSave(postId);
      savedBaseline.current = serialized;
      lastSavedHead.current = headId;
      attempt.current = 0;
      dispatch(actions.setSaveStatus({ id: postId, status: "idle" }));
      return true;
    } catch (error) {
      // The content is already in `pendingSaves`, so nothing is lost either way.
      if (isConflict(error)) {
        // Someone else — another tab, or an agent — wrote after our last save.
        // Retrying would fail identically until this tab knows what landed, so
        // stop, and leave the buffered record alone: it is what brings this
        // text back when the document is reopened (see `usePostLoader`). The
        // store has already announced the server's own wording, so saying it
        // again here would only stack a second snackbar on the same event.
        // The revision above did land — it is simply not `head`, so this
        // content is also recoverable from history rather than only locally.
        conflicted.current = true;
        attempt.current = 0;
        dispatch(actions.setSaveStatus({ id: postId, status: "error" }));
        return false;
      }
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

  /**
   * Does the editor hold anything storage has not acknowledged?
   *
   * The answer §3.9 of docs/plans/archive/agent-gating.md needs, and deliberately a
   * *function* rather than a piece of state. There is no dirty flag in this app
   * and putting one back was explicitly the wrong fix: `SaveStatus` cannot
   * answer (`idle` covers both "clean" and "typed, not yet flushed"), and
   * `dirtyDocIds`/`useDirtyTracking`/`selectIsDirty` were deleted when autosave
   * went quiet — they cost a full `JSON.stringify` of the document on the typing
   * path to keep a mirror nobody read.
   *
   * This is the same comparison `save` makes, against the same ref, and it costs
   * the same `JSON.stringify` — but only at the moment somebody asks, which is
   * when an approval lands under an open tab. One component asking itself a
   * question once is not global state, and nothing re-renders because of it.
   *
   * A null baseline means the document has never been acknowledged in this
   * session (nothing loaded yet), which is answered as "not dirty": there is no
   * confirmed content for an approval to be replacing.
   *
   * **A byte comparison alone is not enough, and this was measured.** The
   * baseline `usePostLoader` installs is the document's JSON *as stored*, while
   * the left-hand side is what Lexical serializes — and Lexical normalizes on
   * parse, filling in node defaults and settling key order. The two describe the
   * same document and are not equal as strings, so an untouched freshly-opened
   * tab answered "dirty" and every approval asked to replace edits nobody had
   * made. Round-tripping the baseline through the same editor removes exactly
   * that difference and no other: content really typed still fails to match.
   *
   * The round trip only runs when the cheap comparison has already failed, so
   * the untouched case stays one `JSON.stringify`.
   */
  const hasUnsavedChanges = useCallback((): boolean => {
    const baseline = savedBaseline.current;
    if (baseline === null) return false;
    const editor = editorRef.current;
    const editorState = editor?.getEditorState() ?? latestState.current;
    if (!editorState) return false;

    const current = JSON.stringify(editorState.toJSON());
    if (current === baseline) return false;
    // Without an editor there is nothing to normalize against, and a difference
    // has to be taken at face value.
    if (!editor) return true;
    try {
      return JSON.stringify(editor.parseEditorState(baseline).toJSON()) !==
        current;
    } catch {
      // A baseline the editor cannot parse is not a baseline. Say dirty: the
      // question is asked before overwriting, and the cautious answer is the one
      // that puts the choice in front of the user.
      return true;
    }
  }, [editorRef]);

  /**
   * Adopt content that arrived from outside this tab as the new baseline.
   *
   * Used when an approved proposal replaces the document under an open editor.
   * Without it the tab would keep sending `expectedHead` = the head it loaded
   * at, which approval has just moved off — so the very next autosave would 409
   * against a change the user themselves applied, and the tab would sit
   * conflicted for no reason. Sealing the revision as well means the edits after
   * a reload open a fresh row rather than folding into one that describes the
   * pre-approval text.
   */
  const adoptSavedState = useCallback((head: string, serialized: string) => {
    savedBaseline.current = serialized;
    lastSavedHead.current = head;
    conflicted.current = false;
    attempt.current = 0;
    revisionId.current = null;
  }, []);

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

  return { save, savedBaseline, track, hasUnsavedChanges, adoptSavedState };
}
