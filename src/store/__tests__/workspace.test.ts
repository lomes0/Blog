import { appSlice } from "@/store/app";
import { DEFAULT_PANE_RATIO, MAX_PANES } from "@/types";
import type { AppState, WorkspacePane } from "@/types";

/**
 * The `ui.workspace` reducers, exercised directly.
 *
 * Pure state in, pure state out — no store, no React, no DOM, so this runs in
 * the default `node` environment like the other three specs. Testing the
 * reducers rather than the components is deliberate: the invariants that matter
 * here (a pane always has a valid `activeTabId`, dirty is keyed by document and
 * not by viewport, one document is never open twice) are exactly the ones split
 * view rests on, and a component test would only observe them through one
 * pane's worth of UI.
 *
 * `openPane` is called with an explicit `paneId` in most of these. That is the
 * "put it in *this* viewport" form, which is what `pane.split` uses; omitting
 * it means "put it where I am looking" and retargets the focused pane, which is
 * what the sidebar, the palette and the deep-link seam mean. Both forms are
 * covered below.
 */

const { reducer, actions } = appSlice;

const initial = (): AppState => reducer(undefined, { type: "@@init" });

const workspaceOf = (state: AppState) => state.ui.workspace;

const paneOf = (state: AppState, paneId: string): WorkspacePane => {
  const pane = state.ui.workspace.panes.find((p) => p.id === paneId);
  if (!pane) throw new Error(`no pane ${paneId}`);
  return pane;
};

/** A pane rooted at `post`, with `post` plus `children` as its tab group. */
const openWithTabs = (
  state: AppState,
  paneId: string,
  rootId: string,
  children: string[] = [],
): AppState => {
  const opened = reducer(
    state,
    actions.openPane({ paneId, rootId, mode: "write" }),
  );
  return reducer(
    opened,
    actions.setPaneTabs({
      paneId,
      tabIds: [rootId, ...children],
      activeTabId: rootId,
    }),
  );
};

describe("ui.workspace — panes", () => {
  it("starts with no panes and nothing focused", () => {
    const { panes, focusedPaneId } = workspaceOf(initial());
    expect(panes).toEqual([]);
    expect(focusedPaneId).toBeNull();
  });

  it("opens a pane, focuses it, and leaves its tabs unknown", () => {
    const state = reducer(
      initial(),
      actions.openPane({ paneId: "p1", rootId: "doc-a", mode: "write" }),
    );

    expect(workspaceOf(state).panes).toHaveLength(1);
    expect(workspaceOf(state).focusedPaneId).toBe("p1");

    const pane = paneOf(state, "p1");
    expect(pane.rootId).toBe("doc-a");
    expect(pane.mode).toBe("write");
    expect(pane.diffOpen).toBe(false);
    // The children are a fetch away; consumers fall back to `rootId`.
    expect(pane.tabIds).toEqual([]);
    expect(pane.activeTabId).toBeNull();
  });

  it("seeds the active tab when the caller already knows it", () => {
    // `/view/<childId>` opens the child, not the post it belongs to.
    const state = reducer(
      initial(),
      actions.openPane({
        paneId: "p1",
        rootId: "doc-a",
        mode: "read",
        activeTabId: "child-1",
      }),
    );

    expect(paneOf(state, "p1").activeTabId).toBe("child-1");
    expect(paneOf(state, "p1").mode).toBe("read");
  });

  it("mints a pane id when none is supplied", () => {
    const state = reducer(
      initial(),
      actions.openPane({ rootId: "doc-a", mode: "write" }),
    );

    const [pane] = workspaceOf(state).panes;
    expect(pane.id).toBeTruthy();
    expect(workspaceOf(state).focusedPaneId).toBe(pane.id);
  });

  it("re-opening the same pane id retargets it instead of adding one", () => {
    let state = openWithTabs(initial(), "p1", "doc-a", ["child-1"]);
    state = reducer(
      state,
      actions.openPane({ paneId: "p1", rootId: "doc-b", mode: "write" }),
    );

    expect(workspaceOf(state).panes).toHaveLength(1);
    expect(paneOf(state, "p1").rootId).toBe("doc-b");
    // The old post's tabs must not survive into the new one.
    expect(paneOf(state, "p1").tabIds).toEqual([]);
  });

  it("holds more than one pane and moves focus between them", () => {
    let state = reducer(
      initial(),
      actions.openPane({ paneId: "p1", rootId: "doc-a", mode: "write" }),
    );
    state = reducer(
      state,
      actions.openPane({ paneId: "p2", rootId: "doc-b", mode: "read" }),
    );

    expect(workspaceOf(state).panes.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(workspaceOf(state).focusedPaneId).toBe("p2");

    state = reducer(state, actions.focusPane("p1"));
    expect(workspaceOf(state).focusedPaneId).toBe("p1");
  });

  it("ignores focus on a pane that does not exist", () => {
    const state = reducer(
      reducer(
        initial(),
        actions.openPane({ paneId: "p1", rootId: "doc-a", mode: "write" }),
      ),
      actions.focusPane("nope"),
    );

    expect(workspaceOf(state).focusedPaneId).toBe("p1");
  });

  it("hands focus to a surviving pane when the focused one closes", () => {
    let state = reducer(
      initial(),
      actions.openPane({ paneId: "p1", rootId: "doc-a", mode: "write" }),
    );
    state = reducer(
      state,
      actions.openPane({ paneId: "p2", rootId: "doc-b", mode: "write" }),
    );
    state = reducer(state, actions.closePane("p2"));

    expect(workspaceOf(state).panes.map((p) => p.id)).toEqual(["p1"]);
    expect(workspaceOf(state).focusedPaneId).toBe("p1");
  });

  it("closes the last pane back to nothing focused", () => {
    const state = reducer(
      reducer(
        initial(),
        actions.openPane({ paneId: "p1", rootId: "doc-a", mode: "write" }),
      ),
      actions.closePane("p1"),
    );

    expect(workspaceOf(state).panes).toEqual([]);
    expect(workspaceOf(state).focusedPaneId).toBeNull();
  });

  it("leaves the survivor's active tab as the focused document on close", () => {
    // What `useCloseDeletedDocument` reads back to decide whether anything is
    // left to show. It reads rather than predicts, so this pins the property
    // that read depends on: after closing the focused pane, the focused
    // *document* is the survivor's active tab — its child, not its root, when a
    // child was open. (`pane.close` used to read the same value to rewrite the
    // URL to it; docs/plans/workspace-url.md §3 retired that, not this.)
    let state = openWithTabs(initial(), "p1", "doc-a", ["c1"]);
    state = reducer(state, actions.setActiveTab({ paneId: "p1", tabId: "c1" }));
    state = openWithTabs(state, "p2", "doc-b");
    expect(workspaceOf(state).focusedPaneId).toBe("p2");

    state = reducer(state, actions.closePane("p2"));

    const focused = paneOf(state, workspaceOf(state).focusedPaneId!);
    expect(focused.id).toBe("p1");
    expect(focused.activeTabId ?? focused.rootId).toBe("c1");
  });

  it("keeps focus when an unfocused pane closes", () => {
    let state = reducer(
      initial(),
      actions.openPane({ paneId: "p1", rootId: "doc-a", mode: "write" }),
    );
    state = reducer(
      state,
      actions.openPane({ paneId: "p2", rootId: "doc-b", mode: "write" }),
    );
    state = reducer(state, actions.closePane("p1"));

    expect(workspaceOf(state).focusedPaneId).toBe("p2");
  });

  it("sets mode per pane, leaving the other alone", () => {
    let state = reducer(
      initial(),
      actions.openPane({ paneId: "p1", rootId: "doc-a", mode: "write" }),
    );
    state = reducer(
      state,
      actions.openPane({ paneId: "p2", rootId: "doc-b", mode: "write" }),
    );
    state = reducer(state, actions.setPaneMode({ paneId: "p1", mode: "read" }));

    expect(paneOf(state, "p1").mode).toBe("read");
    expect(paneOf(state, "p2").mode).toBe("write");
  });

  it("opens the diff in the pane holding that document only", () => {
    let state = reducer(
      initial(),
      actions.openPane({ paneId: "p1", rootId: "doc-a", mode: "write" }),
    );
    state = reducer(
      state,
      actions.openPane({ paneId: "p2", rootId: "doc-b", mode: "write" }),
    );
    state = reducer(
      state,
      actions.setDiffOpen({ docId: "doc-b", open: true }),
    );

    expect(paneOf(state, "p1").diffOpen).toBe(false);
    expect(paneOf(state, "p2").diffOpen).toBe(true);
  });

  /**
   * The rail's "Review" on a document nothing is showing yet: the diff is asked
   * for against a *document*, and the pane that will hold it may not exist —
   * or, having been created by the open, may be torn down and rebuilt before
   * the user sees anything. The workspace restore, the deep-link replay and
   * `WorkspacePanes`' unmount (`closeAllPanes`, which React's development
   * double-mount fires on entry) all rewrite panes after the click.
   */
  it("gives a pane the diff its document was already asked to show", () => {
    let state = reducer(
      initial(),
      actions.setDiffOpen({ docId: "doc-b", open: true }),
    );
    // No pane held it, so nothing to project onto — but the request stands.
    expect(workspaceOf(state).panes).toEqual([]);

    // Whatever the workspace does next, the pane that ends up showing doc-b
    // shows the review with it: minted from nothing…
    state = reducer(
      state,
      actions.openPane({ paneId: "p1", rootId: "doc-b", mode: "write" }),
    );
    expect(paneOf(state, "p1").diffOpen).toBe(true);

    // …retargeted away, which is a different review and so no review…
    state = reducer(
      state,
      actions.openPane({ paneId: "p1", rootId: "doc-c", mode: "write" }),
    );
    expect(paneOf(state, "p1").diffOpen).toBe(false);

    // …and retargeted back.
    state = reducer(
      state,
      actions.openPane({ paneId: "p1", rootId: "doc-b", mode: "write" }),
    );
    expect(paneOf(state, "p1").diffOpen).toBe(true);
  });

  it("closes a diff by document, so leaving one pane cannot close another's", () => {
    let state = reducer(
      initial(),
      actions.openPane({ paneId: "p1", rootId: "doc-a", mode: "write" }),
    );
    state = reducer(
      state,
      actions.openPane({ paneId: "p2", rootId: "doc-b", mode: "write" }),
    );
    state = reducer(
      state,
      actions.setDiffOpen({ docId: "doc-b", open: true }),
    );

    // What `usePostLoader` dispatches when doc-a's panel unmounts, after focus
    // has already moved to doc-b.
    state = reducer(
      state,
      actions.setDiffOpen({ docId: "doc-a", open: false }),
    );
    expect(paneOf(state, "p2").diffOpen).toBe(true);

    // And closing doc-b's own diff both hides it and retires the request, so
    // reopening the document does not bring it back.
    state = reducer(
      state,
      actions.setDiffOpen({ docId: "doc-b", open: false }),
    );
    expect(paneOf(state, "p2").diffOpen).toBe(false);
    state = reducer(
      state,
      actions.openPane({ paneId: "p2", rootId: "doc-b", mode: "write" }),
    );
    expect(paneOf(state, "p2").diffOpen).toBe(false);
  });
});

describe("ui.workspace — one document, one pane, as tabs arrive", () => {
  /**
   * The other half of §5.2. `openPane` stops a pane being *rooted* at a
   * document another pane holds, but tab lists arrive from a fetch afterwards:
   * open a child in one pane, then its parent post in the other, and the
   * parent's children come back naming a document the first pane is showing.
   *
   * `TabbedDocumentEditor` renders a panel per `tabIds` entry and each
   * registers a save callback keyed by document id, so admitting the duplicate
   * makes the second panel replace the first's callback and one pane stops
   * saving, silently.
   */
  const childOpenBeside = (): AppState => {
    // p1 is showing `c1` directly; p2 is rooted at `doc-a`, whose children
    // (fetched a moment later) include `c1`.
    const state = reducer(
      initial(),
      actions.openPane({ paneId: "p1", rootId: "c1", mode: "write" }),
    );
    return reducer(
      state,
      actions.openPane({ paneId: "p2", rootId: "doc-a", mode: "write" }),
    );
  };

  it("drops an arriving tab that another pane already shows", () => {
    const state = reducer(
      childOpenBeside(),
      actions.setPaneTabs({
        paneId: "p2",
        tabIds: ["doc-a", "c1", "c2"],
        activeTabId: "doc-a",
      }),
    );

    expect(paneOf(state, "p2").tabIds).toEqual(["doc-a", "c2"]);
    // p1 keeps it, and keeps it as its root.
    expect(paneOf(state, "p1").rootId).toBe("c1");
  });

  it("falls back when the arriving active tab is the one dropped", () => {
    const state = reducer(
      childOpenBeside(),
      actions.setPaneTabs({
        paneId: "p2",
        tabIds: ["doc-a", "c1"],
        activeTabId: "c1",
      }),
    );

    expect(paneOf(state, "p2").tabIds).toEqual(["doc-a"]);
    expect(paneOf(state, "p2").activeTabId).toBe("doc-a");
  });

  it("keeps a pane's own root even against a stale claim elsewhere", () => {
    // A pane must render what it is rooted at, whatever else believes it holds
    // it — otherwise the pane would have nothing to show at all.
    const state = reducer(
      childOpenBeside(),
      actions.setPaneTabs({
        paneId: "p1",
        tabIds: ["c1"],
        activeTabId: "c1",
      }),
    );

    expect(paneOf(state, "p1").tabIds).toEqual(["c1"]);
    expect(paneOf(state, "p1").activeTabId).toBe("c1");
  });

  it("refuses addTab for a document another pane shows", () => {
    const state = reducer(
      childOpenBeside(),
      actions.addTab({ paneId: "p2", tabId: "c1" }),
    );

    expect(paneOf(state, "p2").tabIds).not.toContain("c1");
    expect(paneOf(state, "p2").activeTabId).not.toBe("c1");
  });

  it("still admits a tab no other pane holds", () => {
    const state = reducer(
      childOpenBeside(),
      actions.addTab({ paneId: "p2", tabId: "c2" }),
    );

    expect(paneOf(state, "p2").tabIds).toContain("c2");
    expect(paneOf(state, "p2").activeTabId).toBe("c2");
  });
});

describe("ui.workspace — the tab group inside a pane", () => {
  it("publishes the fetched tab list and activates the root", () => {
    const state = openWithTabs(initial(), "p1", "doc-a", ["c1", "c2"]);

    expect(paneOf(state, "p1").tabIds).toEqual(["doc-a", "c1", "c2"]);
    expect(paneOf(state, "p1").activeTabId).toBe("doc-a");
  });

  it("adds a tab and switches to it", () => {
    let state = openWithTabs(initial(), "p1", "doc-a", ["c1"]);
    state = reducer(state, actions.addTab({ paneId: "p1", tabId: "c2" }));

    expect(paneOf(state, "p1").tabIds).toEqual(["doc-a", "c1", "c2"]);
    expect(paneOf(state, "p1").activeTabId).toBe("c2");
  });

  it("does not duplicate a tab it already holds, but still activates it", () => {
    let state = openWithTabs(initial(), "p1", "doc-a", ["c1"]);
    state = reducer(state, actions.addTab({ paneId: "p1", tabId: "c1" }));

    expect(paneOf(state, "p1").tabIds).toEqual(["doc-a", "c1"]);
    expect(paneOf(state, "p1").activeTabId).toBe("c1");
  });

  it("reorders tabs without touching the active one", () => {
    let state = openWithTabs(initial(), "p1", "doc-a", ["c1", "c2"]);
    state = reducer(
      state,
      actions.setActiveTab({ paneId: "p1", tabId: "c1" }),
    );
    state = reducer(
      state,
      actions.reorderTabs({ paneId: "p1", tabIds: ["doc-a", "c2", "c1"] }),
    );

    expect(paneOf(state, "p1").tabIds).toEqual(["doc-a", "c2", "c1"]);
    expect(paneOf(state, "p1").activeTabId).toBe("c1");
  });

  it("removing an inactive tab leaves the active one alone", () => {
    let state = openWithTabs(initial(), "p1", "doc-a", ["c1", "c2"]);
    state = reducer(state, actions.removeTab({ paneId: "p1", tabId: "c2" }));

    expect(paneOf(state, "p1").tabIds).toEqual(["doc-a", "c1"]);
    expect(paneOf(state, "p1").activeTabId).toBe("doc-a");
  });

  it("removing the active tab falls back to the one that took its slot", () => {
    let state = openWithTabs(initial(), "p1", "doc-a", ["c1", "c2"]);
    state = reducer(
      state,
      actions.setActiveTab({ paneId: "p1", tabId: "c1" }),
    );
    state = reducer(state, actions.removeTab({ paneId: "p1", tabId: "c1" }));

    // Index 1 is now `c2` — the neighbour to the right slides into the gap.
    expect(paneOf(state, "p1").tabIds).toEqual(["doc-a", "c2"]);
    expect(paneOf(state, "p1").activeTabId).toBe("c2");
  });

  it("removing the last tab falls back to the new end of the list", () => {
    let state = openWithTabs(initial(), "p1", "doc-a", ["c1"]);
    state = reducer(
      state,
      actions.setActiveTab({ paneId: "p1", tabId: "c1" }),
    );
    state = reducer(state, actions.removeTab({ paneId: "p1", tabId: "c1" }));

    expect(paneOf(state, "p1").activeTabId).toBe("doc-a");
  });

  it("removing the only tab leaves no active tab", () => {
    let state = openWithTabs(initial(), "p1", "doc-a");
    state = reducer(state, actions.removeTab({ paneId: "p1", tabId: "doc-a" }));

    expect(paneOf(state, "p1").tabIds).toEqual([]);
    expect(paneOf(state, "p1").activeTabId).toBeNull();
  });

  it("scopes tab edits to the pane they name", () => {
    let state = openWithTabs(initial(), "p1", "doc-a", ["c1"]);
    state = openWithTabs(state, "p2", "doc-b", ["c9"]);
    state = reducer(state, actions.addTab({ paneId: "p1", tabId: "c2" }));

    expect(paneOf(state, "p1").tabIds).toEqual(["doc-a", "c1", "c2"]);
    expect(paneOf(state, "p2").tabIds).toEqual(["doc-b", "c9"]);
    expect(paneOf(state, "p2").activeTabId).toBe("doc-b");
  });

  it("is a no-op for a pane that has already closed", () => {
    // Ordinary rather than exceptional: panes are closed by effect cleanups, so
    // a debounced handler can land after its pane is gone.
    const state = reducer(
      initial(),
      actions.setActiveTab({ paneId: "ghost", tabId: "c1" }),
    );

    expect(workspaceOf(state).panes).toEqual([]);
  });
});

/**
 * The invariant Phase 5 rests on (plan §5.2).
 *
 * `saveRegistry` is a `Map` keyed by document id, and every mounted
 * `EditorTabPanel` registers into it. Two panes showing one document therefore
 * produce two Lexical instances with independent undo stacks, the second of
 * which overwrites the first's save callback — one pane stops persisting, with
 * no error anywhere. The rule is enforced here, in the reducer, and not only in
 * `commands/pane.ts`, because a reducer invariant is the only version of it an
 * AI-issued command cannot route around.
 */
describe("ui.workspace — duplicate open is impossible", () => {
  it("focuses the pane already showing the document instead of opening it twice", () => {
    let state = openWithTabs(initial(), "p1", "doc-a");
    state = openWithTabs(state, "p2", "doc-b");
    expect(workspaceOf(state).focusedPaneId).toBe("p2");

    state = reducer(state, actions.openPane({ paneId: "p3", rootId: "doc-a" }));

    expect(workspaceOf(state).panes.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(workspaceOf(state).focusedPaneId).toBe("p1");
    // The pane that already had it is untouched apart from focus.
    expect(paneOf(state, "p1").tabIds).toEqual(["doc-a"]);
    expect(paneOf(state, "p2").rootId).toBe("doc-b");
  });

  it("guards a document open as another pane's *tab*, and activates it", () => {
    // The collision is per `EditorTabPanel`, and a pane mounts one per tab — so
    // opening a child tab as a root is the same duplicate as opening the root.
    let state = openWithTabs(initial(), "p1", "doc-a", ["c1", "c2"]);
    state = openWithTabs(state, "p2", "doc-b");

    state = reducer(state, actions.openPane({ paneId: "p3", rootId: "c2" }));

    expect(workspaceOf(state).panes.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(workspaceOf(state).focusedPaneId).toBe("p1");
    expect(paneOf(state, "p1").activeTabId).toBe("c2");
    expect(paneOf(state, "p1").rootId).toBe("doc-a");
  });

  it("applies a requested mode to the pane it focuses", () => {
    let state = openWithTabs(initial(), "p1", "doc-a");
    state = openWithTabs(state, "p2", "doc-b");

    state = reducer(
      state,
      actions.openPane({ paneId: "p3", rootId: "doc-a", mode: "read" }),
    );

    expect(paneOf(state, "p1").mode).toBe("read");
    expect(paneOf(state, "p2").mode).toBe("write");
  });

  it("still lets the pane that holds it be retargeted onto it", () => {
    // Naming the same pane is not a duplicate — it is a reset, and the routing
    // seam does exactly this on a re-entered deep link.
    let state = openWithTabs(initial(), "p1", "doc-a", ["c1"]);
    state = reducer(state, actions.openPane({ paneId: "p1", rootId: "doc-a" }));

    expect(workspaceOf(state).panes).toHaveLength(1);
    expect(paneOf(state, "p1").tabIds).toEqual([]);
  });
});

describe("ui.workspace — where an unnamed open lands", () => {
  it("mints the first pane when the workspace is empty", () => {
    const state = reducer(initial(), actions.openPane({ rootId: "doc-a" }));

    expect(workspaceOf(state).panes).toHaveLength(1);
    expect(workspaceOf(state).panes[0].rootId).toBe("doc-a");
    expect(workspaceOf(state).panes[0].mode).toBe("write");
  });

  it("retargets the focused pane rather than adding one", () => {
    // "Show it where I am looking" — a sidebar click, the palette, a deep link.
    let state = openWithTabs(initial(), "p1", "doc-a");
    state = openWithTabs(state, "p2", "doc-b");
    state = reducer(state, actions.focusPane("p1"));

    state = reducer(state, actions.openPane({ rootId: "doc-c" }));

    expect(workspaceOf(state).panes.map((p) => p.rootId))
      .toEqual(["doc-c", "doc-b"]);
    expect(workspaceOf(state).focusedPaneId).toBe("p1");
  });

  it("keeps the pane's mode when the caller does not state one", () => {
    let state = reducer(
      initial(),
      actions.openPane({ paneId: "p1", rootId: "doc-a", mode: "read" }),
    );
    state = reducer(state, actions.openPane({ rootId: "doc-b" }));

    expect(paneOf(state, "p1").mode).toBe("read");
  });

  it("refuses a third pane (plan §5.3 — two, not a grid)", () => {
    let state = openWithTabs(initial(), "p1", "doc-a");
    state = openWithTabs(state, "p2", "doc-b");

    state = reducer(state, actions.openPane({ paneId: "p3", rootId: "doc-c" }));

    expect(workspaceOf(state).panes.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(workspaceOf(state).focusedPaneId).toBe("p2");
  });

  it("closes every pane at once when the editor is left", () => {
    let state = openWithTabs(initial(), "p1", "doc-a");
    state = openWithTabs(state, "p2", "doc-b");

    state = reducer(state, actions.closeAllPanes());

    expect(workspaceOf(state).panes).toEqual([]);
    expect(workspaceOf(state).focusedPaneId).toBeNull();
  });
});

/**
 * Reading a layout back from storage (plan §8.2).
 *
 * The payload is whatever was in IndexedDB, which is to say: whatever an older
 * build of this app wrote, or a tab that died mid-write left behind, or a user
 * with dev tools open decided to put there. It is not a request body, but the
 * difference is one of likelihood and not of kind — and the failure modes are
 * quiet ones. A record naming one document in two panes reproduces exactly the
 * `saveRegistry` collision the duplicate-open guard above exists to make
 * unreachable, and it would do it *behind* that guard, since nothing about a
 * restore goes through `openPane`.
 *
 * So the rules are asserted here, at the reducer, rather than at the function
 * that reads the record: the reducer is the only version of them a caller
 * cannot route around.
 */
describe("ui.workspace — restoring a stored layout", () => {
  /** A stored pane, in the shape the record actually holds. */
  const storedPane = (
    id: string,
    rootId: string,
    tabIds: string[] = [rootId],
  ) => ({
    id,
    rootId,
    tabIds,
    activeTabId: rootId,
    mode: "write",
    diffOpen: false,
  });

  const restore = (stored: unknown, key = "user-1"): AppState =>
    reducer(initial(), actions.restoreWorkspace({ key, stored }));

  it("installs the stored panes, focus and split", () => {
    const state = restore({
      panes: [storedPane("p1", "doc-a"), storedPane("p2", "doc-b")],
      focusedPaneId: "p2",
      splitRatio: 0.7,
    });

    expect(workspaceOf(state).panes.map((p) => p.rootId))
      .toEqual(["doc-a", "doc-b"]);
    expect(workspaceOf(state).focusedPaneId).toBe("p2");
    expect(workspaceOf(state).splitRatio).toBe(0.7);
    expect(state.ui.workspaceHydrated).toBe(true);
    expect(state.ui.workspaceKey).toBe("user-1");
  });

  it("hydrates to nothing when the user has no stored layout", () => {
    const state = restore(undefined);

    expect(workspaceOf(state).panes).toEqual([]);
    expect(workspaceOf(state).focusedPaneId).toBeNull();
    expect(workspaceOf(state).splitRatio).toBe(DEFAULT_PANE_RATIO);
    // Still hydrated: "nothing stored" is an answer, and the deep-link seam is
    // waiting on the question having been asked, not on it having a layout.
    expect(state.ui.workspaceHydrated).toBe(true);
  });

  it("never comes back with a pane maximized", () => {
    // A maximize is a way of looking at a layout, not part of one — so it is
    // left out of the record, and a record that has one anyway (an older build,
    // a hand-edited store) does not get to open the editor with a pane hidden.
    const state = restore({
      panes: [storedPane("p1", "doc-a"), storedPane("p2", "doc-b")],
      focusedPaneId: "p1",
      maximizedPaneId: "p1",
    });

    expect(workspaceOf(state).maximizedPaneId).toBeNull();
    expect(workspaceOf(state).panes).toHaveLength(2);
  });

  it("clamps to MAX_PANES (plan §5.3 — two, not a grid)", () => {
    const state = restore({
      panes: [
        storedPane("p1", "doc-a"),
        storedPane("p2", "doc-b"),
        storedPane("p3", "doc-c"),
      ],
      focusedPaneId: "p1",
    });

    expect(workspaceOf(state).panes).toHaveLength(MAX_PANES);
    expect(workspaceOf(state).panes.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("refuses to restore one document into two panes (plan §5.2)", () => {
    // `saveRegistry` is keyed by document id, so the second pane's editor would
    // overwrite the first one's save callback and that pane would silently stop
    // persisting. The guard in `openPane` cannot see a restore.
    const state = restore({
      panes: [storedPane("p1", "doc-a"), storedPane("p2", "doc-a")],
      focusedPaneId: "p2",
    });

    expect(workspaceOf(state).panes.map((p) => p.id)).toEqual(["p1"]);
    // The dropped pane took the focus with it, so focus lands on a survivor.
    expect(workspaceOf(state).focusedPaneId).toBe("p1");
  });

  it("counts a document held as another pane's tab as the same duplicate", () => {
    // The collision is per mounted `EditorTabPanel`, and a pane mounts one per
    // tab — so a child of the left pane opened as the right pane's root is the
    // same overwrite.
    const state = restore({
      panes: [
        storedPane("p1", "doc-a", ["doc-a", "c1"]),
        storedPane("p2", "c1", ["c1"]),
      ],
      focusedPaneId: "p1",
    });

    expect(workspaceOf(state).panes.map((p) => p.id)).toEqual(["p1"]);
  });

  it("drops a pane whose id repeats", () => {
    const state = restore({
      panes: [storedPane("p1", "doc-a"), storedPane("p1", "doc-b")],
      focusedPaneId: "p1",
    });

    expect(workspaceOf(state).panes).toHaveLength(1);
    expect(paneOf(state, "p1").rootId).toBe("doc-a");
  });

  it("re-points a focus that names a pane which did not survive", () => {
    const state = restore({
      panes: [storedPane("p1", "doc-a"), storedPane("p2", "doc-b")],
      focusedPaneId: "p9",
    });

    // The last pane, which is what `closePane` falls back to as well.
    expect(workspaceOf(state).focusedPaneId).toBe("p2");
  });

  it("focuses nothing when nothing survived", () => {
    const state = restore({ panes: [{ id: "p1" }], focusedPaneId: "p1" });

    expect(workspaceOf(state).panes).toEqual([]);
    expect(workspaceOf(state).focusedPaneId).toBeNull();
  });

  it("drops a pane with no document to root it at", () => {
    // `TabbedDocumentEditor` is handed `rootId` directly; a pane without one
    // sends `usePostLoader` looking for the document `undefined`.
    const state = restore({
      panes: [{ id: "p1", tabIds: [] }, storedPane("p2", "doc-b")],
      focusedPaneId: "p2",
    });

    expect(workspaceOf(state).panes.map((p) => p.id)).toEqual(["p2"]);
  });

  it("survives a record that is not a workspace at all", () => {
    for (const junk of [null, 42, "panes", { panes: "two" }, []]) {
      const state = restore(junk);
      expect(workspaceOf(state).panes).toEqual([]);
      expect(state.ui.workspaceHydrated).toBe(true);
    }
  });

  it("normalises a pane's mode and never restores a diff open", () => {
    // `ui.diff` — which revisions to compare — is not persisted, so a pane that
    // came back with `diffOpen` would render a diff of nothing.
    const state = restore({
      panes: [{
        id: "p1",
        rootId: "doc-a",
        tabIds: ["doc-a"],
        activeTabId: "doc-a",
        mode: "sideways",
        diffOpen: true,
      }],
      focusedPaneId: "p1",
    });

    expect(paneOf(state, "p1").mode).toBe("write");
    expect(paneOf(state, "p1").diffOpen).toBe(false);
  });

  it("re-points an active tab the stored tab list does not contain", () => {
    const state = restore({
      panes: [{
        id: "p1",
        rootId: "doc-a",
        tabIds: ["doc-a", "c1"],
        activeTabId: "gone",
        mode: "write",
      }],
      focusedPaneId: "p1",
    });

    expect(paneOf(state, "p1").activeTabId).toBe("doc-a");
  });

  it("clamps the split ratio and falls back on a nonsense one", () => {
    expect(
      workspaceOf(restore({ panes: [], splitRatio: 4 })).splitRatio,
    ).toBe(0.8);
    expect(
      workspaceOf(restore({ panes: [], splitRatio: -1 })).splitRatio,
    ).toBe(0.2);
    expect(
      workspaceOf(restore({ panes: [], splitRatio: Number.NaN })).splitRatio,
    ).toBe(DEFAULT_PANE_RATIO);
    expect(
      workspaceOf(restore({ panes: [], splitRatio: "wide" })).splitRatio,
    ).toBe(DEFAULT_PANE_RATIO);
  });

  it("restores once — a second read landing late changes nothing", () => {
    let state = restore({ panes: [storedPane("p1", "doc-a")] });
    state = reducer(
      state,
      actions.restoreWorkspace({
        key: "user-1",
        stored: { panes: [storedPane("p9", "doc-z")] },
      }),
    );

    expect(workspaceOf(state).panes.map((p) => p.rootId)).toEqual(["doc-a"]);
  });

  it("yields to anything the user opened while the read was in flight", () => {
    // The IndexedDB read is asynchronous. A sidebar click in that window is a
    // deliberate act; a record from last Tuesday is not.
    let state = reducer(initial(), actions.openPane({ rootId: "doc-live" }));
    state = reducer(
      state,
      actions.restoreWorkspace({
        key: "user-1",
        stored: { panes: [storedPane("p1", "doc-a")] },
      }),
    );

    expect(workspaceOf(state).panes.map((p) => p.rootId)).toEqual(["doc-live"]);
    // The question was still answered, so the deep-link seam stops waiting.
    expect(state.ui.workspaceHydrated).toBe(true);
    expect(state.ui.workspaceKey).toBe("user-1");
  });

  it("clears and re-opens the restore when the session names another user", () => {
    // The read has to guess a key before the session resolves; a stale guess is
    // corrected rather than lived with, or a shared browser hands one account
    // the other's panes.
    let state = restore({ panes: [storedPane("p1", "doc-a")] }, "user-1");
    state = reducer(state, actions.workspaceKeyChanged("user-2"));

    expect(state.ui.workspaceKey).toBe("user-2");
    expect(state.ui.workspaceHydrated).toBe(false);
    expect(workspaceOf(state).panes).toEqual([]);
  });

  it("is a no-op when the session names the user it already restored", () => {
    let state = restore({ panes: [storedPane("p1", "doc-a")] }, "user-1");
    state = reducer(state, actions.workspaceKeyChanged("user-1"));

    expect(state.ui.workspaceHydrated).toBe(true);
    expect(workspaceOf(state).panes).toHaveLength(1);
  });

  it("leaving the workspace re-arms the restore", () => {
    let state = restore({
      panes: [storedPane("p1", "doc-a")],
      splitRatio: 0.7,
    });
    state = reducer(state, actions.closeAllPanes());

    expect(state.ui.workspaceHydrated).toBe(false);
    expect(workspaceOf(state).splitRatio).toBe(DEFAULT_PANE_RATIO);
  });
});

/**
 * What an entry URL means once there is a layout underneath it.
 *
 * `WorkspacePanes` replays `/edit/<id>` as `openPane({ rootId })` — the same
 * door a sidebar click and the Copilot use — and waits for the restore before
 * doing it, then consumes the URL (docs/plans/workspace-url.md §3). So this is
 * what a *deep link* does to a stored layout, and it is the only thing the URL
 * still decides. Every outcome below is the Phase 5 reducer's, unchanged: that
 * is the point of not giving the restore its own path into the workspace.
 */
describe("ui.workspace — an entry URL, replayed over a restored layout", () => {
  const restoredPair = (): AppState =>
    reducer(
      initial(),
      actions.restoreWorkspace({
        key: "user-1",
        stored: {
          panes: [
            {
              id: "p1",
              rootId: "doc-a",
              tabIds: ["doc-a", "c1"],
              activeTabId: "doc-a",
              mode: "write",
            },
            {
              id: "p2",
              rootId: "doc-b",
              tabIds: ["doc-b"],
              activeTabId: "doc-b",
              mode: "write",
            },
          ],
          focusedPaneId: "p2",
          splitRatio: 0.65,
        },
      }),
    );

  it("an entry naming a restored pane keeps both and focuses that one", () => {
    const state = reducer(
      restoredPair(),
      actions.openPane({ rootId: "doc-a" }),
    );

    expect(workspaceOf(state).panes.map((p) => p.rootId))
      .toEqual(["doc-a", "doc-b"]);
    expect(workspaceOf(state).focusedPaneId).toBe("p1");
    expect(workspaceOf(state).splitRatio).toBe(0.65);
    // Untouched apart from focus — in particular the tab list survives, which
    // is what lets the guard work before the children have been re-fetched.
    expect(paneOf(state, "p1").tabIds).toEqual(["doc-a", "c1"]);
  });

  it("a reload with no entry restores the stored focus, split included", () => {
    // The property that let `pane.split`'s `router.push` be deleted
    // (docs/plans/workspace-url.md §5). That push existed because the URL was
    // what decided focus on a cold load, so without it a reload restored both
    // panes and then focused the wrong one — the left one, which the address
    // bar was still naming. `focusedPaneId` is in the stored record and always
    // was: with the URL consumed there is nothing to replay, and the restore
    // alone is the whole answer.
    const state = restoredPair();

    expect(workspaceOf(state).panes.map((p) => p.rootId))
      .toEqual(["doc-a", "doc-b"]);
    expect(workspaceOf(state).focusedPaneId).toBe("p2");
    expect(paneOf(state, "p2").activeTabId).toBe("doc-b");
    expect(workspaceOf(state).splitRatio).toBe(0.65);
  });

  it("an entry naming a restored pane's *tab* focuses it and activates that tab", () => {
    const state = reducer(restoredPair(), actions.openPane({ rootId: "c1" }));

    expect(workspaceOf(state).panes).toHaveLength(2);
    expect(workspaceOf(state).focusedPaneId).toBe("p1");
    expect(paneOf(state, "p1").activeTabId).toBe("c1");
    expect(paneOf(state, "p1").rootId).toBe("doc-a");
  });

  it("a deep link to something else retargets the focused pane only", () => {
    const state = reducer(
      restoredPair(),
      actions.openPane({ rootId: "doc-c" }),
    );

    expect(workspaceOf(state).panes.map((p) => p.rootId))
      .toEqual(["doc-a", "doc-c"]);
    expect(workspaceOf(state).focusedPaneId).toBe("p2");
    // The neighbour is the whole point: a deep link must not close the split.
    expect(paneOf(state, "p1").tabIds).toEqual(["doc-a", "c1"]);
  });
});

describe("ui.workspace — the split ratio", () => {
  it("starts at the default and clamps what it is given", () => {
    expect(workspaceOf(initial()).splitRatio).toBe(DEFAULT_PANE_RATIO);
    expect(
      workspaceOf(reducer(initial(), actions.setSplitRatio(0.35))).splitRatio,
    ).toBe(0.35);
    expect(
      workspaceOf(reducer(initial(), actions.setSplitRatio(0.95))).splitRatio,
    ).toBe(0.8);
    expect(
      workspaceOf(reducer(initial(), actions.setSplitRatio(0.05))).splitRatio,
    ).toBe(0.2);
  });

  it("ignores a ratio a zero-width row would produce", () => {
    const state = reducer(initial(), actions.setSplitRatio(Number.NaN));
    expect(workspaceOf(state).splitRatio).toBe(DEFAULT_PANE_RATIO);
  });
});

/**
 * Maximize — one pane filling the row, the other hidden rather than closed.
 *
 * The reducer carries two rules the UI cannot be trusted with, because the pane
 * a maximize hides is `display: none` and therefore unclickable: a maximized
 * pane is always the focused one, and there is always a second pane behind it.
 * Every way of reaching either state — focusing the hidden pane by command,
 * splitting off the maximized one, closing either — is asserted here rather than
 * left to the component that happens not to do it today.
 */
describe("ui.workspace — maximizing a pane", () => {
  const split = () =>
    openWithTabs(openWithTabs(initial(), "p1", "doc-a"), "p2", "doc-b");

  it("starts with nothing maximized", () => {
    expect(workspaceOf(initial()).maximizedPaneId).toBeNull();
  });

  it("gives the row to one pane, and focuses it", () => {
    let state = split();
    state = reducer(state, actions.focusPane("p2"));

    state = reducer(state, actions.toggleMaximizePane("p1"));

    expect(workspaceOf(state).maximizedPaneId).toBe("p1");
    expect(workspaceOf(state).focusedPaneId).toBe("p1");
    // Hidden, not closed: both panes are still open, with their tabs intact.
    expect(workspaceOf(state).panes.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(paneOf(state, "p2").rootId).toBe("doc-b");
  });

  it("is a toggle — the same pane again gives the row back", () => {
    let state = reducer(split(), actions.toggleMaximizePane("p1"));
    state = reducer(state, actions.toggleMaximizePane("p1"));
    expect(workspaceOf(state).maximizedPaneId).toBeNull();
  });

  it("refuses a lone pane, which already fills the row", () => {
    const state = reducer(
      openWithTabs(initial(), "p1", "doc-a"),
      actions.toggleMaximizePane("p1"),
    );
    expect(workspaceOf(state).maximizedPaneId).toBeNull();
  });

  it("ignores an id no pane has", () => {
    const state = reducer(split(), actions.toggleMaximizePane("nope"));
    expect(workspaceOf(state).maximizedPaneId).toBeNull();
  });

  it("gives the row back when the hidden pane is focused", () => {
    let state = reducer(split(), actions.toggleMaximizePane("p1"));
    state = reducer(state, actions.focusPane("p2"));

    expect(workspaceOf(state).maximizedPaneId).toBeNull();
    expect(workspaceOf(state).focusedPaneId).toBe("p2");
  });

  it("gives the row back when a document opens in the hidden pane", () => {
    let state = reducer(split(), actions.toggleMaximizePane("p1"));
    state = reducer(
      state,
      actions.openPane({ paneId: "p2", rootId: "doc-c", mode: "write" }),
    );

    expect(workspaceOf(state).maximizedPaneId).toBeNull();
    expect(paneOf(state, "p2").rootId).toBe("doc-c");
  });

  it("survives a document opening in the maximized pane itself", () => {
    let state = reducer(split(), actions.toggleMaximizePane("p1"));
    state = reducer(
      state,
      actions.openPane({ paneId: "p1", rootId: "doc-c", mode: "write" }),
    );

    expect(workspaceOf(state).maximizedPaneId).toBe("p1");
  });

  it("ends when either pane closes — there is nothing left to hide", () => {
    const maximized = reducer(split(), actions.toggleMaximizePane("p1"));

    expect(
      workspaceOf(reducer(maximized, actions.closePane("p2"))).maximizedPaneId,
    ).toBeNull();
    expect(
      workspaceOf(reducer(maximized, actions.closePane("p1"))).maximizedPaneId,
    ).toBeNull();
  });

  it("unmaximizes without naming a pane — what Esc dispatches", () => {
    let state = reducer(split(), actions.toggleMaximizePane("p1"));
    state = reducer(state, actions.unmaximizePane());
    expect(workspaceOf(state).maximizedPaneId).toBeNull();
  });
});

describe("ui.workspace — focus is what 'active' means now", () => {
  it("a pane opened to the side takes focus, leaving the first one open", () => {
    let state = openWithTabs(initial(), "p1", "doc-a");
    state = reducer(
      state,
      actions.openPane({ paneId: "p2", rootId: "doc-b", mode: "read" }),
    );

    expect(workspaceOf(state).panes.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(workspaceOf(state).focusedPaneId).toBe("p2");
    expect(paneOf(state, "p1").rootId).toBe("doc-a");
    expect(paneOf(state, "p2").mode).toBe("read");
  });

  it("moving focus changes nothing else about either pane", () => {
    let state = openWithTabs(initial(), "p1", "doc-a", ["c1"]);
    state = openWithTabs(state, "p2", "doc-b");
    const before = JSON.stringify(workspaceOf(state).panes);

    state = reducer(state, actions.focusPane("p1"));

    expect(JSON.stringify(workspaceOf(state).panes)).toBe(before);
    expect(workspaceOf(state).focusedPaneId).toBe("p1");
  });

  it("mode is per pane, so one can be read while the other is written", () => {
    let state = openWithTabs(initial(), "p1", "doc-a");
    state = openWithTabs(state, "p2", "doc-b");

    state = reducer(state, actions.setPaneMode({ paneId: "p1", mode: "read" }));

    expect(paneOf(state, "p1").mode).toBe("read");
    expect(paneOf(state, "p2").mode).toBe("write");
  });
});

