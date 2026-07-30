"use client";
import { useMemo } from "react";
import { shallowEqual } from "react-redux";
import { postsSelectors, type RootState, useSelector } from "@/store";

/** How many rows "Jump back in" shows. */
export const RECENT_LIMIT = 4;

export interface RecentPost {
  id: string;
  title: string;
  /** Owning series title, or `null` for a post that sits at the root. */
  series: string | null;
  /** Epoch ms, for relative-time rendering on the client. */
  updatedAt: number;
}

/**
 * The most recently edited posts, for the home pane's "Jump back in" list.
 *
 * Tabs are excluded. A tabbed post's children are `Document` rows like any
 * other and carry their own `updatedAt`, so editing one would otherwise push a
 * row into the list that has no page of its own to open — the user opens the
 * parent and lands on a tab they did not ask for.
 *
 * The store already sorts on `loadPosts`, but individual writes upsert in
 * place, so the order is re-established here rather than assumed.
 */
export const useRecentPosts = (limit = RECENT_LIMIT): RecentPost[] => {
  const posts = useSelector(
    (state: RootState) => postsSelectors.selectAll(state),
    shallowEqual,
  );
  const series = useSelector(
    (state: RootState) => state.series,
    shallowEqual,
  );

  return useMemo(() => {
    const titleById = new Map(series.map((s) => [s.id, s.title]));

    return posts
      .filter((post) => !post.parentId)
      .map((post) => ({
        id: post.id,
        title: post.name || "Untitled",
        series: post.seriesId
          ? titleById.get(post.seriesId) ?? post.series?.title ?? null
          : null,
        updatedAt: new Date(post.updatedAt).getTime(),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }, [posts, series, limit]);
};
