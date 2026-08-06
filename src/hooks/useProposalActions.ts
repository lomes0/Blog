"use client";
import { useCallback, useState } from "react";
import { actions, useDispatch } from "@/store";
import { useConfirm } from "@/hooks/useConfirm";
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
  const [busyId, setBusyId] = useState<string | null>(null);

  /**
   * Show the proposal as a diff against the document's current head.
   *
   * The document is opened first, and not only for the user's benefit:
   * `setDiffOpen` acts on the *focused* pane, so a review started from a rail
   * row for some other document would otherwise light up the diff in whatever
   * pane happened to have focus. `document.open` dispatches `openPane`
   * synchronously — including the duplicate-open guard — so by the next line the
   * focused pane is the right one.
   */
  const review = useCallback(async (proposal: PendingProposal) => {
    await run(documentCommands.open, {
      id: proposal.documentId,
      mode: "write",
    });
    dispatch(actions.setDiffRevisions({
      old: proposal.head ?? undefined,
      new: proposal.id,
    }));
    dispatch(actions.setDiffOpen(true));
  }, [run, dispatch]);

  const approve = useCallback(async (proposal: PendingProposal) => {
    setBusyId(proposal.id);
    try {
      const result = await dispatch(actions.approveProposal({
        documentId: proposal.documentId,
        revisionId: proposal.id,
      }));
      // A rejection has already been announced by the slice — including the 409
      // that means "you saved first", which is the one refusal this whole
      // feature exists to be able to make. Stop here rather than reloading a tab
      // to a head that did not move.
      if (actions.approveProposal.rejected.match(result)) return false;

      // There is nothing left to compare: the proposal *is* the document now.
      dispatch(actions.setDiffOpen(false));
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
      dispatch(actions.setDiffOpen(false));
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
      await dispatch(actions.discardAgentPost(post.id));
      return true;
    } finally {
      setBusyId(null);
    }
  }, [confirm, dispatch]);

  return { busyId, review, approve, reject, acceptPost, discardPost };
}
