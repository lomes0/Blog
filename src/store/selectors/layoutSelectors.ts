import { createSelector } from "@reduxjs/toolkit";
import { postsSelectors, type RootState } from "@/store";
import { paneShowing } from "@/store/app";
import { comparePostsByRank } from "@/lib/documentOrder";
import type { PaneDescription } from "@/commands/types";
import type { PaneMode, Post, WorkspacePane } from "@/types";

/* ------------------------------------------------------------------ */
/*  Workspace                                                          */
/* ------------------------------------------------------------------ */

/**
 * What the workspace is looking at, as state.
 *
 * These replace the pathname parsing that used to answer "which document is
 * open" in three different places, each with its own rule (plan §0). The URL is
 * now a projection: `/edit/[id]` is what opened the pane, not what defines it.
 */
export const selectFocusedPaneId = (state: RootState): string | null =>
  state.ui.workspace.focusedPaneId;

/**
 * The pane the user is acting in, or null when nothing is open.
 *
 * Not memoized on purpose — it returns a pane already in the state tree, so its
 * identity is as stable as the pane itself.
 */
export const selectFocusedPane = (state: RootState): WorkspacePane | null => {
  const { panes, focusedPaneId } = state.ui.workspace;
  if (!focusedPaneId) return null;
  return panes.find((pane) => pane.id === focusedPaneId) ?? null;
};

export const selectPaneById = (
  state: RootState,
  paneId: string | null,
): WorkspacePane | null => {
  if (!paneId) return null;
  return state.ui.workspace.panes.find((pane) => pane.id === paneId) ?? null;
};

/**
 * The pane rooted at a post, in **any** pane — "is this post open?", which is
 * what the sidebar asks of every row it draws.
 *
 * Deliberately not "the focused pane, if it happens to be this post". With two
 * panes that answer marks only one of the two open posts, and it makes a
 * sidebar sub-tab click ambiguous: the row would switch the *focused* pane's
 * active tab to a document that pane does not hold. Answering with the pane
 * itself is what lets the caller act on the right one.
 *
 * At most one pane can match — one document, one pane (plan §5.2).
 */
export const selectPaneRootedAt = (
  state: RootState,
  postId: string,
): WorkspacePane | null =>
  state.ui.workspace.panes.find((pane) => pane.rootId === postId) ?? null;

/**
 * The pane showing a document as its root **or as one of its tabs** — "does the
 * workspace hold this at all?".
 *
 * The wider question than {@link selectPaneRootedAt}, and the one the URL
 * projection asks: the address bar can legitimately name a child tab, and a pane
 * holding it is still a pane holding it. Delegates to the same predicate the
 * duplicate-open guard uses, so there is one definition of "showing".
 */
export const selectPaneShowingDoc = (
  state: RootState,
  docId: string | null,
): WorkspacePane | null =>
  (docId ? paneShowing(state, docId) : undefined) ?? null;

/**
 * The document the workspace is focused on — the active tab, falling back to
 * the pane's root while the tab list is still being fetched.
 *
 * This is the one answer the Copilot, the right rail and the command registry
 * all read. It is deliberately the *tab*, not the root: reading or editing a
 * sub-tab means that sub-tab is what "this document" refers to.
 */
export const selectFocusedDocId = (state: RootState): string | null => {
  const pane = selectFocusedPane(state);
  if (!pane) return null;
  return pane.activeTabId ?? pane.rootId;
};

/** How the focused document is being shown; null when nothing is focused. */
export const selectFocusedDocMode = (state: RootState): PaneMode | null =>
  selectFocusedPane(state)?.mode ?? null;

/**
 * The workspace as the Copilot is allowed to see it (plan §6.2) — one row per
 * pane, already resolved to a document and a title.
 *
 * Memoized because it is handed to the command context, which every `run` call
 * closes over: an array rebuilt on each store read would make that context a new
 * object on every unrelated dispatch.
 */
export const selectPaneDescriptions = createSelector(
  [
    (state: RootState) => state.ui.workspace.panes,
    (state: RootState) => state.ui.workspace.focusedPaneId,
    (state: RootState) => state.ui.workspace.maximizedPaneId,
    (state: RootState) => state.posts.entities,
  ],
  (panes, focusedPaneId, maximizedPaneId, entities): PaneDescription[] =>
    panes.map((pane) => {
      const docId = pane.activeTabId ?? pane.rootId ?? null;
      return {
        id: pane.id,
        docId,
        title: (docId ? entities[docId]?.name : null) ?? null,
        mode: pane.mode,
        focused: pane.id === focusedPaneId,
        maximized: pane.id === maximizedPaneId,
      };
    }),
);

/** Whether one pane is currently filling the row, and which. */
export const selectMaximizedPaneId = (state: RootState): string | null =>
  state.ui.workspace.maximizedPaneId;

/* ------------------------------------------------------------------ */
/*  SideBar                                                            */
/* ------------------------------------------------------------------ */

const selectAllPosts = (state: RootState) => postsSelectors.selectAll(state);

/**
 * Root posts owned by the current session — everything the sidebar lists at top
 * level. Tabs (posts with a `parentId`) are excluded; they render nested under
 * their parent.
 *
 * The store only ever holds the session's own posts, so ownership needs no
 * filtering here. Memoized so the sidebar doesn't re-render on unrelated
 * mutations.
 */
export const selectRootPosts = createSelector(
  [selectAllPosts],
  (posts): Post[] => posts.filter((post) => !post.parentId),
);

/**
 * Child posts (tabs) grouped by parent id, ordered by manual `rank`. A tabbed
 * post is a root post with one child per extra tab (see `mergePostsIntoTabs`).
 * The sidebar reads from here so it can render a post's tabs regardless of which
 * post is currently open — `ui.workspace` only knows the open ones.
 */
export const selectChildPostsByParent = createSelector(
  [selectAllPosts],
  (posts): Map<string, Post[]> => {
    const map = new Map<string, Post[]>();
    for (const post of posts) {
      if (!post.parentId) continue;
      const siblings = map.get(post.parentId);
      if (siblings) siblings.push(post);
      else map.set(post.parentId, [post]);
    }
    for (const siblings of map.values()) siblings.sort(comparePostsByRank);
    return map;
  },
);
