/**
 * Where the address bar should point, given what the workspace is looking at.
 *
 * Plan §0 makes workspace state the source of truth and the URL a *projection*
 * of it. `document.open` and `pane.split` already keep that honest on the paths
 * that **open** a document — they push. What they cannot cover is focus moving
 * with nothing opened: clicking from the right pane back to the left changes
 * `focusedPaneId` and nothing else, so the URL went on naming the pane the user
 * had just left, and a reload restored focus to the wrong one.
 *
 * This module is the decision half of closing that. It is deliberately
 * import-free and pure — the same reason `dragGeometry.ts` is — so the guards
 * below can be exercised directly rather than through a mounted editor.
 *
 * ## Why the caller writes it with `history.replaceState`
 *
 * `/edit/[[...id]]` is `force-dynamic`. A `router.push`/`router.replace` per
 * click between panes would be a server round trip per click, which is the cost
 * that kept this item open. Next 15 patches `window.history.pushState` and
 * `replaceState` (`next/dist/client/components/app-router.js`) so that a call
 * dispatches `ACTION_RESTORE` — and `restoreReducer` only re-points
 * `canonicalUrl`, reusing the existing router cache and tree. It does not
 * reference `fetchServerResponse` at all, unlike `navigateReducer`. So the
 * address bar moves, `usePathname()` moves with it, and the server is not
 * consulted.
 *
 * `replace`, not `push`: focus is not a place in history, and one entry per
 * click would make the back button unusable.
 */

/** The workspace route. `/edit/<focused document>` is its only shape. */
export const WORKSPACE_ROUTE = "/edit";

export interface WorkspaceUrlInput {
  /**
   * The real address bar, read at the moment of acting rather than from a
   * render — it is what we are about to overwrite.
   */
  currentPath: string;
  /** Plan §8.2's restore gate. Down means the layout is still being read. */
  workspaceHydrated: boolean;
  /**
   * The document the URL currently names, **already resolved to an id**.
   *
   * `/edit/[id]` accepts a handle, and panes are keyed by id, so comparing the
   * raw segment against a document id would answer "different" forever and
   * rewrite the URL on every render. The deep-link seam resolves it once; this
   * takes the answer.
   */
  urlDocId: string | null;
  /** `selectFocusedDocId` — the active tab, falling back to the pane's root. */
  focusedDocId: string | null;
  /** Whether {@link urlDocId} is held by any pane, as a root or as a tab. */
  urlDocIsOpen: boolean;
}

/**
 * The path to write, or `null` to leave the address bar alone.
 *
 * The five refusals, in order, and why each one exists:
 *
 * 1. **Not on `/edit`.** The workspace is the only route whose URL names a
 *    document. `/posts`, the home pane and everything public keep their own.
 * 2. **Not hydrated.** The restore is still in flight; rewriting now would race
 *    the layout it is about to install.
 * 3. **Nothing focused.** There is no answer to project.
 * 4. **The URL already names the focused document.** Compared as *documents*,
 *    not as strings — which is what leaves a handle URL (`/edit/my-post`)
 *    intact for as long as that post is the focused one. Only a genuine change
 *    of focus rewrites it, and then to the canonical id, because that is what a
 *    pane is keyed by.
 * 5. **The URL names something no pane holds.** Then the URL is still an
 *    *input*, not a projection: either a deep link the seam has not replayed
 *    yet, or a `router.push` from `document.open` / `pane.split` that has not
 *    landed. Overwriting it in that window would clobber a navigation in
 *    flight — and, worse, `HistoryUpdater` skips the pending push when the
 *    location already equals the canonical URL, so the entry the user came from
 *    would be dropped from history rather than pushed past.
 *
 * The last check is the plain one: never write a path the browser already has.
 */
export function workspaceUrlForFocus(input: WorkspaceUrlInput): string | null {
  const { currentPath, workspaceHydrated, urlDocId, focusedDocId, urlDocIsOpen }
    = input;

  if (
    currentPath !== WORKSPACE_ROUTE
    && !currentPath.startsWith(`${WORKSPACE_ROUTE}/`)
  ) return null;
  if (!workspaceHydrated) return null;
  if (!focusedDocId) return null;
  if (focusedDocId === urlDocId) return null;
  if (!urlDocIsOpen) return null;

  const next = `${WORKSPACE_ROUTE}/${focusedDocId}`;
  return next === currentPath ? null : next;
}
