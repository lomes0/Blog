"use client";
import { useSelector } from "@/store";
import DiffView from "./DiffView";
import ProposalReview from "./ProposalReview";

/**
 * Which comparison surface a pane's review mode gets.
 *
 * Two things are being compared here and only one of them is a *decision*.
 * Revision against revision is reading — two pieces of history, nothing to do
 * about it — and a whole-document word diff says that best. A pending agent
 * proposal against the document is a question the author has to answer, block
 * by block, which is what `ProposalReview` is for
 * (docs/plans/archive/haklex-adoption.md §7.2).
 *
 * The branch is on identity, not on a mode flag: the right-hand side of the
 * comparison *being* this document's pending proposal is the whole condition,
 * and it is a fact about the store rather than something a caller has to
 * remember to pass. Open the diff on two revisions of a document that also has
 * a proposal and you still get the word diff, which is correct — that is not
 * the proposal you asked to see.
 */
const Diff = ({ docId }: { docId: string }) => {
  const proposal = useSelector((state) => state.ui.proposals.byDocId[docId]);
  const comparing = useSelector((state) => state.ui.diff.new);

  return proposal && proposal.id === comparing
    ? <ProposalReview proposal={proposal} />
    : <DiffView />;
};

export default Diff;
