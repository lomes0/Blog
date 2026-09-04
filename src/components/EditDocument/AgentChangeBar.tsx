"use client";
import { Box, Button, Chip, Typography } from "@mui/material";
import {
  Check,
  GitPullRequest,
  GitPullRequestCreate,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import { useSelector } from "@/store";
import {
  selectAgentPost,
  selectPendingRename,
} from "@/store/selectors/proposalSelectors";
import { DateDisplay } from "@/components/shared/DateDisplay";
import { ICON_SIZE } from "@/theme/icons";
import { useProposalActions } from "@/hooks/useProposalActions";
import { originLabel } from "@/lib/proposalLabels";
import { isProposalStale } from "@/lib/proposals";

interface AgentChangeBarProps {
  /** The document this pane is showing. */
  docId: string;
}

/**
 * What an agent did to the open document, and the answer the author owes it.
 *
 * Two kinds of thing, one bar, for the reason `RightRail/ProposalsSection`
 * gives for putting them in one list: from the author's side they are one
 * question, and the wording and the labels are that section's, kept identical so
 * the rail and the editor cannot come to describe the same document
 * differently.
 *
 * - A **pending proposal** on an existing document (agent-gating.md §3.5, the
 *   "review whole" tier) — Review it as a diff, Approve it into `head`, or
 *   Reject it. The diff view already compares any two revisions, so reviewing a
 *   proposal is that view plus a decision.
 * - An **agent-created post** (§3.7), which landed as an unpublished draft
 *   because a create has no head to withhold — Keep it or Discard it. No
 *   Review: there is nothing to diff it against, which is the whole reason a
 *   create lands rather than proposes.
 *
 * - A **pending rename** (docs/plans/claude-code-backlog.md §8) — a title an
 *   agent proposed. Approve it onto the post or Reject it; no Review, because
 *   the change is the two names in the bar.
 *
 * A document is at most one of the first two — a post the author has not
 * accepted yet has no proposals against it — so those branch rather than
 * stacking. A rename is orthogonal to both and stacks above whichever is there:
 * it lives in its own columns, it is answered by its own pair of routes, and
 * approving a content edit must not silently carry a new title with it. The
 * component renders nothing when none of the three answers.
 *
 * It renders whenever this document is in either state — in or out of diff mode
 * (docs/plans/archive/agent-change-indication.md §3.4). It used to render only when the
 * diff's right-hand side was the proposal, which left the one state that needs a
 * warning as the one state with nothing on screen: you could open a document
 * Claude had written against, type a character, and silently mark the proposal
 * stale — a dead end whose only exits are reject or a re-run (§3.6). The bar is
 * therefore the notice as much as the decision, and it is one component in two
 * contexts rather than a second one for the non-diff case, so what the two say
 * cannot drift apart.
 *
 * Review is the only thing that differs between those two contexts, and it is
 * absent with the diff already open on this proposal, because the diff *is* the
 * review.
 *
 * Sticky, because a proposal can be pages long and the decision has to stay
 * reachable without scrolling back. The stickiness is on the stack rather than
 * on each bar, so a rename and a proposal shown together travel as one block.
 */
export default function AgentChangeBar({ docId }: AgentChangeBarProps) {
  // Read here only to decide whether there is a bar at all. The stickiness and
  // the margin live on this wrapper rather than on each bar inside it: two
  // independently sticky elements at `top: 0` would slide over one another the
  // moment the document scrolled, and an always-rendered wrapper would put its
  // margin above every document that has nothing waiting. The children read
  // what they render for themselves — the same key out of the same store, so
  // the second read is a lookup, not a second source of truth.
  const hasProposal = useSelector((state) =>
    Boolean(state.ui.proposals.byDocId[docId])
  );
  const hasAgentPost = useSelector((state) =>
    Boolean(state.ui.proposals.agentPostIds[docId])
  );
  const hasRename = useSelector((state) =>
    Boolean(state.ui.proposals.renames[docId])
  );
  if (!hasProposal && !hasAgentPost && !hasRename) return null;

  return (
    <Box
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 2,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        mb: 2,
        // The pane's own ground, so the gap between two stacked bars does not
        // become a window onto the text sliding underneath them.
        bgcolor: "background.default",
      }}
    >
      {
        /* Above the content decision: it is the smaller question, and the one
          whose whole answer is legible without reading anything else. */
      }
      <RenameBar docId={docId} />
      <DecisionBar docId={docId} />
    </Box>
  );
}

/** The proposal-or-created-post half, which is at most one of the two. */
function DecisionBar({ docId }: AgentChangeBarProps) {
  const proposal = useSelector((state) => state.ui.proposals.byDocId[docId]);
  const agentPost = useSelector((state) => selectAgentPost(state, docId));
  const comparing = useSelector((state) => state.ui.diff.new);
  // What the per-hunk review underneath this bar has been told to refuse
  // (docs/plans/archive/haklex-adoption.md §7). It is collected there and committed
  // here, because this bar is the sticky one: a proposal can run for pages, and
  // the decision has to stay reachable without scrolling back to a header.
  const rejectedHunks = useSelector((state) => state.ui.diff.rejectedHunks);
  const { busyId, review, approve, reject, acceptPost, discardPost } =
    useProposalActions();

  if (proposal) {
    const busy = busyId === proposal.id;
    // Only when the review on screen is this proposal's. A selection left over
    // from some other comparison names hunks this one does not have, and the
    // route is right to 400 on those — so it must never be sent.
    const refused = comparing === proposal.id ? rejectedHunks ?? [] : [];
    // The document moved off the base this was built on, so approval would 409
    // (§3.6). The diff still means something — it is the left-hand side that has
    // moved on — so the bar stays and loses its Approve button rather than
    // disappearing and leaving no way to reject.
    const stale = isProposalStale(proposal, proposal.head);

    return (
      <Bar
        icon={<GitPullRequest size={ICON_SIZE.dense} />}
        title={proposal.summary || "Proposed change"}
        meta={
          <>
            <Chip
              label={originLabel(proposal.origin)}
              size="small"
              sx={chipSx}
            />
            <DateDisplay date={proposal.proposedAt} variant="full" />
            {stale && (
              <Chip
                label="Out of date"
                size="small"
                color="warning"
                variant="outlined"
                sx={chipSx}
              />
            )}
          </>
        }
        note={stale && (
          <Typography variant="micro" component="div" color="warning.main">
            You saved after this was proposed, so it can no longer be applied.
            Ask Claude again against the current content.
          </Typography>
        )}
        actions={
          <>
            {
              /* Only when the diff is not already on this proposal. Open, it
                would be a button that asks for what is on screen; closed, it is
                the whole reason the bar can be shown outside diff mode — read it
                before deciding. */
            }
            {comparing !== proposal.id && (
              <Button
                size="small"
                variant="text"
                disabled={busy}
                onClick={() => void review(proposal)}
              >
                Review
              </Button>
            )}
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              disabled={busy}
              startIcon={<X size={ICON_SIZE.inline} />}
              onClick={() => void reject(proposal)}
            >
              Reject
            </Button>
            {
              /* Absent rather than disabled when stale: a disabled primary
                button reads as "not yet", and there is no yet — the only exits
                are reject or a re-run against current content (§3.6). */
            }
            {!stale && (
              <Button
                size="small"
                variant="contained"
                disabled={busy}
                startIcon={<Check size={ICON_SIZE.inline} />}
                onClick={() => void approve(proposal, refused)}
              >
                {
                  /* The label changes because the *act* changes: with something
                    refused this discards it rather than storing it, and a
                    button that still said "Approve" would be describing the
                    whole proposal. The count lives in the review's own bar. */
                }
                {refused.length > 0 ? "Approve accepted" : "Approve"}
              </Button>
            )}
          </>
        }
      />
    );
  }

  if (agentPost) {
    const busy = busyId === agentPost.id;

    return (
      <Bar
        icon={<GitPullRequestCreate size={ICON_SIZE.dense} />}
        title={agentPost.name || "Untitled"}
        meta={
          <>
            {
              /* The rail's line, verbatim: "lands normally" is not "goes live",
                and the draft state is the part that is not obvious from the
                editor being open on it (§3.7). */
            }
            <span>New draft, not published</span>
            <Chip
              label={originLabel(agentPost.agentOrigin)}
              size="small"
              sx={chipSx}
            />
            <DateDisplay date={agentPost.agentCreatedAt} variant="full" />
          </>
        }
        actions={
          <>
            {
              /* No Review. A create has no head to diff against — that is why it
                lands rather than proposing — so the document on screen *is* the
                whole of what there is to look at (§3.7). */
            }
            <Button
              size="small"
              variant="outlined"
              color="error"
              disabled={busy}
              startIcon={<Trash2 size={ICON_SIZE.inline} />}
              onClick={() => void discardPost(agentPost)}
            >
              Discard
            </Button>
            <Button
              size="small"
              variant="contained"
              disabled={busy}
              startIcon={<Check size={ICON_SIZE.inline} />}
              onClick={() => void acceptPost(agentPost)}
            >
              Keep
            </Button>
          </>
        }
      />
    );
  }

  return null;
}

/**
 * A title an agent proposed, and the two answers to it.
 *
 * Its own component so the bar above can stack it without either branch of the
 * main decision knowing it exists.
 */
function RenameBar({ docId }: AgentChangeBarProps) {
  const rename = useSelector((state) => selectPendingRename(state, docId));
  const { busyId, approveRename, rejectRename } = useProposalActions();
  if (!rename) return null;

  const busy = busyId === rename.id;

  return (
    <Bar
      icon={<SquarePen size={ICON_SIZE.dense} />}
      title={`Rename to “${rename.proposedTitle}”`}
      meta={
        <>
          {/* What it is called now, which the headline replaces if approved. */}
          <span>Currently “{rename.title || "Untitled"}”</span>
          <Chip
            label={originLabel(rename.origin)}
            size="small"
            sx={chipSx}
          />
          <DateDisplay date={rename.proposedAt} variant="full" />
        </>
      }
      actions={
        <>
          {
            /* No Review, and no staleness: a rename touches no content, so
              there is nothing to diff and nothing a save can invalidate. */
          }
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            disabled={busy}
            startIcon={<X size={ICON_SIZE.inline} />}
            onClick={() => void rejectRename(rename)}
          >
            Reject
          </Button>
          <Button
            size="small"
            variant="contained"
            disabled={busy}
            startIcon={<Check size={ICON_SIZE.inline} />}
            onClick={() => void approveRename(rename)}
          >
            Approve
          </Button>
        </>
      }
    />
  );
}

/** Origin, and the proposal's staleness flag, at the size the meta line is. */
const chipSx = {
  height: 16,
  typography: "micro",
  "& .MuiChip-label": { px: 0.75 },
} as const;

/**
 * The frame every state shares: glyph, a headline, one line of provenance, and
 * the decision on the right.
 *
 * Shared as a component rather than by copying the `sx` block, because the
 * branches differing in their padding would read as different notices about the
 * same document. Positioning is the stack's above, not each bar's.
 */
function Bar({
  icon,
  title,
  meta,
  note,
  actions,
}: {
  icon: React.ReactNode;
  title: string;
  meta: React.ReactNode;
  note?: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 1,
        px: 1.5,
        py: 1,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        bgcolor: "background.paper",
      }}
    >
      <Box sx={{ color: "text.secondary", display: "flex", flexShrink: 0 }}>
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="dense" component="div" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Typography
          variant="micro"
          component="div"
          color="text.secondary"
          sx={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 0.75,
          }}
        >
          {meta}
        </Typography>
        {note}
      </Box>
      <Box sx={{ display: "flex", gap: 1, flexShrink: 0 }}>{actions}</Box>
    </Box>
  );
}
