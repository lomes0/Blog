"use client";
import { useCallback, useState } from "react";
import { actions, useDispatch, useStore } from "@/store";
import {
  selectFocusedDocId,
  selectPaneShowingDoc,
} from "@/store/selectors/layoutSelectors";
import { useConfirm } from "@/hooks/useConfirm";
import { documentCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";
import { reloadAfterApproval } from "@/components/EditDocument/proposalReload";
import { WORKSPACE_ROUTE } from "@/lib/workspaceUrl";
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
  // Read at the moment of acting, not as of a render: `discardPost` has to know
  // which pane is showing a document *after* the delete has come back, and a
  // subscription for that would re-render every consumer of this hook — the rail
  // section and both panes' bars — on every workspace change.
  const store = useStore();
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
  const review = useCallback(async (proposal: PendingProposal) => {
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
   * Take a just-deleted document out of the workspace.
   *
   * Two shapes, because a pane can hold a document two ways. As a **tab** it is
   * one entry in a list the pane goes on without — the same `removeTab` the tab
   * strip's own delete dispatches after `deletePost`. As a pane's **root** there
   * is no pane left to show: a pane is defined by what it is rooted at, so the
   * pane goes with it.
   *
   * Not routed through the `pane.close` command, and no command is added for it.
   * `pane.close` refuses the last pane by design — "that is what leaving the
   * editor does" — and the last pane is precisely the case here, since a
   * discarded post is usually the only thing open. This is also not an action a
   * user or the Copilot can ask for on its own; it is the second half of one,
   * and `commands/__tests__/toolParity.test.ts` holds the registry to the AI tool
   * surface.
   */
  const closeDiscarded = useCallback((docId: string) => {
    const pane = selectPaneShowingDoc(store.getState(), docId);
    if (!pane) return;
    if (pane.rootId !== docId) {
      dispatch(actions.removeTab({ paneId: pane.id, tabId: docId }));
      return;
    }
    dispatch(actions.closePane(pane.id));

    // The address bar still names the post that is gone, and the focus
    // projection in `WorkspacePanes` will not repair it: that guard declines
    // while the URL names a document no pane holds, because in every other case
    // that means a navigation is in flight (`lib/workspaceUrl.ts`). Closing is
    // the one way to reach that state deliberately, so — as in `pane.close` —
    // the closer owns it.
    //
    // Read back rather than predicted: which pane inherits focus is
    // `closePane`'s rule, and duplicating it here would be a second copy to keep
    // in step.
    //
    // With no pane left there is nothing to point at. `/edit` with no id is the
    // route's "Document Not Found" splash rather than an empty workspace, so
    // rewriting to it would trade a blank editor for an error; the address is
    // left naming the discarded post, where it only matters again on a reload —
    // the same place every other delete in the app leaves it.
    const nextDocId = selectFocusedDocId(store.getState());
    if (!nextDocId || typeof window === "undefined") return;
    if (!window.location.pathname.startsWith(`${WORKSPACE_ROUTE}/`)) return;
    window.history.replaceState(null, "", `${WORKSPACE_ROUTE}/${nextDocId}`);
  }, [dispatch, store]);

  /**
   * Confirmed, unlike reject: this deletes a whole post rather than a proposal
   * nobody could reach. Rejecting costs nothing — Claude can write it again —
   * whereas a discarded post is gone, and the two buttons sit next to each other
   * in the same list.
   *
   * It also has to close the document, and that belongs here rather than at
   * either call site: the bar discards the post the pane it lives in is showing,
   * and the rail can discard one that happens to be open behind it. `removePost`
   * drops the entity and does not touch `ui.workspace`, so without this the
   * editor is left mounted on a document that no longer exists.
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
      closeDiscarded(post.id);
      return true;
    } finally {
      setBusyId(null);
    }
  }, [confirm, dispatch, closeDiscarded]);

  return { busyId, review, approve, reject, acceptPost, discardPost };
}
