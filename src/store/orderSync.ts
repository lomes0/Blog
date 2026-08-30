import type { EntityState } from "@reduxjs/toolkit";
import { compareRankThenId } from "@/lib/ordering";
import type { Post, Project, Series, User } from "@/types";

/**
 * The store's half of the dual write in
 * docs/plans/ordering-simplification.md §8.
 *
 * Reads come from the order arrays now, but a reorder is still a `rank` write:
 * the drag handler computes the ranks bracketing its drop, the thunk sets one
 * optimistically, and the server mints the authoritative one. Nothing in that
 * chain touches an array — so without this the reordered row would keep its old
 * slot on screen until the next full load, and the drag would look like it did
 * nothing.
 *
 * `repositories/ordering.ts` does exactly this on the server, from the same
 * ranks. Two mirrors of one rule, which is the shape phase 4 dissolves: when
 * the client sends the array it already rendered, both sides delete their
 * `rank` half and neither has to derive anything.
 *
 * Deliberately a full recompute of every container the store holds, rather than
 * a splice at the moved row. The store has all of one author's posts, series and
 * projects in memory, so this is a couple of passes over a few hundred rows; and
 * a recompute is what makes the arrays self-heal instead of accumulating the
 * drift of every splice that got an edge case wrong.
 */

/** Just enough of the app state to order it. */
export interface OrderSyncState {
  user?: User;
  posts: EntityState<Post, string>;
  series: Series[];
  projects: Project[];
}

interface Ranked {
  id: string;
  rank?: string | null;
}

const rankedIds = (rows: Ranked[]): string[] =>
  [...rows]
    .sort((a, b) =>
      compareRankThenId(a.rank ?? null, a.id, b.rank ?? null, b.id)
    )
    .map((row) => row.id);

/** Recompute every order array in the store from the ranks in the store. */
export function syncOrderArrays(state: OrderSyncState): void {
  const posts = Object.values(state.posts.entities) as Post[];

  // Root: standalone posts, ungrouped series and projects in one space.
  if (state.user) {
    state.user.rootOrder = rankedIds([
      ...posts.filter((post) => !post.seriesId && !post.parentId),
      ...state.series.filter((series) => !series.projectId),
      ...state.projects,
    ]);
  }

  // A series' posts. `series.posts` is the authoritative membership list (the
  // grouping reads it, not the entity table), and the rank on each copy is kept
  // in step by the same reducer that set it on the entity.
  for (const series of state.series) {
    series.postOrder = rankedIds(series.posts ?? []);
  }

  // A project's member series.
  for (const project of state.projects) {
    project.seriesOrder = rankedIds(
      state.series.filter((series) => series.projectId === project.id),
    );
  }

  // A tabbed post's children, on the parent that owns them.
  const childrenOf = new Map<string, Post[]>();
  for (const post of posts) {
    if (!post.parentId) continue;
    const siblings = childrenOf.get(post.parentId);
    if (siblings) siblings.push(post);
    else childrenOf.set(post.parentId, [post]);
  }
  for (const post of posts) {
    const children = childrenOf.get(post.id);
    if (children) post.tabOrder = rankedIds(children);
  }
}
