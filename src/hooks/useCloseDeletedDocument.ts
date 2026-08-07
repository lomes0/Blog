"use client";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { actions, useDispatch, useStore } from "@/store";
import {
  selectFocusedDocId,
  selectPaneShowingDoc,
} from "@/store/selectors/layoutSelectors";
import { WORKSPACE_ROUTE } from "@/lib/workspaceUrl";

/** Where a workspace with nothing left in it goes. */
export const HOME_ROUTE = "/";

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
 * ## The address bar
 *
 * The focus projection in `WorkspacePanes` will not repair it: that guard
 * declines while the URL names a document no pane holds, because in every other
 * case that means a navigation is in flight (`lib/workspaceUrl.ts`). Deleting is
 * one of the two ways to reach that state deliberately, so — as in `pane.close`
 * — the closer owns it.
 *
 * With a pane left, that is a `replaceState` to whatever inherited focus: not a
 * navigation, so `/edit`'s `force-dynamic` render is not paid for it (see
 * `workspaceUrl.ts` on why Next 15 follows a patched `replaceState`). Which pane
 * inherits is read back rather than predicted — that is `closePane`'s rule, and
 * duplicating it here would be a second copy to keep in step.
 *
 * With no pane left there is nothing to point at, and `/edit` with no id is the
 * route's "Document Not Found" splash rather than an empty workspace. So this
 * leaves the editor for the home route. `replace`, not `push`: the deleted
 * post's URL is not somewhere Back should be able to return to — it would
 * restore the same ghost editor this exists to close.
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

    if (typeof window === "undefined") return;
    if (!window.location.pathname.startsWith(WORKSPACE_ROUTE)) return;

    const nextDocId = selectFocusedDocId(store.getState());
    if (nextDocId) {
      window.history.replaceState(null, "", `${WORKSPACE_ROUTE}/${nextDocId}`);
      return;
    }
    router.replace(HOME_ROUTE);
  }, [dispatch, router, store]);
}
