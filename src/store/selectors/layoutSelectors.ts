import { createSelector } from "@reduxjs/toolkit";
import { postsSelectors, type RootState } from "@/store";
import { comparePostsByRank } from "@/lib/documentOrder";
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
