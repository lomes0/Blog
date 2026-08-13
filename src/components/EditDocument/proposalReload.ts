/**
 * How an approved proposal reaches a tab that is already showing the document.
 *
 * docs/plans/archive/agent-gating.md §3.9: approving moves `Document.head`, and until
 * the user next typed, an open editor would go on showing content that is no
 * longer the document. So the panel that owns the editor registers a callback
 * here, and whoever approves — the rail, the review bar, anything later — calls
 * it by document id and does not have to know whether that document is open.
 *
 * Deliberately the same shape as `saveRegistry` next door, and deliberately
 * *not* a slice of the store: this is one message to at most one component, and
 * nothing renders from it. Keying by document id is what makes the "one document
 * in at most one pane" invariant (plan §5.2 of workspace-panes.md) enough — a
 * second live editor for the same document would already have broken saving.
 */

/** Reload this document from storage. Resolves when the tab has settled. */
type ReloadCallback = () => Promise<void>;

const reloadCallbacks = new Map<string, ReloadCallback>();

export function registerProposalReload(
  docId: string,
  fn: ReloadCallback,
): void {
  reloadCallbacks.set(docId, fn);
}

export function unregisterProposalReload(docId: string): void {
  reloadCallbacks.delete(docId);
}

/**
 * Tell an open tab that its document changed underneath it.
 *
 * A no-op when the document is not open, which is the common case: approving
 * from the rail usually happens on a document you are not looking at, and there
 * is nothing to reload. Silent either way — a success does not announce itself.
 */
export async function reloadAfterApproval(docId: string): Promise<void> {
  const fn = reloadCallbacks.get(docId);
  if (!fn) return;
  await fn();
}
