import { appSlice } from "@/store/app";
import type { AppState, WorkspacePane } from "@/types";

/**
 * The `ui.workspace` reducers, exercised directly.
 *
 * Pure state in, pure state out — no store, no React, no DOM, so this runs in
 * the default `node` environment like the other three specs. Testing the
 * reducers rather than the components is deliberate: the invariants that matter
 * here (a pane always has a valid `activeTabId`, dirty is keyed by document and
 * not by viewport) are the ones Phase 5 will lean on when a second pane exists,
 * and a component test would only observe them through one pane's worth of UI.
 *
 * `openPane` is called with an explicit `paneId` throughout. Its `prepare`
 * mints a uuid when the caller has no pane yet; supplying one keeps these
 * assertions readable and mirrors what the editor does, since it owns one pane
 * for its whole lifetime.
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

  it("opens the diff in the focused pane only", () => {
    let state = reducer(
      initial(),
      actions.openPane({ paneId: "p1", rootId: "doc-a", mode: "write" }),
    );
    state = reducer(
      state,
      actions.openPane({ paneId: "p2", rootId: "doc-b", mode: "write" }),
    );
    state = reducer(state, actions.setDiffOpen(true));

    expect(paneOf(state, "p1").diffOpen).toBe(false);
    expect(paneOf(state, "p2").diffOpen).toBe(true);
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

describe("ui.dirtyDocIds — hoisted out of panes", () => {
  it("marks and clears by document id", () => {
    let state = reducer(initial(), actions.markDocDirty("doc-a"));
    expect(state.ui.dirtyDocIds).toEqual(["doc-a"]);

    state = reducer(state, actions.markDocDirty("doc-b"));
    expect(state.ui.dirtyDocIds).toEqual(["doc-a", "doc-b"]);

    state = reducer(state, actions.markDocClean("doc-a"));
    expect(state.ui.dirtyDocIds).toEqual(["doc-b"]);
  });

  it("marking dirty twice records the document once", () => {
    let state = reducer(initial(), actions.markDocDirty("doc-a"));
    state = reducer(state, actions.markDocDirty("doc-a"));

    expect(state.ui.dirtyDocIds).toEqual(["doc-a"]);
  });

  it("clearing a document that is not dirty changes nothing", () => {
    const state = reducer(initial(), actions.markDocClean("doc-a"));
    expect(state.ui.dirtyDocIds).toEqual([]);
  });

  it("survives closing the pane the document was open in", () => {
    // Dirty is a property of the document, not of the viewport: the save loop
    // still owes this content to storage after the pane is gone.
    let state = openWithTabs(initial(), "p1", "doc-a");
    state = reducer(state, actions.markDocDirty("doc-a"));
    state = reducer(state, actions.closePane("p1"));

    expect(state.ui.dirtyDocIds).toEqual(["doc-a"]);
  });

  it("is one answer for a document open in two panes", () => {
    let state = openWithTabs(initial(), "p1", "doc-a");
    state = openWithTabs(state, "p2", "doc-a");
    state = reducer(state, actions.markDocDirty("doc-a"));

    expect(state.ui.dirtyDocIds).toEqual(["doc-a"]);

    state = reducer(state, actions.markDocClean("doc-a"));
    expect(state.ui.dirtyDocIds).toEqual([]);
  });

  it("drops the flag when the tab is removed outright", () => {
    // Closing a tab means deleting or re-homing the document — nothing can
    // save it from here, so a lingering dirty flag would be permanent.
    let state = openWithTabs(initial(), "p1", "doc-a", ["c1"]);
    state = reducer(state, actions.markDocDirty("c1"));
    state = reducer(state, actions.removeTab({ paneId: "p1", tabId: "c1" }));

    expect(state.ui.dirtyDocIds).toEqual([]);
  });
});
