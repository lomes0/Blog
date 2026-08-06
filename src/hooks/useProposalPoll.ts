"use client";
import { useEffect, useRef } from "react";
import { actions, type RootState, useDispatch, useSelector } from "@/store";
import { selectFocusedDocId } from "@/store/selectors/layoutSelectors";

/**
 * Not less often than this, however many events arrive at once.
 *
 * Focusing the window fires `focus` and `visibilitychange` together, and opening
 * a document changes the focused id in the same beat — three triggers, one
 * question. The guard is a floor on how often the question is *asked*, not a
 * timer: nothing here polls on its own.
 */
const MIN_INTERVAL_MS = 3000;

/**
 * Notice that a terminal wrote something (docs/plans/agent-gating.md §3.5).
 *
 * The browser cannot know an agent ran. This is the cheapest signal consistent
 * with the quiet-UI rule: ask `GET /api/proposals/count` when the window regains
 * focus and when a document is opened, and let a badge appear. Not a toast, not
 * a modal, and deliberately **not** SSE — that is a second system to keep alive,
 * and the plan says it is not what this phase builds.
 *
 * No interval either. A poll on a timer would keep asking while you are reading
 * something else in another window, which is precisely when the answer cannot
 * have changed in a way you could act on. Focus is the moment the answer starts
 * mattering.
 *
 * Mounted once, in the app shell: the answer feeds the sidebar badge, the rail
 * and the review bar, and every extra mount would be another request per focus.
 */
export function useProposalPoll(): void {
  const dispatch = useDispatch();
  // Proposals are a cloud-only concept; a guest's IndexedDB has none, and the
  // routes would 401. Keyed on the id so signing in re-polls.
  const userId = useSelector((state: RootState) => state.user?.id);
  const focusedDocId = useSelector(selectFocusedDocId);
  const lastPolledAt = useRef(0);

  useEffect(() => {
    if (!userId) return;

    const poll = () => {
      const now = Date.now();
      if (now - lastPolledAt.current < MIN_INTERVAL_MS) return;
      lastPolledAt.current = now;
      void dispatch(actions.refreshProposals());
    };

    // On document open — which includes this effect's own first run, since
    // `focusedDocId` is a dependency.
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
  }, [dispatch, userId, focusedDocId]);
}
