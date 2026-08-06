"use client";
import { Box, Button, Chip, Typography } from "@mui/material";
import { Check, GitPullRequest, X } from "lucide-react";
import { useSelector } from "@/store";
import { DateDisplay } from "@/components/shared/DateDisplay";
import { ICON_SIZE } from "@/theme/icons";
import { useProposalActions } from "@/hooks/useProposalActions";
import { originLabel } from "@/lib/proposalLabels";
import { isProposalStale } from "@/lib/proposals";

interface ProposalReviewBarProps {
  /** The document this pane is showing. */
  docId: string;
}

/**
 * Approve or reject the proposal the diff below is showing.
 *
 * The "review whole" tier of docs/plans/agent-gating.md §3.5: the diff view
 * already compares any two revisions, so reviewing a proposal is that view plus
 * a decision. The bar is therefore an addition to the diff rather than a new
 * screen.
 *
 * It renders **only** when the diff's right-hand side is this document's pending
 * proposal. A diff between two ordinary history revisions has nothing to approve,
 * and offering the buttons anyway would be a live action on the wrong row.
 *
 * Sticky, because a proposal can be pages long and the decision has to stay
 * reachable without scrolling back.
 */
export default function ProposalReviewBar({ docId }: ProposalReviewBarProps) {
  const proposal = useSelector((state) => state.ui.proposals.byDocId[docId]);
  const comparing = useSelector((state) => state.ui.diff.new);
  const { busyId, approve, reject } = useProposalActions();

  if (!proposal || comparing !== proposal.id) return null;

  const busy = busyId === proposal.id;
  // The document moved off the base this was built on, so approval would 409
  // (§3.6). The diff still means something — it is the left-hand side that has
  // moved on — so the bar stays and loses its Approve button rather than
  // disappearing and leaving no way to reject.
  const stale = isProposalStale(proposal, proposal.head);

  return (
    <Box
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 2,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 1,
        mb: 2,
        px: 1.5,
        py: 1,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        bgcolor: "background.paper",
      }}
    >
      <Box sx={{ color: "text.secondary", display: "flex", flexShrink: 0 }}>
        <GitPullRequest size={ICON_SIZE.dense} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="dense" component="div" sx={{ fontWeight: 600 }}>
          {proposal.summary || "Proposed change"}
        </Typography>
        <Typography
          variant="micro"
          component="div"
          color="text.secondary"
          sx={{ display: "flex", alignItems: "center", gap: 0.75 }}
        >
          <Chip
            label={originLabel(proposal.origin)}
            size="small"
            sx={{
              height: 16,
              typography: "micro",
              "& .MuiChip-label": { px: 0.75 },
            }}
          />
          <DateDisplay date={proposal.proposedAt} variant="full" />
          {stale && (
            <Chip
              label="Out of date"
              size="small"
              color="warning"
              variant="outlined"
              sx={{
                height: 16,
                typography: "micro",
                "& .MuiChip-label": { px: 0.75 },
              }}
            />
          )}
        </Typography>
        {stale && (
          <Typography variant="micro" component="div" color="warning.main">
            You saved after this was proposed, so it can no longer be applied.
            Ask Claude again against the current content.
          </Typography>
        )}
      </Box>
      <Box sx={{ display: "flex", gap: 1, flexShrink: 0 }}>
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
          /* Absent rather than disabled when stale: a disabled primary button
            reads as "not yet", and there is no yet — the only exits are reject
            or a re-run against current content (§3.6). */
        }
        {!stale && (
          <Button
            size="small"
            variant="contained"
            disabled={busy}
            startIcon={<Check size={ICON_SIZE.inline} />}
            onClick={() => void approve(proposal)}
          >
            Approve
          </Button>
        )}
      </Box>
    </Box>
  );
}
