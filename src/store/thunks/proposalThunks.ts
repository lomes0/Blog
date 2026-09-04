import { apiClient } from "@/api";
import type {
  AgentCreatedPost,
  AppState,
  PendingProposal,
  PendingRename,
  ProposalCount,
} from "@/types";
import { createApiThunk, fail } from "./createApiThunk";

/**
 * The author's side of docs/plans/archive/agent-gating.md — reading what Claude has
 * proposed, and answering it.
 *
 * Everything here is cloud-only by construction. An agent proposal is a row in
 * Postgres written by the MCP server; a guest's IndexedDB has no such concept,
 * so these do not go through the `PostBackend` seam the way post and revision
 * thunks do. There is nothing for `localBackend` to implement.
 */

const EMPTY_COUNT: ProposalCount = {
  proposals: 0,
  agentPosts: 0,
  renames: 0,
  total: 0,
};

interface ProposalsPayload {
  count: ProposalCount;
  proposals: PendingProposal[];
  agentPosts: AgentCreatedPost[];
  renames: PendingRename[];
}

/**
 * Ask what is waiting, from the count first.
 *
 * The browser cannot know a terminal write happened, so this is the whole
 * signal (§3.5) — polled on window focus and on document open, never streamed.
 * The count comes first and the listing only when it is non-zero, which keeps
 * the common case at three indexed counts: the answer is almost always zero, and
 * a poll that fetched a listing every time would be paying for rows that do not
 * exist.
 *
 * Signed out there is nothing to ask about — the routes are `userRoute` and
 * would 401 — so a guest resolves to the empty answer without a request.
 */
export const refreshProposals = createApiThunk<ProposalsPayload, void>(
  "app/refreshProposals",
  async (_arg, thunkAPI) => {
    if (!(thunkAPI.getState() as AppState).user) {
      return { count: EMPTY_COUNT, proposals: [], agentPosts: [], renames: [] };
    }

    const count = await apiClient.proposals.count() ?? EMPTY_COUNT;
    if (count.total === 0) {
      return { count, proposals: [], agentPosts: [], renames: [] };
    }

    const listing = await apiClient.proposals.list();
    return {
      count,
      proposals: listing?.proposals ?? [],
      agentPosts: listing?.agentPosts ?? [],
      renames: listing?.renames ?? [],
    };
  },
  { title: "Couldn't check for agent changes" },
);

/**
 * Make a proposal the document.
 *
 * A 409 is the safety property working, not a bug: approval compare-and-sets
 * `Document.head` against the base the proposal was built on, so "you saved
 * first" refuses instead of overwriting that save (§3.4). It reaches the user as
 * the server's own wording via `announceFailure` — loud, because refusing is the
 * whole point of this route and a silent no-op would look like a dead button.
 */
export const approveProposal = createApiThunk(
  "app/approveProposal",
  async (arg: {
    documentId: string;
    revisionId: string;
    /**
     * The hunks the reviewer refused (§7). Absent or empty is the whole
     * proposal — the request every caller made before per-hunk review existed,
     * unchanged down to the missing body.
     */
    rejectedHunks?: string[];
    /** The proposal `version` those hunks were computed from. */
    version?: number;
  }) => {
    const result = await apiClient.proposals.approve(
      arg.documentId,
      arg.revisionId,
      arg.rejectedHunks && arg.rejectedHunks.length > 0
        ? { rejectedHunks: arg.rejectedHunks, version: arg.version }
        : undefined,
    );
    if (!result) fail("The change could not be applied");
    return {
      ...result,
      documentId: arg.documentId,
      revisionId: arg.revisionId,
    };
  },
  { title: "Couldn't apply this change" },
);

/** Throw a proposal away. The row is deleted; nothing else moves (§3.4). */
export const rejectProposal = createApiThunk(
  "app/rejectProposal",
  async (arg: { documentId: string; revisionId: string }) => {
    await apiClient.proposals.reject(arg.documentId, arg.revisionId);
    return arg;
  },
  { title: "Couldn't reject this change" },
);

/** Keep an agent-created post: the flag comes off, the post stays (§3.7). */
export const acceptAgentPost = createApiThunk(
  "app/acceptAgentPost",
  async (id: string) => {
    await apiClient.proposals.acceptPost(id);
    return id;
  },
  { title: "Couldn't accept this post" },
);

/** Delete an agent-created post. Refused server-side if it is not flagged. */
export const discardAgentPost = createApiThunk(
  "app/discardAgentPost",
  async (id: string) => {
    await apiClient.proposals.discardPost(id);
    return id;
  },
  { title: "Couldn't discard this post" },
);

/**
 * Apply a rename an agent proposed: the title becomes the proposed one
 * (docs/plans/claude-code-backlog.md §8).
 *
 * The new title comes back rather than being taken from the row on screen, so
 * the store writes what the server actually stored — a rename the author
 * answered from a rail that had gone stale updates to the truth rather than to
 * what the rail was showing.
 */
export const approveRename = createApiThunk(
  "app/approveRename",
  async (rename: PendingRename) => {
    const result = await apiClient.proposals.approveRename(rename.id);
    return {
      id: rename.id,
      title: result?.title ?? rename.proposedTitle,
    };
  },
  { title: "Couldn't apply this rename" },
);

/** Drop a proposed rename. The post keeps its name; nothing else moves. */
export const rejectRename = createApiThunk(
  "app/rejectRename",
  async (rename: PendingRename) => {
    await apiClient.proposals.rejectRename(rename.id);
    return rename.id;
  },
  { title: "Couldn't reject this rename" },
);
