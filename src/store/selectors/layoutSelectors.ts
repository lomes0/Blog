import { createSelector } from "@reduxjs/toolkit";
import { postsSelectors, type RootState } from "@/store";
import { comparePostsByRank } from "@/lib/documentOrder";
import type { Post } from "@/types";

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
 * post is currently open — the live `ui.tabs` slice only knows the open one.
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
