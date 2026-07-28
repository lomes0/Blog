import { createSelector } from "@reduxjs/toolkit";
import { postsSelectors, RootState } from "@/store";
import { Post } from "@/types";

const selectPosts = (state: RootState) => postsSelectors.selectAll(state);
const selectSeries = (state: RootState) => state.series;

/**
 * Standalone posts — those that belong to no series and are not a tab of another
 * post. Used by the /posts page, where series render as their own section.
 */
export const selectStandalonePosts = createSelector(
  [selectPosts, selectSeries],
  (posts, series): Post[] => {
    const seriesPostIds = new Set<string>();
    series.forEach((s) => s.posts?.forEach((p) => seriesPostIds.add(p.id)));
    return posts.filter((post) =>
      post.type === "DOCUMENT" && !seriesPostIds.has(post.id) && !post.parentId
    );
  },
);

/**
 * The unified posts list: series members first (sourced from `series.posts`,
 * which is authoritative for membership), then the remaining standalone posts.
 *
 * Series members are resolved back to their store entity where possible so they
 * carry whatever the store already knows — loaded content, fresher timestamps —
 * rather than the thinner copy embedded in the series.
 */
export const selectAllPosts = createSelector(
  [selectPosts, selectSeries],
  (posts, series): Post[] => {
    const byId = new Map(posts.map((post) => [post.id, post]));
    const seriesPostIds = new Set<string>();
    const seriesPosts: Post[] = [];

    series.forEach((s) => {
      s.posts?.forEach((post) => {
        seriesPostIds.add(post.id);
        seriesPosts.push(byId.get(post.id) ?? post);
      });
    });

    const standalonePosts = posts.filter((post) =>
      post.type === "DOCUMENT" && !seriesPostIds.has(post.id) && !post.parentId
    );

    return [...seriesPosts, ...standalonePosts];
  },
);
