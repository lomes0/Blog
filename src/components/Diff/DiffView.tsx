"use client";
import HtmlDiff from "@/lib/diff/Diff";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "@mui/material";
import { actions, useDispatch, useSelector } from "@/store";
import { generateHtml } from "@/editor/utils/generateHtml";
import htmr from "htmr";
import NProgress from "nprogress";

/**
 * Compare two revisions of the open document.
 *
 * **This component only reads.** It used to carry a second, byte-identical
 * `try` block behind a "not in local, try cloud" comment describing a fallback
 * that was never written — and that copy dispatched `createRevision` on what it
 * had just fetched, i.e. the review surface was a write path onto the row under
 * review. Harmless while every revision id was immutable history; not harmless
 * now that `diff.new` can be a pending proposal, which `createRevision` upserts
 * by id (docs/plans/agent-gating.md §2.1). The write is gone rather than
 * guarded: nothing here ever needed it.
 *
 * **This is no longer the agent-proposal surface.** Reviewing what Claude
 * proposed goes through `ProposalReview`, which renders the same two states as
 * addressed blocks so each change can be accepted or refused on its own
 * (docs/plans/haklex-adoption.md §7.2). What stays here is revision-to-revision
 * comparison, which is a different job: two pieces of history, nothing to
 * decide, and a whole-document word diff is the right shape for it.
 */
const DiffView = () => {
  const dispatch = useDispatch();
  // Which revisions to compare is global; whether this pane shows the result is
  // the pane's own `diffOpen`, which is what gates rendering DiffView at all.
  const diff = useSelector((state) => state.ui.diff);
  const [html, setHtml] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const getEditorDocumentRevision = useCallback(async (revisionId: string) => {
    try {
      return await dispatch(actions.getRevision(revisionId)).unwrap();
    } catch {
      return undefined;
    }
  }, [dispatch]);

  useEffect(() => {
    let cancelled = false;
    const diffRevisions = async () => {
      const oldRevisionId = diff.old;
      const newRevisionId = diff.new;
      if (!oldRevisionId || !newRevisionId) return;
      const oldRevision = await getEditorDocumentRevision(oldRevisionId);
      if (cancelled) return;
      if (!oldRevision) {
        return setError(
          "The version being compared against could not be read.",
        );
      }
      const oldHtml = await generateHtml(oldRevision.data);
      if (cancelled) return;
      if (oldRevisionId === newRevisionId) return setHtml(oldHtml);
      const newRevision = await getEditorDocumentRevision(newRevisionId);
      if (cancelled) return;
      if (!newRevision) {
        return setError("The proposed version could not be read.");
      }
      const newHtml = await generateHtml(newRevision.data);
      if (cancelled) return;
      setHtml(HtmlDiff.execute(oldHtml, newHtml));
    };
    setError(null);
    NProgress.start();
    diffRevisions().then(() => NProgress.done());
    return () => {
      cancelled = true;
      NProgress.done();
    };
  }, [diff, getEditorDocumentRevision]);

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }
  if (!html) return null;

  return <div className="diff-container">{htmr(html)}</div>;
};

export default DiffView;
