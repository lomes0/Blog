"use client";
import { useEffect, useRef } from "react";
import { actions, type RootState, useDispatch, useSelector } from "@/store";
import { selectFocusedDocId } from "@/store/selectors/layoutSelectors";
import { useCloseDeletedDocument } from "@/hooks/useCloseDeletedDocument";

/**
 * Not less often than this, however many events arrive at once.
 *
 * Focusing the window fires `focus` and `visibilitychange` together, and opening
 * a document changes the focused id in the same beat — three triggers, one
 * question. The guard is a floor on how often the question is *asked*, not a
 * timer: nothing here polls on its own.
 *
 * Widened from 3s when the SSE feed landed. At 3s this was the primary signal
 * and had to be ready to answer on the next focus; now the stream answers
 * within its coalescing window and this only covers the gaps the stream cannot
 * — the minutes before `EventSource` gets its connection back, a proxy that
 * swallowed the stream, a browser without one. A change that is genuinely
 * missed is missed for as long as the stream stays down, and asking every 3s
 * would not shorten that; it would only cost a request every time you alt-tab.
 */
const MIN_INTERVAL_MS = 30_000;

/**
 * The fallback for when the live feed is down — a catch-up on focus.
 *
 * `useChangeFeed` is the primary path now (docs/plans/archive/changes-detection.md §7):
 * a `NOTIFY` at the write, a `LISTEN` in the Next process and an SSE stream to
 * this tab, which normally makes an outside write visible in under a second and
 * leaves this hook with nothing to find. What it is still for is every window
 * where that chain is not delivering — the seconds or minutes `EventSource`
 * spends reconnecting after a laptop wakes or a deploy restarts Next, a proxy
 * that buffers the stream away (§5), a Postgres the listener cannot reach.
 *
 * That is a fallback and not a redundancy, because the stream cannot be trusted
 * to fail loudly: every one of those failures looks exactly like a quiet feed
 * from here. So the question keeps being asked on focus — rarely, at
 * {@link MIN_INTERVAL_MS} — and the answer is the same full-set reconcile that
 * makes the feed correct in the first place.
 *
 * Two questions, asked together because they have the same trigger and the same
 * answer-shape:
 *
 * 1. **What documents changed?** `catchUpPosts` (docs/plans/archive/changes-detection.md
 *    §3) fetches the full id set the caller owns and diffs it against the store,
 *    which is the only shape that can also report a *deletion* — `Document` has
 *    no `deletedAt`, so a hard-deleted row leaves nothing for a cursor query to
 *    find (§3.1).
 * 2. **What is waiting on review?** `refreshProposals` (agent-gating §3.5). It
 *    stays a separate call because an `apply_ops` writes `Revision` rows only
 *    and never moves `Document.updatedAt` — no document-shaped query, cursor or
 *    full-set, can see one (§3.2). Without this line the badge would go stale
 *    across exactly the windows the catch-up exists to cover.
 *
 * Neither announces anything. A change arriving is a row appearing and a marker
 * showing, not a toast (§10) — and a pane closing, which is its own feedback.
 *
 * **The workspace half of a delete.** A deletion found by the catch-up was made
 * somewhere this tab never saw — another window, an agent in a terminal — so
 * there is no user action here to hang the repair on, and `reconcilePosts` is a
 * reducer and cannot navigate. Left alone, a pane rooted at the deleted
 * document would keep rendering it: title falling to "Untitled", body still on
 * screen, and every save from that editor silently dropped, which is the
 * sharpest possible violation of the plan's promise that an open editor is
 * never disturbed (§1.2). So the ids the catch-up *proves* are gone are handed
 * to `useCloseDeletedDocument` — the same repair every user-initiated delete
 * already runs, not a second copy of its rules.
 *
 * **On SSE.** The earliest version of this hook ruled a stream out of scope;
 * phases 1–3 of docs/plans/archive/changes-detection.md revisited that rather than
 * reversing it, and this hook is what makes them *correct* rather than what
 * they replace. `NOTIFY` has no durability — a dropped connection, a laptop
 * sleep or a Next restart silently loses whatever happened inside the window —
 * so a full-set reconcile has to exist regardless, and the stream only makes it
 * rare. Both paths converge on `catchUpPosts`, so which one found a change
 * makes no difference to what the store ends up holding.
 *
 * No interval either. A poll on a timer would keep asking while you are reading
 * something else in another window, which is precisely when the answer cannot
 * have changed in a way you could act on. Focus is the moment the answer starts
 * mattering.
 *
 * Mounted once, in the app shell: the answers feed the sidebar, the rail and the
 * review bar, and every extra mount would be another pair of requests per focus.
 */
export function useBackgroundRefresh(): void {
  const dispatch = useDispatch();
  // Both halves are cloud-only concepts; a guest's IndexedDB has neither, and
  // the routes would 401. Keyed on the id so signing in re-polls.
  const userId = useSelector((state: RootState) => state.user?.id);
  const focusedDocId = useSelector(selectFocusedDocId);
  const closeDeleted = useCloseDeletedDocument();
  const lastPolledAt = useRef(0);

  useEffect(() => {
    if (!userId) return;

    const poll = () => {
      const now = Date.now();
      if (now - lastPolledAt.current < MIN_INTERVAL_MS) return;
      lastPolledAt.current = now;
      void dispatch(actions.catchUpPosts()).unwrap().then(
        ({ deletedIds }) => {
          // After the reducer, not before: the repair reads which pane is
          // showing the document *once the store no longer holds it*, and
          // `closePane` is what decides which pane inherits focus. One call per
          // id, as the bulk delete does — each is a no-op unless a pane is
          // actually holding that document, and at most one of them navigates.
          for (const id of deletedIds) closeDeleted(id);
        },
        // A failed catch-up is not news (§10); the next focus asks again.
        () => {},
      );
      void dispatch(actions.refreshProposals());
    };

    // On document open — which includes this effect's own first run, since
    // `focusedDocId` is a dependency. `catchUpPosts` no-ops until the initial
    // `load()` has settled, so that first run cannot diff against an empty store.
    poll();

    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    window.addEventListener("focus", poll);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [dispatch, userId, focusedDocId, closeDeleted]);
}
