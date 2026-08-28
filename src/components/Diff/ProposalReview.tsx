"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Skeleton,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { Check, Minus, Pencil, Plus, X } from "lucide-react";
import htmr from "htmr";
import NProgress from "nprogress";
import { actions, useDispatch, useSelector } from "@/store";
import { generateHtml } from "@/editor/utils/generateHtml";
import { diffProposal, type Hunk } from "@/lib/proposalDiff";
import {
  buildReviewRows,
  decisionCounts,
  isolateBlock,
  isolateBlocks,
  rejectAllHunks,
  rejectedHunkIds,
  toggleRejection,
  type ReviewRow,
} from "@/lib/proposalReview";
import { emptyState } from "@/lib/content-bridge/ops";
import { describeRemovedBlock } from "@/lib/content-bridge/removals";
import type { StoredState } from "@/lib/content-bridge/types";
import { ICON_SIZE } from "@/theme/icons";
import type { PendingProposal } from "@/types";
import type { SerializedEditorState } from "lexical";

/**
 * Review a pending agent proposal one change at a time
 * (docs/plans/archive/haklex-adoption.md §7).
 *
 * ### Why this is not the word diff
 *
 * `DiffView` renders both revisions to HTML and diffs the *markup*. That is the
 * right shape for two pieces of history — it shows everything that moved and
 * asks nothing — but it cannot be the review surface for an agent, because a
 * word diff has no unit an author can accept or refuse. This renders the
 * document as **addressed blocks** instead, which is the same coordinate system
 * `apply_ops` writes in and the same one the approve route recomputes the
 * decision from, so a toggle on screen and a rejected hunk in the transaction
 * are the same thing named twice rather than two things kept in step.
 *
 * ### Where the decision lives, and why not here
 *
 * The refused ids go to the store (`ui.diff.rejectedHunks`). The button that
 * commits them is `EditDocument/AgentChangeBar`, which is sticky above this
 * list precisely so that a decision stays actionable on a proposal that runs
 * for pages — and a bar of our own competing for `top: 0` with that one is a
 * layout fight, not a feature. So this collects and the bar commits.
 *
 * ### Rendering a block on its own
 *
 * Every block goes through the same `generateHtml` — the module-level headless
 * editor over the real node registry — that `/view` and the word diff use, so
 * an image, a graph, a sketch, a kanban board or a table renders through its
 * own `exportDOM` and nothing here knows what a node type is. What this adds is
 * `isolateBlock`, which wraps one block back through its own ancestors so a
 * changed table cell renders as a one-cell table rather than as a bare `<td>`.
 *
 * `generateHtml` **can reject** — a node whose stored interior fails to parse
 * throws inside `parseEditorState` — so every block is rendered inside its own
 * `try`. One unreadable block must cost that block, not the review.
 *
 * ### The class name is load-bearing
 *
 * `globals.css` hides `.editor-input` when a `.diff-container` precedes it, so
 * the editor stays mounted (its undo history survives) and untypeable while a
 * review is open. Every state below — loading, error, empty, ready — therefore
 * renders inside that element. Returning `null` from any of them would put a
 * live editor under a review that has not finished loading.
 */
const ProposalReview = ({ proposal }: { proposal: PendingProposal }) => {
  const dispatch = useDispatch();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const stored = useSelector((store) => store.ui.diff.rejectedHunks);

  const rejected = useMemo(() => new Set(stored ?? []), [stored]);

  const getRevisionState = useCallback(
    async (revisionId: string): Promise<StoredState | null> => {
      try {
        const revision = await dispatch(actions.getRevision(revisionId))
          .unwrap();
        return revision.data as unknown as StoredState;
      } catch {
        return null;
      }
    },
    [dispatch],
  );

  // `version` is a dependency, not decoration: an agent batch squashing onto
  // this proposal while the review is open changes the content without changing
  // its id, and re-reading is the only way the hunks on screen stay the ones
  // the author is deciding about.
  const { id: proposalId, head, version } = proposal;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // A proposal against a document with no head yet diffs against nothing,
      // which reads as one insert per block — the same answer the server's
      // `materializePartial` gets, and the reason it is spelled here rather
      // than refused.
      const base = head ? await getRevisionState(head) : emptyState();
      if (cancelled) return;
      if (!base) {
        return setState({
          status: "error",
          message:
            "The current version of this document could not be read, so there " +
            "is nothing to compare the proposal against.",
        });
      }

      const proposed = await getRevisionState(proposalId);
      if (cancelled) return;
      if (!proposed) {
        return setState({
          status: "error",
          message: "The proposed version could not be read.",
        });
      }

      let computed: Hunk[];
      let rows: ReviewRow[];
      try {
        computed = diffProposal(base, proposed);
        rows = buildReviewRows(base, proposed, computed);
      } catch {
        // A diff that throws is a malformed stored state, not a user error.
        // Say so rather than showing an empty review, which would read as
        // "Claude changed nothing".
        return setState({
          status: "error",
          message:
            "This proposal could not be compared against the document. " +
            "Rejecting it and asking Claude again is the way out.",
        });
      }

      const html = await renderRows(rows, base, proposed);
      if (cancelled) return;
      setState({ status: "ready", hunks: computed, rows, html });
    };

    setState({ status: "loading" });
    NProgress.start();
    void load().finally(() => NProgress.done());
    return () => {
      cancelled = true;
      NProgress.done();
    };
  }, [proposalId, head, version, getRevisionState]);

  const hunks = state.status === "ready" ? state.hunks : EMPTY_HUNKS;

  const setRejected = useCallback(
    (next: ReadonlySet<string>) =>
      dispatch(actions.setRejectedHunks(rejectedHunkIds(hunks, next))),
    [dispatch, hunks],
  );

  // A decision naming a hunk this diff no longer contains is dropped rather
  // than sent — see `rejectedHunkIds`. Doing it as the hunks arrive, and not
  // only at approve time, is what keeps the counts on screen honest after a
  // squash retires a hunk somebody had refused.
  useEffect(() => {
    if (state.status !== "ready") return;
    const live = rejectedHunkIds(state.hunks, new Set(stored ?? []));
    if (live.length !== (stored ?? []).length) {
      dispatch(actions.setRejectedHunks(live));
    }
  }, [state, stored, dispatch]);

  if (state.status === "loading") {
    return (
      <div className="diff-container">
        <Skeleton variant="rounded" height={44} sx={{ mb: 2 }} />
        <Skeleton variant="text" width="70%" />
        <Skeleton variant="rounded" height={120} sx={{ my: 2 }} />
        <Skeleton variant="text" width="90%" />
        <Skeleton variant="text" width="60%" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="diff-container">
        <Alert severity="error" sx={{ mb: 2 }}>{state.message}</Alert>
      </div>
    );
  }

  if (state.hunks.length === 0) {
    return (
      <div className="diff-container">
        <Alert severity="info" sx={{ mb: 2 }}>
          {/* Not an error and not impossible: an agent can propose a batch whose
              ops cancel out, or re-propose what the document already says. */}
          This proposal matches the document exactly — there is nothing to
          apply. Reject it to clear it from your list.
        </Alert>
      </div>
    );
  }

  const counts = decisionCounts(state.hunks, rejected);

  return (
    <div className="diff-container">
      <Box
        sx={{
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
        <Typography variant="dense" component="div" sx={{ flex: 1, minWidth: 0 }}>
          {counts.total === 1 ? "1 change" : `${counts.total} changes`}
          {counts.refused > 0 && (
            <Typography
              variant="micro"
              component="span"
              color="text.secondary"
              sx={{ ml: 1 }}
            >
              {counts.accepted} to apply, {counts.refused} refused
            </Typography>
          )}
        </Typography>
        <Button
          size="small"
          variant="text"
          disabled={counts.refused === 0}
          onClick={() => setRejected(new Set())}
        >
          Accept all
        </Button>
        <Button
          size="small"
          variant="text"
          disabled={counts.refused === counts.total}
          onClick={() => setRejected(rejectAllHunks(state.hunks))}
        >
          Refuse all
        </Button>
      </Box>

      {counts.refused > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {counts.accepted === 0
            ? "Every change is refused, so approving would apply nothing. " +
              "Reject the proposal instead."
            : "Refused changes are discarded when you approve — they are not " +
              "kept for later."}
        </Alert>
      )}

      {state.rows.map((row) =>
        row.kind === "context"
          ? (
            /* Not dimmed. Untouched prose is the document, and lowering its
               contrast to make the cards stand out would fail §10 for the
               majority of the page to decorate the minority of it. The change
               cards earn their prominence from their own border and header. */
            <Box key={row.key}>
              <Rendered html={state.html[row.key]} />
            </Box>
          )
          : (
            <ChangeCard
              key={row.key}
              row={row}
              html={state.html}
              refused={rejected.has(row.hunk.id)}
              onDecide={(refuse) =>
                setRejected(
                  refuse === rejected.has(row.hunk.id)
                    ? rejected
                    : toggleRejection(rejected, row.hunk.id),
                )}
            />
          )
      )}
    </div>
  );
};

export default ProposalReview;

// ─── One change ──────────────────────────────────────────────────────────────

const KIND_LABEL: Record<Hunk["kind"], string> = {
  replace: "Changed",
  insert: "Added",
  delete: "Removed",
};

/** A human name for the container a nested hunk sits in. */
const CONTAINER_LABEL: Record<string, string> = {
  "blog-table": "in a table",
  tablerow: "in a table row",
  "layout-container": "in a column layout",
  "details-container": "in a collapsible section",
};

function ChangeCard(
  { row, html, refused, onDecide }: {
    row: Extract<ReviewRow, { kind: "change" }>;
    html: Record<string, string>;
    refused: boolean;
    onDecide: (refuse: boolean) => void;
  },
) {
  const { hunk } = row;
  const Glyph = hunk.kind === "insert"
    ? Plus
    : hunk.kind === "delete"
    ? Minus
    : Pencil;
  const where = row.container
    ? CONTAINER_LABEL[row.container] ?? `in a ${row.container}`
    : null;
  // What a delete takes with it, named rather than left to the render
  // (docs/plans/claude-code-backlog.md §5). Deletes only: on the other two kinds
  // the proposed side is on screen next to the base, so the change is already
  // legible, and a canvas is the case where it is not. Empty for ordinary prose
  // — the block below says what that was — and for a block whose stored shape
  // this build cannot read, which must cost the sentence and not the review.
  const removed = hunk.kind === "delete" && hunk.base
    ? describeRemovedBlock(hunk.base)
    : "";
  const subtitle = [removed, where].filter(Boolean).join(", ");

  // Which side of the card survives the author's decision — the one question a
  // per-hunk review has to answer at a glance, so it is derived once rather
  // than re-reasoned per side. It comes out the same for all three kinds:
  // refusing keeps what the document says today, accepting takes what was
  // proposed, and a delete simply has nothing on the proposed side.
  const keepsBase = refused;
  const keepsProposal = !refused;

  return (
    <Box
      component="section"
      aria-label={`${KIND_LABEL[hunk.kind]} block ${
        hunk.baseAddress ?? hunk.proposalAddress ?? ""
      }${subtitle ? ` — ${subtitle}` : ""}`}
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        mb: 2,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 0.75,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Box sx={{ color: "text.secondary", display: "flex", flexShrink: 0 }}>
          <Glyph size={ICON_SIZE.dense} />
        </Box>
        <Typography
          variant="dense"
          component="div"
          sx={{ flex: 1, minWidth: 0, fontWeight: 600 }}
        >
          {KIND_LABEL[hunk.kind]}
          {subtitle && (
            <Typography
              variant="micro"
              component="span"
              color="text.secondary"
              sx={{ ml: 1, fontWeight: 400 }}
            >
              {subtitle}
            </Typography>
          )}
        </Typography>
        {/* Not colour alone (DESIGN.md §10): the state is a pressed toggle with
            a label as well as a tint. */}
        <ToggleButtonGroup
          size="small"
          exclusive
          value={refused ? "refuse" : "accept"}
          onChange={(_event, value) => {
            if (value === "accept") onDecide(false);
            if (value === "refuse") onDecide(true);
          }}
          aria-label="What to do with this change"
        >
          <ToggleButton value="accept" aria-label="Accept this change">
            <Check size={ICON_SIZE.inline} />
            <Box component="span" sx={{ ml: 0.5 }}>Accept</Box>
          </ToggleButton>
          <ToggleButton value="refuse" aria-label="Refuse this change">
            <X size={ICON_SIZE.inline} />
            <Box component="span" sx={{ ml: 0.5 }}>Refuse</Box>
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box sx={{ px: 1.5, py: 1 }}>
        {hunk.base && (
          <Side
            label="Now"
            kept={keepsBase}
            note={keepsBase
              ? null
              : hunk.kind === "delete"
              ? "will be removed"
              : "will be replaced"}
          >
            {/* `<del>` rather than a class of our own: `globals.css` already
                gives it the removed tint in both colour schemes (§19), and a
                second vocabulary for the same idea is how the two drift. */}
            <del style={{ textDecoration: "none" }}>
              <Rendered html={html[`${hunk.id}::base`]} />
            </del>
          </Side>
        )}
        {hunk.proposal && (
          <Side
            label="Proposed"
            kept={keepsProposal}
            note={keepsProposal ? null : "will not be applied"}
          >
            <ins style={{ textDecoration: "none" }}>
              <Rendered html={html[`${hunk.id}::proposal`]} />
            </ins>
          </Side>
        )}
        {hunk.kind === "delete" && keepsBase && (
          <Typography variant="micro" component="div" color="text.secondary">
            Refused — this block stays exactly as it is.
          </Typography>
        )}
      </Box>
    </Box>
  );
}

/**
 * One side of a change, dimmed when the current decision drops it.
 *
 * The dimming is a preview of the document you are about to get. It is always
 * accompanied by `note` in words — DESIGN.md §10: state is never carried by
 * appearance alone, and 45% opacity is exactly the kind of signal a reader with
 * low vision or a monochrome display does not receive.
 */
function Side(
  { label, kept, note, children }: {
    label: string;
    kept: boolean;
    note: string | null;
    children: React.ReactNode;
  },
) {
  return (
    <Box sx={{ mb: 1, opacity: kept ? 1 : 0.55 }}>
      <Typography
        variant="micro"
        component="div"
        color="text.secondary"
        sx={{ mb: 0.5, textTransform: "uppercase", letterSpacing: "0.04em" }}
      >
        {label}
        {note && ` — ${note}`}
      </Typography>
      {children}
    </Box>
  );
}

/** Rendered block HTML, or the reason there is none. */
function Rendered({ html }: { html: string | undefined }) {
  if (!html) {
    return (
      <Typography variant="micro" component="div" color="text.secondary">
        This block could not be displayed. Its content is unaffected by the
        decision you make here.
      </Typography>
    );
  }
  return <>{htmr(html)}</>;
}

// ─── Loading ─────────────────────────────────────────────────────────────────

const EMPTY_HUNKS: Hunk[] = [];

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
    status: "ready";
    hunks: Hunk[];
    rows: ReviewRow[];
    /** Block HTML by row key — `<hunk id>::base` / `::proposal` for a change. */
    html: Record<string, string>;
  };

const asEditorState = (state: StoredState) =>
  state as unknown as SerializedEditorState;

/** One block, or an empty string if it cannot be rendered. See the header. */
async function safeHtml(state: StoredState | null): Promise<string> {
  if (!state) return "";
  try {
    return await generateHtml(asEditorState(state));
  } catch {
    return "";
  }
}

async function renderRows(
  rows: readonly ReviewRow[],
  base: StoredState,
  proposal: StoredState,
): Promise<Record<string, string>> {
  const html: Record<string, string> = {};
  for (const row of rows) {
    if (row.kind === "context") {
      html[row.key] = await safeHtml(isolateBlocks(proposal, row.nodes));
      continue;
    }
    const { hunk } = row;
    if (hunk.base) {
      html[`${hunk.id}::base`] = await safeHtml(
        isolateBlock(base, hunk.baseAddress, hunk.base),
      );
    }
    if (hunk.proposal) {
      html[`${hunk.id}::proposal`] = await safeHtml(
        isolateBlock(proposal, hunk.proposalAddress, hunk.proposal),
      );
    }
  }
  return html;
}
