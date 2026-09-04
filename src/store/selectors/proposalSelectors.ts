import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/store";
import type { AgentCreatedPost, PendingRename } from "@/types";
import { isProposalStale } from "@/lib/proposals";

/* ------------------------------------------------------------------ */
/*  Agent markers (docs/plans/archive/agent-change-indication.md §2)           */
/* ------------------------------------------------------------------ */

/**
 * What a document is waiting on the author for, in one word.
 *
 * Ordered stale > pending > renamed > created. Stale leads because only it
 * needs an action other than "look at it" — a proposal built on a base the
 * document has moved past cannot be approved, so a row that showed "pending"
 * instead would be inviting a click that 409s. A content proposal outranks a
 * pending rename below it because it is the larger question about the same
 * post; the rail lists both, and this is one word.
 */
export type AgentMarker = "stale" | "pending" | "renamed" | "created";

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
  if (state.ui.proposals.renames[docId]) return "renamed";
  return state.ui.proposals.agentPostIds[docId] ? "created" : null;
};

/**
 * The agent-created post a document *is*, if it is one (agent-gating.md §3.7).
 *
 * A scan of the array, which §4 refused for the tree-row case — and the reason
 * it is admissible here is the caller, not the shape. A row asks once per row on
 * every store change, so a scan there costs the whole list per row forever;
 * `agentPostIds` exists for that question. This one is asked once per open pane,
 * by a bar that is mounted at most twice, and only ever with a document id it is
 * already rendering.
 *
 * The keyed mirror could not answer it in any case: it is a membership test, and
 * the bar renders the post's name, origin and creation date. What it returns is
 * the entry as it sits in the store, so `useSelector`'s reference comparison
 * holds until a poll actually replaces the list.
 */
export const selectAgentPost = (
  state: RootState,
  docId: string,
): AgentCreatedPost | null =>
  state.ui.proposals.agentPosts.find((post) => post.id === docId) ?? null;

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
    (state: RootState) => state.ui.proposals.renames,
    (state: RootState) => state.ui.proposals.agentPostIds,
  ],
  (byDocId, renames, agentPostIds): Record<string, AgentMarker> => {
    const markers: Record<string, AgentMarker> = {};
    for (const [docId, proposal] of Object.entries(byDocId)) {
      markers[docId] = isProposalStale(proposal, proposal.head)
        ? "stale"
        : "pending";
    }
    // A content proposal outranks a rename on the same post, for the reason
    // {@link AgentMarker} gives: one word, and the bigger question wins it.
    for (const docId of Object.keys(renames)) {
      if (!markers[docId]) markers[docId] = "renamed";
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
 * renamed > created. `count` is every marked descendant regardless of state,
 * because the tooltip says "n agent changes inside", not "n stale ones".
 */
export const rollUpMarkers = (
  docIds: Iterable<string>,
  markerByDocId: Record<string, AgentMarker>,
): { marker: AgentMarker | null; count: number } => {
  let count = 0;
  let stale = 0;
  let pending = 0;
  let renamed = 0;

  for (const docId of docIds) {
    const marker = markerByDocId[docId];
    if (!marker) continue;
    count++;
    if (marker === "stale") stale++;
    else if (marker === "pending") pending++;
    else if (marker === "renamed") renamed++;
  }

  if (count === 0) return { marker: null, count: 0 };
  if (stale > 0) return { marker: "stale", count };
  if (pending > 0) return { marker: "pending", count };
  if (renamed > 0) return { marker: "renamed", count };
  return { marker: "created", count };
};

/**
 * The rename waiting on this document, if there is one
 * (docs/plans/claude-code-backlog.md §8).
 *
 * A key lookup rather than a scan, and it returns the entry as it sits in the
 * store, so `useSelector`'s reference comparison holds until a poll replaces
 * the listing.
 */
export const selectPendingRename = (
  state: RootState,
  docId: string,
): PendingRename | null => state.ui.proposals.renames[docId] ?? null;
