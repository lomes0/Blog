"use client";
import { useCallback, useState } from "react";
import { actions, useDispatch } from "@/store";
import { useConfirm } from "@/hooks/useConfirm";
import { useCloseDeletedDocument } from "@/hooks/useCloseDeletedDocument";
import { documentCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";
import { reloadAfterApproval } from "@/components/EditDocument/proposalReload";
import type { AgentCreatedPost, PendingProposal } from "@/types";

/**
 * The four answers an author can give an agent, plus "let me look at it first".
 *
 * Shared by the rail section and the review bar over the diff, because the
 * *sequence* is the part worth having once: approve, then reload whatever tab is
 * showing that document (docs/plans/agent-gating.md §3.9). Getting the second
 * half right in one of the two call sites and not the other is exactly the kind
 * of drift that leaves a tab showing content that is no longer the document.
 *
 * `busyId` is the disabled state (DESIGN.md §9): the id currently in flight, so
 * a row can disable its own buttons without a spinner appearing on every other
 * row in the list.
 */
export function useProposalActions() {
  const dispatch = useDispatch();
  const confirm = useConfirm();
  const run = useCommandRun();
  const closeDeleted = useCloseDeletedDocument();
  const [busyId, setBusyId] = useState<string | null>(null);

  /**
   * Show the proposal as a diff against the document's current head.
   *
   * The document is opened first because that is the order the user sees, but
   * the diff no longer depends on the open having *finished*: `setDiffOpen`
   * names the document, so the request is recorded whether or not a pane holds
   * it yet, and `openPane` honours it when one does.
   *
   * That distinction is not theoretical. Reviewing a document the workspace was
   * not already showing rebuilds the pane after this line runs — the layout
   * restore lands, the deep link replays, and in development React mounts
   * `WorkspacePanes` twice, whose unmount half dispatches `closeAllPanes`. Each
   * of those used to reset a flag that had been written onto a pane, so the
   * first click opened the document with no diff and only a second one, against
   * a workspace that had settled, showed the review bar.
   */
  const review = useCallback(async (
    // Three fields rather than the whole row, so the Copilot transcript can
    // offer Review from what its write just returned — a proposal id and the
    // document it is against — without fabricating a listing row it does not
    // have (docs/plans/ai-surface-consolidation.md §4.4.5). Every other caller
    // passes a `PendingProposal`, which satisfies this.
    proposal: Pick<PendingProposal, "id" | "documentId" | "head">,
  ) => {
    await run(documentCommands.open, {
      id: proposal.documentId,
      mode: "write",
    });
    dispatch(actions.setDiffRevisions({
      old: proposal.head ?? undefined,
      new: proposal.id,
    }));
    dispatch(actions.setDiffOpen({ docId: proposal.documentId, open: true }));
  }, [run, dispatch]);

  /**
   * @param rejectedHunks the hunks the author refused in the per-hunk review
   * (docs/plans/haklex-adoption.md §7). Omitted — the case for every caller
   * that is not the review surface — approves the proposal whole, with the
   * bodiless request that has always meant that.
   */
  const approve = useCallback(async (
    proposal: PendingProposal,
    rejectedHunks?: string[],
  ) => {
    setBusyId(proposal.id);
    try {
      const result = await dispatch(actions.approveProposal({
        documentId: proposal.documentId,
        revisionId: proposal.id,
        rejectedHunks,
        // Only pinned when something was refused: a whole-proposal approval
        // takes the row as it stands, whatever batch that now includes.
        version: proposal.version,
      }));
      // A rejection has already been announced by the slice — including the 409
      // that means "you saved first", which is the one refusal this whole
      // feature exists to be able to make. Stop here rather than reloading a tab
      // to a head that did not move.
      if (actions.approveProposal.rejected.match(result)) return false;

      // There is nothing left to compare: the proposal *is* the document now.
      dispatch(actions.setDiffOpen({
        docId: proposal.documentId,
        open: false,
      }));
      await reloadAfterApproval(proposal.documentId);
      return true;
    } finally {
      setBusyId(null);
    }
  }, [dispatch]);

  const reject = useCallback(async (proposal: PendingProposal) => {
    setBusyId(proposal.id);
    try {
      const result = await dispatch(actions.rejectProposal({
        documentId: proposal.documentId,
        revisionId: proposal.id,
      }));
      if (actions.rejectProposal.rejected.match(result)) return false;
      dispatch(actions.setDiffOpen({
        docId: proposal.documentId,
        open: false,
      }));
      return true;
    } finally {
      setBusyId(null);
    }
  }, [dispatch]);

  const acceptPost = useCallback(async (post: AgentCreatedPost) => {
    setBusyId(post.id);
    try {
      await dispatch(actions.acceptAgentPost(post.id));
    } finally {
      setBusyId(null);
    }
  }, [dispatch]);

  /**
   * Confirmed, unlike reject: this deletes a whole post rather than a proposal
   * nobody could reach. Rejecting costs nothing — Claude can write it again —
   * whereas a discarded post is gone, and the two buttons sit next to each other
   * in the same list.
   *
   * It also has to close the document, and that belongs here rather than at
   * either call site: the bar discards the post the pane it lives in is showing,
   * and the rail can discard one that happens to be open behind it. What that
   * takes is `useCloseDeletedDocument`, shared with every other delete — a
   * discard *is* a delete, and the two answering differently would have been the
   * drift this hook exists to avoid.
   */
  const discardPost = useCallback(async (post: AgentCreatedPost) => {
    const ok = await confirm({
      title: "Discard this post?",
      content: `“${post.name}” was created by an agent and has not been ` +
        "published. Discarding deletes it.",
      confirmLabel: "Discard",
    });
    if (!ok) return false;
    setBusyId(post.id);
    try {
      const result = await dispatch(actions.discardAgentPost(post.id));
      // Nothing was deleted, so nothing should close. The slice has already
      // announced why.
      if (actions.discardAgentPost.rejected.match(result)) return false;
      closeDeleted(post.id);
      return true;
    } finally {
      setBusyId(null);
    }
  }, [confirm, dispatch, closeDeleted]);

  return { busyId, review, approve, reject, acceptPost, discardPost };
}
