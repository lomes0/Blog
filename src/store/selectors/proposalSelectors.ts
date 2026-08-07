import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/store";
import { isProposalStale } from "@/lib/proposals";

/* ------------------------------------------------------------------ */
/*  Agent markers (docs/plans/agent-change-indication.md §2)           */
/* ------------------------------------------------------------------ */

/**
 * What a document is waiting on the author for, in one word.
 *
 * The three states are ordered stale > pending > created because only the stale
 * one needs an action other than "look at it" — a proposal built on a base the
 * document has moved past cannot be approved, so a row that showed "pending"
 * instead would be inviting a click that 409s.
 */
export type AgentMarker = "stale" | "pending" | "created";

/**
 * The marker for one document, as a string rather than an object.
 *
 * The shape is the whole point. This runs for every row in the tree on every
 * store change — the same reason `hasProposal` was a boolean before it grew a
 * third state — so it has to return something `useSelector` can compare by
 * value. Returning the proposal, or a `{ stale, pending }` pair, would hand
 * each row a fresh identity to diff and re-render the tree on every unrelated
 * dispatch.
 *
 * Staleness is decided here rather than fetched: `isProposalStale` reads only
 * fields the listing already carries, and it is the same call the rail and the
 * review bar make, so the three surfaces cannot disagree about a row.
 */
export const selectAgentMarker = (
  state: RootState,
  docId: string,
): AgentMarker | null => {
  const proposal = state.ui.proposals.byDocId[docId];
  if (proposal) {
    return isProposalStale(proposal, proposal.head) ? "stale" : "pending";
  }
  return state.ui.proposals.agentPostIds[docId] ? "created" : null;
};

/**
 * Every marked document, keyed by id, with the marker it carries.
 *
 * A map rather than a set of ids, because a group row needs both halves of the
 * question and a set answers only the first: membership is still one key lookup
 * per child, and the state that decides precedence comes back with it. With a
 * set, a row that found a member still had to go back to the store for its
 * state — which in practice meant subscribing to the whole store and
 * re-rendering every group row on every dispatch, keystrokes included. One
 * subscription to one stable object answers both.
 *
 * Memoized on the two maps alone so the object keeps its identity across every
 * store change that is not a poll or a review decision. A group row closes over
 * it in a `useMemo`, so a fresh object per store read would defeat that
 * memoization one level up as well as this one.
 */
export const selectMarkerByDocId = createSelector(
  [
    (state: RootState) => state.ui.proposals.byDocId,
    (state: RootState) => state.ui.proposals.agentPostIds,
  ],
  (byDocId, agentPostIds): Record<string, AgentMarker> => {
    const markers: Record<string, AgentMarker> = {};
    for (const [docId, proposal] of Object.entries(byDocId)) {
      markers[docId] = isProposalStale(proposal, proposal.head)
        ? "stale"
        : "pending";
    }
    // A pending proposal outranks "created": the post may have been written by
    // an agent, but what the author has to act on is the proposal.
    for (const docId of Object.keys(agentPostIds)) {
      if (!markers[docId]) markers[docId] = "created";
    }
    return markers;
  },
);

/**
 * The marker a group row shows for the documents beneath it, and how many of
 * them are marked.
 *
 * A pure helper rather than a selector factory because the ids are not in the
 * store: they come from the rendered tree, which is grouped and ordered in
 * `utils/posts/seriesGrouping.ts`. A selector parameterized by a fresh id list
 * per row would memoize on an argument that changes identity whenever the tree
 * re-derives, i.e. never usefully — so the caller pairs this with its own
 * `useMemo` over the ids it already holds and the one stable map above.
 *
 * The precedence is the same ladder as {@link AgentMarker}: stale > pending >
 * created. `count` is every marked descendant regardless of state, because the
 * tooltip says "n agent changes inside", not "n stale ones".
 */
export const rollUpMarkers = (
  docIds: Iterable<string>,
  markerByDocId: Record<string, AgentMarker>,
): { marker: AgentMarker | null; count: number } => {
  let count = 0;
  let stale = 0;
  let pending = 0;

  for (const docId of docIds) {
    const marker = markerByDocId[docId];
    if (!marker) continue;
    count++;
    if (marker === "stale") stale++;
    else if (marker === "pending") pending++;
  }

  if (count === 0) return { marker: null, count: 0 };
  if (stale > 0) return { marker: "stale", count };
  if (pending > 0) return { marker: "pending", count };
  return { marker: "created", count };
};
