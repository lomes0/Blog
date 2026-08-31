"use client";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { actions, useDispatch, useStore } from "@/store";
import {
  selectFocusedDocId,
  selectPaneShowingDoc,
} from "@/store/selectors/layoutSelectors";

/** Where a workspace with nothing left in it goes. */
const HOME_ROUTE = "/";

/**
 * Take a just-deleted document out of the workspace, and leave the address bar
 * pointing at something that still exists.
 *
 * `removePost` (`store/app.ts`) drops the entity and deliberately does not touch
 * `ui.workspace` — a reducer cannot navigate, and half the repair would be worse
 * than none. So deleting an open post used to leave its pane mounted on it: the
 * title fell to "Untitled" (`DocumentHeader` reads the store, which is now
 * empty) while the body stayed on screen (`usePostLoader` keys its fetch on the
 * document id, which did not change, so it never re-ran and its `loadedPost`
 * held the last copy). Every save from that editor was silently dropped, too —
 * `useSave` derives its `postId` from the Redux entity and returns early without
 * one.
 *
 * Two shapes, because a pane can hold a document two ways. As a **tab** it is
 * one entry in a list the pane goes on without. As a pane's **root** there is no
 * pane left to show: a pane is defined by what it is rooted at, so the pane goes
 * with it.
 *
 * Not routed through the `pane.close` command, and no command is added for it.
 * `pane.close` refuses the last pane by design — "that is what leaving the
 * editor does" — and the last pane is precisely the case here, since the post
 * being deleted is usually the only thing open. This is also not an action a
 * user or the Copilot can ask for on its own; it is the second half of one, and
 * `commands/__tests__/toolParity.test.ts` holds the registry to the AI tool
 * surface.
 *
 * ## Who calls it
 *
 * It is no longer only the second half of a delete *this* tab performed.
 * `useBackgroundRefresh` runs the change-feed catch-up
 * (docs/plans/archive/changes-detection.md §3), and that reports deletions made
 * somewhere else entirely — a second browser tab, an agent in a terminal — as
 * ids missing from the full set. Those removals reach the store through
 * `reconcilePosts`, which is a reducer and so cannot navigate, and they would
 * otherwise strand a pane on a document that no longer exists: precisely the
 * "Untitled" title, stale body and silently dropped saves described above, but
 * arriving with no user action to attach a repair to. So the catch-up calls
 * this for every id it proves gone, and the reducer stays pure.
 *
 * That is also why the repair is driven by *proven* deletions rather than by
 * watching for a pane whose document is missing from the store. A pane can
 * legitimately be rooted at a document the store does not hold yet: the
 * workspace restore is gated on `workspaceHydrated` and deliberately **not** on
 * `ui.initialized` (see `WorkspacePanes`), so on a cold load every restored
 * pane predates `loadPosts` — and a collab document opened by deep link is
 * absent until its own `getPost` lands. A "missing entity" watcher would close
 * those panes out from under the user.
 *
 * Callers with a batch — a bulk delete, a catch-up — loop over ids and call
 * this once each, rather than it taking a list. Each call is a no-op when no
 * pane holds the document, and the navigation is the last thing that happens,
 * so at most one of them ends up moving the address bar.
 *
 * ## The address bar
 *
 * Almost nothing, since docs/plans/archive/workspace-url.md §3 made the URL an
 * entry point rather than a projection of focus. There used to be a
 * `replaceState` to whatever pane inherited focus, because the address bar
 * still named the document that had just been deleted and the focus projection
 * deliberately declined to repair that case. The address bar reads `/edit`
 * before and after now, so with a pane left there is simply nothing to do.
 *
 * With **no** pane left there still is. An empty workspace has nothing to show,
 * and `WorkspacePanes`' own empty-workspace redirect is a one-shot on *arrival*
 * — deliberately not a standing watch, precisely so it cannot race this. So the
 * closer keeps the last-pane case: it leaves the editor for the home route.
 * `replace`, not `push` — the deleted post is not somewhere Back should be able
 * to return to, and under the old model it would have restored the same ghost
 * editor this exists to close.
 *
 * Whether a pane is left is read back rather than predicted, because which pane
 * inherits focus is `closePane`'s rule and duplicating it here would be a
 * second copy to keep in step.
 */
export function useCloseDeletedDocument() {
  const dispatch = useDispatch();
  // Read at the moment of acting, not as of a render: this has to know which
  // pane is showing a document *after* the delete has come back, and a
  // subscription for that would re-render every consumer on every workspace
  // change.
  const store = useStore();
  const router = useRouter();

  return useCallback((docId: string) => {
    const pane = selectPaneShowingDoc(store.getState(), docId);
    // Nothing open on it — the overwhelmingly common case, since panes exist
    // only while `/edit` is mounted and most deletes happen from `/posts` or a
    // document card.
    if (!pane) return;

    if (pane.rootId !== docId) {
      dispatch(actions.removeTab({ paneId: pane.id, tabId: docId }));
      return;
    }
    dispatch(actions.closePane(pane.id));

    // Something survived, so the workspace still has something to show and the
    // address bar already reads `/edit`. Nothing to navigate.
    if (selectFocusedDocId(store.getState())) return;
    router.replace(HOME_ROUTE);
  }, [dispatch, router, store]);
}
