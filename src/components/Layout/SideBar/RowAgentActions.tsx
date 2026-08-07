"use client";
import { IconButton, Tooltip } from "@mui/material";
import { Check, X } from "lucide-react";
import { type RootState, useSelector, useStore } from "@/store";
import {
  type AgentMarker,
  selectAgentPost,
} from "@/store/selectors/proposalSelectors";
import { useProposalActions } from "@/hooks/useProposalActions";
import { ICON_SIZE } from "@/theme/icons";

interface RowAgentActionsProps {
  /** The document id these actions apply to. */
  postId: string;
  /** Which action set to show. */
  marker: AgentMarker;
}

/**
 * The ✓ / ✗ actions a sidebar row reveals on hover when an agent has touched it.
 *
 * Exists as a separate component rather than being inlined into `PostItem` so
 * that `useProposalActions` — which calls `useConfirm` and `useCommandRun` —
 * only mounts on rows that actually have a marker. Mounting it on every row in
 * the tree would put those two hooks on every post, series and project, when
 * only the marked rows need them.
 *
 * The marker drives the actions (docs/plans/agent-change-indication.md):
 *
 * - **pending**: Approve and Reject. The proposal is fresh; both choices are
 *   available.
 * - **stale**: Reject ONLY. The server 409s a stale approval, so offering it is
 *   offering a failure. The same reasoning `RightRail/ProposalsSection` and
 *   `EditDocument/AgentChangeBar` follow.
 * - **created**: Keep (accept) and Discard (delete). The post was written by an
 *   agent and has not been accepted yet. Discard is destructive; `discardPost`
 *   confirms and also closes the document if it is open.
 *
 * Every tooltip here is `disableInteractive`, and that is load-bearing rather
 * than a preference. A MUI tooltip is interactive by default — it must stay open
 * while the pointer is on it (WCAG 2.1 SC 1.4.13) — so its popper takes pointer
 * events, and the popper is portaled to `document.body` rather than nested in
 * the row. `placement="right"` then puts ✓'s tooltip directly over ✗: moving
 * between the two buttons lands the pointer in something that is not a
 * descendant of the row, the row's `:hover` drops, these vanish and the marker
 * comes back — which unmounts the tooltip and starts the cycle again. Declining
 * to be interactive is what puts `pointer-events: none` on the popper.
 *
 * Hover-only, and therefore not reachable by keyboard — the row hides these
 * behind `display: none` until the pointer arrives, which no amount of
 * `:focus-within` can undo, because an element that is not displayed cannot take
 * focus in the first place. That is acceptable here and only here: this is an
 * accelerator, not the only way to answer. The rail section and the bar over the
 * document offer the same four actions, both fully keyboard-reachable, so
 * nothing is available to a mouse alone.
 */
export function RowAgentActions({
  postId,
  marker,
}: RowAgentActionsProps) {
  const { busyId, approve, reject, acceptPost, discardPost } =
    useProposalActions();
  // Read at the moment of acting, not as of a render: the actions need the whole
  // proposal or post row, and subscribing to it would hand this row a fresh
  // object identity on every poll. `useStore` does not subscribe — the same
  // reason `useProposalActions` itself holds one.
  const store = useStore();
  // The exception, and the reason it is a primitive: `busyId` is the id of the
  // thing in flight, and for a proposal that is the *revision* id, not the
  // document's. Without this the disabled state would never fire on a proposal
  // row — it fires on an agent-created post only because there the two ids are
  // the same row.
  const proposalId = useSelector(
    (state: RootState) => state.ui.proposals.byDocId[postId]?.id ?? null,
  );

  const busy = busyId !== null &&
    (busyId === postId || busyId === proposalId);

  const handleApprove = async () => {
    const state = store.getState();
    if (marker === "created") {
      const post = selectAgentPost(state, postId);
      if (!post) return;
      await acceptPost(post);
      return;
    }
    const proposal = state.ui.proposals.byDocId[postId];
    if (!proposal) return;
    await approve(proposal);
  };

  const handleReject = async () => {
    const state = store.getState();
    if (marker === "created") {
      const post = selectAgentPost(state, postId);
      if (!post) return;
      await discardPost(post);
      return;
    }
    const proposal = state.ui.proposals.byDocId[postId];
    if (!proposal) return;
    await reject(proposal);
  };

  // pending → Approve and Reject
  // stale → Reject ONLY (the server 409s a stale approval)
  // created → Keep and Discard
  const showApprove = marker === "pending" || marker === "created";

  return (
    <>
      {showApprove && (
        <Tooltip
          title={marker === "created"
            ? "Keep agent-created post"
            : "Approve agent change"}
          placement="right"
          disableInteractive
        >
          <span>
            {/* Wrapped in span so the tooltip still shows when disabled. */}
            <IconButton
              aria-label={marker === "created"
                ? "Keep agent-created post"
                : "Approve agent change"}
              size="small"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                void handleApprove();
              }}
              sx={{
                p: 0.25,
                mr: 0.25,
                color: "inherit",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <Check size={ICON_SIZE.micro} />
            </IconButton>
          </span>
        </Tooltip>
      )}
      <Tooltip
        title={marker === "created"
          ? "Discard agent-created post"
          : "Reject agent change"}
        placement="right"
      >
        <span>
          <IconButton
            aria-label={marker === "created"
              ? "Discard agent-created post"
              : "Reject agent change"}
            size="small"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              void handleReject();
            }}
            sx={{
              p: 0.25,
              mr: -0.25,
              // Discard (delete) is `error`, reject (costs nothing) is not.
              color: marker === "created" ? "error.main" : "inherit",
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <X size={ICON_SIZE.micro} />
          </IconButton>
        </span>
      </Tooltip>
    </>
  );
}
