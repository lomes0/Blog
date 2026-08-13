import { appSlice } from "@/store/app";
import type { AppState, Post, Series } from "@/types";

/**
 * `reconcilePosts` — docs/plans/archive/changes-detection.md §4, §8.
 *
 * The reducer, exercised directly: pure state in, pure state out, no store and
 * no React, like the workspace spec beside it. What is being defended here is
 * everything a naive `upsertMany` would get wrong —
 *
 * - it would append a new post to the *end* of the sidebar, because
 *   `postsAdapter` has no `sortComparer` and nothing else maintains `ids[]`;
 * - it would replace an open document's `data` with a list payload that has
 *   none, wiping content out of the store on a background refresh;
 * - it would leave `series[].posts` holding the pre-move copy of a row.
 *
 * §8 asks for order, not just membership, so the order assertions here are on
 * `ids[]` itself rather than on a set of keys.
 */

const { reducer, actions } = appSlice;

const initial = (): AppState => reducer(undefined, { type: "@@init" });

const T = (hour: number) =>
  new Date(Date.UTC(2026, 7, 8, hour, 0, 0)).toISOString();

const post = (id: string, updatedAt: string, extra: Partial<Post> = {}): Post =>
  ({
    id,
    name: id,
    head: `${id}-head`,
    type: "DOCUMENT",
    createdAt: T(0),
    updatedAt,
    ...extra,
  }) as Post;

/** A store holding `posts`, in the newest-first order `loadPosts` produces. */
const seeded = (posts: Post[], series: Series[] = []): AppState => {
  const base = initial();
  return {
    ...base,
    series,
    posts: {
      ids: posts.map((p) => p.id),
      entities: Object.fromEntries(posts.map((p) => [p.id, p])),
    },
  };
};

const idsOf = (state: AppState) => [...state.posts.ids];

describe("reconcilePosts", () => {
  it("upserts the named ids and leaves the rest byte-identical", () => {
    const before = seeded([
      post("a", T(12)),
      post("b", T(11)),
      post("c", T(10)),
    ]);

    const after = reducer(
      before,
      actions.reconcilePosts({
        changed: [post("b", T(11), { name: "renamed" })],
        deletedIds: [],
      }),
    );

    expect(after.posts.entities.b.name).toBe("renamed");
    // Identity, not equality: an untouched entity must come out of the reducer
    // as the very object that went in, or every row re-renders on every poll.
    expect(after.posts.entities.a).toBe(before.posts.entities.a);
    expect(after.posts.entities.c).toBe(before.posts.entities.c);
  });

  it("removes the ids the catch-up proves are gone", () => {
    const before = seeded([post("a", T(12)), post("gone", T(11))]);

    const after = reducer(
      before,
      actions.reconcilePosts({ changed: [], deletedIds: ["gone"] }),
    );

    expect(idsOf(after)).toEqual(["a"]);
    expect(after.posts.entities.gone).toBeUndefined();
    expect(after.posts.entities.a).toBe(before.posts.entities.a);
  });

  it("is a no-op on an empty result", () => {
    const before = seeded([post("a", T(12)), post("b", T(11))]);

    const after = reducer(
      before,
      actions.reconcilePosts({ changed: [], deletedIds: [] }),
    );

    expect(after).toBe(before);
  });

  it("lands ids[] in updatedAt order after an update reorders the list", () => {
    const before = seeded([
      post("a", T(12)),
      post("b", T(11)),
      post("c", T(10)),
    ]);

    // The agent edited the oldest post; it is now the newest.
    const after = reducer(
      before,
      actions.reconcilePosts({
        changed: [post("c", T(13))],
        deletedIds: [],
      }),
    );

    expect(idsOf(after)).toEqual(["c", "a", "b"]);
  });

  /**
   * The failure §4 calls out by name. `applyPost` prepends an unknown id, so
   * without the re-sort a post created a week ago (an agent working through a
   * backlog, an import) would sit at the top; with a plain `upsertMany` it
   * would instead land at the very bottom. Neither is where it belongs.
   */
  it("files a newly created post by date rather than at either end", () => {
    const before = seeded([
      post("a", T(12)),
      post("b", T(10)),
    ]);

    const after = reducer(
      before,
      actions.reconcilePosts({
        changed: [post("fresh", T(11))],
        deletedIds: [],
      }),
    );

    expect(idsOf(after)).toEqual(["a", "fresh", "b"]);
  });

  it("keeps content already loaded for the editor", () => {
    const data = { root: { children: [] } } as unknown as Post["data"];
    const before = seeded([post("open", T(12), { data })]);

    // A list-shaped payload carries no `data` — it must not read as "empty".
    const after = reducer(
      before,
      actions.reconcilePosts({
        changed: [post("open", T(13), { name: "renamed" })],
        deletedIds: [],
      }),
    );

    expect(after.posts.entities.open.name).toBe("renamed");
    expect(after.posts.entities.open.data).toBe(data);
  });

  it("keeps series[].posts in step with an upsert and a delete", () => {
    const inSeries = post("a", T(12), { seriesId: "s1" });
    const doomed = post("gone", T(11), { seriesId: "s1" });
    const series = [
      {
        id: "s1",
        name: "Series",
        posts: [inSeries, doomed],
      } as unknown as Series,
    ];
    const before = seeded([inSeries, doomed], series);

    const after = reducer(
      before,
      actions.reconcilePosts({
        changed: [post("a", T(13), { seriesId: "s1", name: "renamed" })],
        deletedIds: ["gone"],
      }),
    );

    expect(after.series[0].posts.map((p) => p.id)).toEqual(["a"]);
    expect(after.series[0].posts[0].name).toBe("renamed");
  });

  /**
   * The premise the workspace repair rests on, pinned so a later "helpful" edit
   * cannot quietly break the split.
   *
   * Removing a post that a pane is rooted at leaves `ui.workspace` exactly as
   * it was. That is deliberate and matches `removePost`: a reducer cannot
   * navigate, and closing the pane without also fixing the address bar would be
   * half a repair, which `useCloseDeletedDocument` argues is worse than none. So
   * the pane survives this reducer and `useBackgroundRefresh` closes it in an
   * effect, using the ids reported here.
   */
  it("leaves the workspace to the effect when a deleted post is open", () => {
    const before = reducer(
      seeded([post("open", T(12))]),
      actions.openPane({ paneId: "pane-1", rootId: "open" }),
    );
    expect(before.ui.workspace.panes).toHaveLength(1);

    const after = reducer(
      before,
      actions.reconcilePosts({ changed: [], deletedIds: ["open"] }),
    );

    expect(after.posts.entities.open).toBeUndefined();
    expect(after.ui.workspace).toBe(before.ui.workspace);
  });

  it("applies creates, updates and deletes from one payload", () => {
    const before = seeded([
      post("same", T(12)),
      post("edited", T(11)),
      post("gone", T(10)),
    ]);

    const after = reducer(
      before,
      actions.reconcilePosts({
        changed: [post("edited", T(14)), post("created", T(13))],
        deletedIds: ["gone"],
      }),
    );

    expect(idsOf(after)).toEqual(["edited", "created", "same"]);
    expect(after.posts.entities.same).toBe(before.posts.entities.same);
  });
});
