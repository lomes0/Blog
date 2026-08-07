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
 * Every document carrying any marker, as a set.
 *
 * This is what a group row asks: "does anything under me have agent work
 * waiting?" — answered by walking its own children against a set it already
 * holds, rather than by scanning the proposals for each row that draws.
 *
 * Memoized on the two maps alone so the set keeps its identity across every
 * store change that is not a poll or a review decision. A group row closes over
 * this to count its descendants, and a fresh `Set` per store read would defeat
 * that memoization one level up as well as this one.
 */
export const selectMarkedDocIds = createSelector(
  [
    (state: RootState) => state.ui.proposals.byDocId,
    (state: RootState) => state.ui.proposals.agentPostIds,
  ],
  (byDocId, agentPostIds): Set<string> =>
    new Set([...Object.keys(byDocId), ...Object.keys(agentPostIds)]),
);
