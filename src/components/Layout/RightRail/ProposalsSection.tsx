"use client";
import { useMemo } from "react";
import { Alert, Box, Button, Chip, Skeleton, Typography } from "@mui/material";
import { Check, FilePlus2, GitPullRequest, Trash2, X } from "lucide-react";
import { createSelector } from "@reduxjs/toolkit";
import { actions, type RootState, useDispatch, useSelector } from "@/store";
import { DateDisplay } from "@/components/shared/DateDisplay";
import { ICON_SIZE } from "@/theme/icons";
import { useProposalActions } from "@/hooks/useProposalActions";
import type { AgentCreatedPost, PendingProposal } from "@/types";
import { originLabel } from "@/lib/proposalLabels";
import { isProposalStale } from "@/lib/proposals";
import RailSection from "./RailSection";

interface ProposalsSectionProps {
  /** The focused document, so its own proposal sorts to the top. */
  activeDocId: string | null;
}

/**
 * What Claude has done that is waiting on you (docs/plans/agent-gating.md §3.5,
 * "awareness" tier).
 *
 * Two kinds of thing, one list, because from the author's side they are one
 * question:
 *
 * - a **pending proposal** on an existing document — approve it into `head`,
 *   reject it, or open it as a diff first;
 * - an **agent-created post** (§3.7), which landed as an unpublished draft
 *   because a create has no head to withhold — accept it or discard it.
 *
 * Not scoped to the open document. A terminal session edits whatever it was
 * asked about, and the point of the poll is to notice work on a document you are
 * *not* looking at; a section that only spoke about the focused pane would hide
 * exactly the case it exists for. The focused document's own proposal is sorted
 * first, and every other row names its document.
 */
export default function ProposalsSection(
  { activeDocId }: ProposalsSectionProps,
) {
  const dispatch = useDispatch();
  const { busyId, review, approve, reject, acceptPost, discardPost } =
    useProposalActions();

  const selectProposals = useMemo(
    () =>
      createSelector(
        (state: RootState) => state.ui.proposals.byDocId,
        (byDocId) => Object.values(byDocId),
      ),
    [],
  );
  const proposals = useSelector(selectProposals);
  const agentPosts = useSelector((state) => state.ui.proposals.agentPosts);
  const status = useSelector((state) => state.ui.proposals.status);
  const error = useSelector((state) => state.ui.proposals.error);
  const loaded = useSelector((state) => state.ui.proposals.loaded);

  const ordered = useMemo(() => {
    if (!activeDocId) return proposals;
    return [...proposals].sort((a, b) => {
      if (a.documentId === activeDocId) return -1;
      if (b.documentId === activeDocId) return 1;
      return 0;
    });
  }, [proposals, activeDocId]);

  const total = ordered.length + agentPosts.length;
  // The poll runs on every window focus, so `loading` is the state a list
  // already on screen spends a moment in each time you come back to the tab.
  // Only the *first* load has nothing to show, and only it may paint a skeleton.
  const showSkeleton = status === "loading" && !loaded;

  return (
    <RailSection
      title="Agent changes"
      count={total || undefined}
      icon={<GitPullRequest size={ICON_SIZE.dense} />}
      iconLabel="Agent changes"
      defaultOpen={true}
    >
      {showSkeleton
        ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <Skeleton variant="rounded" height={52} />
            <Skeleton variant="rounded" height={52} />
          </Box>
        )
        : status === "error"
        ? (
          <Alert
            severity="error"
            sx={{ typography: "micro", py: 0, px: 1, alignItems: "center" }}
            action={
              <Button
                size="small"
                color="inherit"
                onClick={() => void dispatch(actions.refreshProposals())}
              >
                Retry
              </Button>
            }
          >
            {error ?? "Couldn't check for agent changes."}
          </Alert>
        )
        : total === 0
        ? (
          // Quiet, not an illustration: this is the common state and nothing has
          // gone wrong. Same treatment as "No revisions yet" next door.
          <Typography variant="caption" color="text.disabled">
            Nothing waiting for review
          </Typography>
        )
        : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {ordered.map((proposal) => (
              <ProposalRow
                key={proposal.id}
                proposal={proposal}
                showDocumentName={proposal.documentId !== activeDocId}
                busy={busyId === proposal.id}
                onReview={() => void review(proposal)}
                onApprove={() => void approve(proposal)}
                onReject={() => void reject(proposal)}
              />
            ))}
            {agentPosts.map((post) => (
              <AgentPostRow
                key={post.id}
                post={post}
                busy={busyId === post.id}
                onAccept={() => void acceptPost(post)}
                onDiscard={() => void discardPost(post)}
              />
            ))}
          </Box>
        )}
    </RailSection>
  );
}

/** The card every row in this section shares. */
const rowSx = {
  display: "flex",
  flexDirection: "column",
  gap: 0.5,
  border: "1px solid",
  borderColor: "divider",
  borderRadius: 1,
  p: 0.75,
  bgcolor: "background.paper",
} as const;

function RowMeta(
  { origin, date, icon }: {
    origin: string | null;
    date: string;
    icon: React.ReactNode;
  },
) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        color: "text.secondary",
        typography: "micro",
      }}
    >
      <Box sx={{ display: "flex", flexShrink: 0 }}>{icon}</Box>
      <Chip
        label={originLabel(origin)}
        size="small"
        sx={{
          height: 16,
          typography: "micro",
          "& .MuiChip-label": { px: 0.5 },
        }}
      />
      {
        /* Not `variant="full"` like the revisions list next door: that row gives
          the date a line of its own, and here it shares one with an origin chip
          inside a ~230px rail, where "August 6, 2026, 10:01 PM" wraps. The time
          is the part that matters — "did this just happen" — so the year goes
          and the clock stays. */
      }
      <DateDisplay date={date} customFormat="MMM d, h:mm a" />
    </Box>
  );
}

function ProposalRow({
  proposal,
  showDocumentName,
  busy,
  onReview,
  onApprove,
  onReject,
}: {
  proposal: PendingProposal;
  showDocumentName: boolean;
  busy: boolean;
  onReview: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  // Both halves of the question, from one function: the `staleAt` a save
  // stamped, and — for the proposal written while a save was in flight, which no
  // marker could have reached — the two pointers disagreeing (§3.6).
  const stale = isProposalStale(proposal, proposal.head);

  return (
    <Box sx={rowSx}>
      {showDocumentName && (
        <Typography
          variant="caption"
          sx={{ fontWeight: 600, display: "block" }}
          noWrap
        >
          {proposal.documentName || "Untitled"}
        </Typography>
      )}
      <Typography variant="micro" component="div" color="text.secondary">
        {proposal.summary || "Edited this document"}
      </Typography>
      <RowMeta
        origin={proposal.origin}
        date={proposal.proposedAt}
        icon={<GitPullRequest size={ICON_SIZE.micro} />}
      />
      {stale && (
        // One line, in the warning colour, and no icon: this is a dead end
        // rather than an error — nothing was lost and nothing is broken — but
        // it is the reason the Approve button below is missing, so it has to be
        // legible at a glance.
        <Typography variant="micro" component="div" color="warning.main">
          Out of date — you saved after this was written. Ask Claude again
          against the current content.
        </Typography>
      )}
      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
        <Button size="small" variant="text" disabled={busy} onClick={onReview}>
          Review
        </Button>
        {/* No Approve on a stale row. The server refuses it with a 409 — that
            is the safety property, not a hint — so offering the button would be
            offering a failure. Reject and a re-run are the only exits (§3.6). */}
        {!stale && (
          <Button
            size="small"
            variant="text"
            disabled={busy}
            startIcon={<Check size={ICON_SIZE.micro} />}
            onClick={onApprove}
          >
            Approve
          </Button>
        )}
        <Button
          size="small"
          variant="text"
          color="inherit"
          disabled={busy}
          startIcon={<X size={ICON_SIZE.micro} />}
          onClick={onReject}
        >
          Reject
        </Button>
      </Box>
    </Box>
  );
}

function AgentPostRow({
  post,
  busy,
  onAccept,
  onDiscard,
}: {
  post: AgentCreatedPost;
  busy: boolean;
  onAccept: () => void;
  onDiscard: () => void;
}) {
  return (
    <Box sx={rowSx}>
      <Typography
        variant="caption"
        sx={{ fontWeight: 600, display: "block" }}
        noWrap
      >
        {post.name || "Untitled"}
      </Typography>
      <Typography variant="micro" component="div" color="text.secondary">
        New draft, not published
      </Typography>
      <RowMeta
        origin={post.agentOrigin}
        date={post.agentCreatedAt}
        icon={<FilePlus2 size={ICON_SIZE.micro} />}
      />
      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
        <Button
          size="small"
          variant="text"
          disabled={busy}
          startIcon={<Check size={ICON_SIZE.micro} />}
          onClick={onAccept}
        >
          Keep
        </Button>
        <Button
          size="small"
          variant="text"
          color="error"
          disabled={busy}
          startIcon={<Trash2 size={ICON_SIZE.micro} />}
          onClick={onDiscard}
        >
          Discard
        </Button>
      </Box>
    </Box>
  );
}
