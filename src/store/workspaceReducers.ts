import { PayloadAction } from "@reduxjs/toolkit";
import { v4 as uuidv4 } from "uuid";
import { AppState, MAX_PANES, PaneMode, WorkspacePane } from "../types";
import {
  clampPaneRatio,
  emptyWorkspace,
  sanitizeWorkspace,
} from "../lib/workspaceRestore";

/**
 * The workspace-pane half of the app slice.
 *
 * Split out of `app.ts` rather than living beside the other reducers because it
 * is a self-contained subsystem: sixteen reducers over `ui.workspace`, six
 * private helpers, and a set of invariants (duplicate-open, maximize, tab
 * ownership) that nothing else in the slice participates in. `app.ts` had grown
 * back past a thousand lines carrying it.
 *
 * These are spread into `createSlice`'s `reducers` map, so every action still
 * lands on the `app/` slice under its existing type string and `appSlice.actions`
 * is unchanged — this moves code, not the store's shape. `state` is annotated
 * `AppState` for the same reason it is inferred as a draft inside `createSlice`:
 * Immer hands each reducer a mutable draft of the whole slice.
 */

/**
 * The pane a pane-scoped reducer is acting on, or `undefined`.
 *
 * Every workspace reducer below is a no-op on an unknown id rather than a
 * throw: panes are closed by React effect cleanups, so a late dispatch from a
 * debounced handler or a resolved promise is ordinary rather than a bug.
 */
const paneOf = (state: AppState, paneId: string): WorkspacePane | undefined =>
  state.ui.workspace.panes.find((pane) => pane.id === paneId);

/** The focused pane, for the reducers whose callers have no pane in hand. */
const focusedPaneOf = (state: AppState): WorkspacePane | undefined => {
  const { focusedPaneId } = state.ui.workspace;
  return focusedPaneId ? paneOf(state, focusedPaneId) : undefined;
};

/**
 * A maximized pane is the focused pane, and there is a second pane behind it.
 *
 * Both halves are load-bearing rather than tidiness. The pane a maximize hides
 * is `display: none` — it cannot be clicked, so a `focusPane` naming it (from
 * `pane.focus`, a sidebar row, the Copilot) would leave the focus, the toolbar
 * and the Copilot's target on a pane nobody can see. And a maximize that
 * outlived its neighbour would be a lone pane still drawing a "restore" button
 * for a split that is no longer there.
 *
 * Called by every reducer that can move focus or remove a pane, so neither state
 * is reachable rather than merely unlikely.
 */
const enforceMaximizeInvariant = (state: AppState) => {
  const workspace = state.ui.workspace;
  if (!workspace.maximizedPaneId) return;
  if (
    workspace.panes.length < 2 ||
    workspace.maximizedPaneId !== workspace.focusedPaneId
  ) {
    workspace.maximizedPaneId = null;
  }
};

/**
 * The pane already showing `docId`, as its root or as one of its tabs.
 *
 * This is the lookup behind the duplicate-open invariant (plan §5.2). It has to
 * consider `tabIds` and not just `rootId`, because the thing that breaks is a
 * second **`EditorTabPanel`** for one document — and a pane mounts one per tab.
 * A post opened as a root while it is already a tab of the pane next door is the
 * same collision as opening it twice at the top level.
 *
 * Exported so `selectPaneShowingDoc` can answer the same question for readers
 * outside the slice — the URL projection asks it of the document the address bar
 * names — rather than the invariant getting a second, drifting definition.
 */
export const paneShowing = (
  state: AppState,
  docId: string,
): WorkspacePane | undefined =>
  state.ui.workspace.panes.find(
    (pane) => pane.rootId === docId || pane.tabIds.includes(docId),
  );

/**
 * Should a pane holding `docId` be showing the review diff?
 *
 * The pane flag is a projection of `ui.diff.docId`, so every write that creates
 * or retargets a pane asks this rather than assuming. Assuming was the bug: a
 * pane is not a stable place to record a request made against a *document*.
 * "Review" on a rail row for a closed document opens the document and then asks
 * for its diff, and between those two the workspace can legitimately rebuild the
 * pane — the restore lands, the deep link replays, `WorkspacePanes` remounts —
 * each of which used to hard-clear a flag the click had already set.
 */
const diffOpenFor = (state: AppState, docId: string): boolean =>
  state.ui.diff.docId === docId;

/**
 * Is `docId` held by some pane *other* than `paneId`?
 *
 * The other half of §5.2. `openPane` keeps a pane from being **rooted** at a
 * document another pane holds, but a pane's tab list arrives later, from a
 * fetch: open a child document in one pane, then open its parent post in the
 * other, and the parent's children come back containing a document the first
 * pane is already showing.
 *
 * That is not cosmetic. `TabbedDocumentEditor` renders an `EditorTabPanel` for
 * every entry in `tabIds`, and each panel registers a save callback in
 * `saveRegistry` under its document id — so the second one to mount silently
 * replaces the first, and one pane stops persisting with no error. Which is the
 * exact failure the duplicate-open invariant exists to prevent.
 *
 * The derived list yields to the explicit one: a pane rooted at a document, or
 * already showing it, got there because someone asked for it.
 */
const heldElsewhere = (
  state: AppState,
  paneId: string,
  docId: string,
): boolean =>
  state.ui.workspace.panes.some(
    (pane) =>
      pane.id !== paneId &&
      (pane.rootId === docId || pane.tabIds.includes(docId)),
  );

/** Spread into `appSlice`'s `reducers` map. See the module docstring. */
export const workspaceReducers = {
  // ── Workspace: panes ──────────────────────────────────────────────────
  //
  // A pane is a viewport onto a document; `tabIds` inside it are the root
  // post's child documents (plan §2.1). One pane exists today — the array is
  // what lets Phase 5 add the second without another migration.

  /**
   * Show a document in the workspace. The one door in.
   *
   * Three cases, in this order:
   *
   * 1. **The document is already open somewhere.** Focus that pane and, if the
   *    document is one of its tabs, make it the active one. Nothing else
   *    moves. This is the duplicate-open guard of plan §5.2, and it lives here
   *    rather than in `commands/document.ts` on purpose: `saveRegistry` is a
   *    `Map` keyed by document id, so a second live editor for one document
   *    overwrites the first one's save callback and that pane silently stops
   *    persisting. A reducer invariant is the only version of that rule an
   *    AI-issued command cannot route around.
   * 2. **A `paneId` was supplied.** Retarget that pane, or mint it if it does
   *    not exist yet and the workspace is under {@link MAX_PANES}. This is
   *    what `pane.split` uses — "a *new* viewport", stated by naming one.
   * 3. **No `paneId`.** Retarget the focused pane, minting the first one if
   *    the workspace is empty. This is what opening a post from the sidebar,
   *    the palette or a deep link means: show it where I am looking.
   *
   * `tabIds` starts empty on a retarget: the children are a fetch away, and
   * every consumer falls back to `rootId` until they land.
   */
  openPane: {
    reducer: (
      state: AppState,
      action: PayloadAction<{
        paneId: string | null;
        rootId: string;
        mode: PaneMode | null;
        activeTabId: string | null;
      }>,
    ) => {
      const { paneId, rootId, mode, activeTabId } = action.payload;

      // (1) Already open — focus, never duplicate.
      const existing = paneShowing(state, rootId);
      if (existing && existing.id !== paneId) {
        state.ui.workspace.focusedPaneId = existing.id;
        if (existing.tabIds.includes(rootId)) existing.activeTabId = rootId;
        if (mode) existing.mode = mode;
        if (diffOpenFor(state, rootId)) existing.diffOpen = true;
        enforceMaximizeInvariant(state);
        return;
      }

      // (2)/(3) Which viewport is being retargeted.
      const target = paneId ? paneOf(state, paneId) : focusedPaneOf(state);
      if (target) {
        target.rootId = rootId;
        target.tabIds = [];
        target.activeTabId = activeTabId;
        // An omitted mode means "however this pane is already being read".
        if (mode) target.mode = mode;
        // A different document means a different review, so the previous
        // one's diff goes — that is what stops a pane retargeted mid-review
        // from showing a stale comparison. The *same* document means this is
        // the open half of a "Review" click (or the deep-link replay of one),
        // and the diff it asked for comes with it. See {@link diffOpenFor}.
        target.diffOpen = diffOpenFor(state, rootId);
        state.ui.workspace.focusedPaneId = target.id;
        enforceMaximizeInvariant(state);
        return;
      }

      if (state.ui.workspace.panes.length >= MAX_PANES) return;
      const id = paneId ?? uuidv4();
      state.ui.workspace.panes.push({
        id,
        rootId,
        tabIds: [],
        activeTabId,
        mode: mode ?? "write",
        diffOpen: diffOpenFor(state, rootId),
      });
      state.ui.workspace.focusedPaneId = id;
      // The pane that was filling the row is not the new one, so the split is
      // back — otherwise `pane.split` off a maximized pane would put the new
      // document straight behind the `display: none`.
      enforceMaximizeInvariant(state);
    },
    prepare: (input: {
      rootId: string;
      /** Omit to retarget the focused pane; name one to create/retarget it. */
      paneId?: string;
      /** Omit to keep the pane's current mode; `write` on a fresh pane. */
      mode?: PaneMode;
      /**
       * Seeds the active tab before the tab list is known — a deep link to a
       * child tab needs the child, not the root it belongs to.
       */
      activeTabId?: string | null;
    }) => ({
      payload: {
        paneId: input.paneId ?? null,
        rootId: input.rootId,
        mode: input.mode ?? null,
        activeTabId: input.activeTabId ?? null,
      },
    }),
  },
  closePane: (state: AppState, action: PayloadAction<string>) => {
    const panes = state.ui.workspace.panes.filter(
      (pane) => pane.id !== action.payload,
    );
    state.ui.workspace.panes = panes;
    if (state.ui.workspace.focusedPaneId === action.payload) {
      state.ui.workspace.focusedPaneId = panes[panes.length - 1]?.id ?? null;
    }
    // Closing the neighbour of a maximized pane leaves nothing to maximize
    // over; closing the maximized one leaves a survivor that must be visible.
    enforceMaximizeInvariant(state);
  },
  /**
   * Leaving the workspace editor entirely. Nothing is open any more.
   *
   * Also drops the hydrated flag, so re-entering the workspace reads the
   * layout back rather than starting from one pane. The stored record is not
   * touched — the persistence middleware refuses to write an empty workspace
   * precisely so that this unmount, which fires on every navigation out of
   * `/edit`, cannot erase what it is supposed to be preserving.
   */
  closeAllPanes: (state: AppState) => {
    state.ui.workspace = emptyWorkspace();
    state.ui.workspaceHydrated = false;
  },
  /**
   * Install a layout read back from storage (plan §8.2).
   *
   * The payload is `unknown` and stays that way until {@link
   * sanitizeWorkspace} has had it. Typing it as a `WorkspaceState` would be
   * the same compile-time fiction `parseBody` exists to refuse for request
   * bodies: nothing about a record that has been sitting in a browser since
   * an older build makes it one.
   *
   * Two things it will not do:
   *
   * - **Restore twice.** `workspaceHydrated` gates it, so a second read
   *   landing late cannot replace a layout the user has since changed.
   * - **Overwrite what is already open.** The flag is still set — the caller
   *   asked and got an answer — but the panes are left alone. The IndexedDB
   *   read is asynchronous, and a click on a sidebar row in that window is a
   *   deliberate act; a stored record from last Tuesday is not.
   */
  restoreWorkspace: (
    state: AppState,
    action: PayloadAction<{ key: string; stored: unknown }>,
  ) => {
    if (state.ui.workspaceHydrated) return;
    state.ui.workspaceKey = action.payload.key;
    state.ui.workspaceHydrated = true;
    if (state.ui.workspace.panes.length > 0) return;
    state.ui.workspace = sanitizeWorkspace(action.payload.stored);
  },
  /**
   * The session turned out to belong to someone else than the layout does.
   *
   * The restore has to guess a key before the session has resolved — that is
   * the whole point of not gating on `initialized` — and it guesses from a
   * device-local note of who was signed in last. Usually right; wrong across
   * an expired cookie, or when a second account signs in on a shared
   * browser. Clearing back to un-hydrated is what makes that self-correcting:
   * the restore runs again under the right key, and the deep-link seam
   * replays the URL on top of it exactly as it did the first time.
   */
  workspaceKeyChanged: (state: AppState, action: PayloadAction<string>) => {
    if (state.ui.workspaceKey === action.payload) return;
    state.ui.workspaceKey = action.payload;
    state.ui.workspaceHydrated = false;
    state.ui.workspace = emptyWorkspace();
  },
  focusPane: (state: AppState, action: PayloadAction<string>) => {
    if (paneOf(state, action.payload)) {
      state.ui.workspace.focusedPaneId = action.payload;
      // Focusing the pane behind a maximize restores the split rather than
      // moving the focus somewhere invisible.
      enforceMaximizeInvariant(state);
    }
  },
  /**
   * Give one pane the whole row, or give the row back.
   *
   * A toggle rather than a pair of setters because it is one button (⤢ in the
   * pane's strip, `pane.maximize`), and because "restore" has no other
   * meaning: at most one pane can be maximized, so the id is both the thing to
   * maximize and the thing to check against.
   *
   * Maximizing focuses the pane — see {@link enforceMaximizeInvariant}, which
   * is why that is here rather than left to the click that preceded it. With
   * one pane it is refused outright: there is nothing to fill the row with
   * that is not already filling it.
   */
  toggleMaximizePane: (state: AppState, action: PayloadAction<string>) => {
    const workspace = state.ui.workspace;
    if (!paneOf(state, action.payload)) return;
    if (workspace.maximizedPaneId === action.payload) {
      workspace.maximizedPaneId = null;
      return;
    }
    if (workspace.panes.length < 2) return;
    workspace.maximizedPaneId = action.payload;
    workspace.focusedPaneId = action.payload;
  },
  /** Esc, and anything else that means "show me both panes again". */
  unmaximizePane: (state: AppState) => {
    state.ui.workspace.maximizedPaneId = null;
  },
  /**
   * Where the splitter sits, as the left pane's share of the row.
   *
   * In the store rather than in `WorkspacePanes`' `useState` because it is
   * part of the layout being persisted, and a second storage path for one
   * concept is how the two drift apart.
   */
  setSplitRatio: (state: AppState, action: PayloadAction<number>) => {
    if (!Number.isFinite(action.payload)) return;
    state.ui.workspace.splitRatio = clampPaneRatio(action.payload);
  },
  setPaneMode: (
    state: AppState,
    action: PayloadAction<{ paneId: string; mode: PaneMode }>,
  ) => {
    const pane = paneOf(state, action.payload.paneId);
    if (pane) pane.mode = action.payload.mode;
  },
  /**
   * Show or hide a **document's** review diff.
   *
   * Addressed by document rather than by pane, and that is the whole point.
   * It used to act on the focused pane, which made every caller responsible
   * for the pane being the right one *at that instant*: "Review" on a rail row
   * had to open the document first and hope no later workspace write rebuilt
   * the pane, and `usePostLoader`'s unmount cleanup had to check the focused
   * document by hand before it dared close anything.
   *
   * Neither is a judgement call now. `ui.diff.docId` is the record — it
   * survives a pane being replaced — and the pane holding the document, if
   * there is one yet, is updated to match. Asking to close document A's diff
   * cannot close document B's, and asking to open one before its pane exists
   * is honoured by `openPane` when the pane appears.
   */
  setDiffOpen: (
    state: AppState,
    action: PayloadAction<{ docId: string; open: boolean }>,
  ) => {
    const { docId, open } = action.payload;
    if (open) state.ui.diff.docId = docId;
    else if (state.ui.diff.docId === docId) delete state.ui.diff.docId;
    const pane = paneShowing(state, docId);
    if (pane) pane.diffOpen = open;
  },

  // ── Workspace: the tab group inside a pane ────────────────────────────

  /** Publish the fetched tab list. Replaces the old `initTabs`. */
  setPaneTabs: (
    state: AppState,
    action: PayloadAction<{
      paneId: string;
      tabIds: string[];
      activeTabId: string;
    }>,
  ) => {
    const { paneId, tabIds, activeTabId } = action.payload;
    const pane = paneOf(state, paneId);
    if (!pane) return;
    // A pane always renders what it is rooted at; everything else yields to a
    // pane already showing it. See `heldElsewhere`.
    const admissible = tabIds.filter(
      (id) => id === pane.rootId || !heldElsewhere(state, paneId, id),
    );
    pane.tabIds = admissible;
    pane.activeTabId = admissible.includes(activeTabId)
      ? activeTabId
      : admissible[0] ?? null;
  },
  setActiveTab: (
    state: AppState,
    action: PayloadAction<{ paneId: string; tabId: string }>,
  ) => {
    const pane = paneOf(state, action.payload.paneId);
    if (pane) pane.activeTabId = action.payload.tabId;
  },
  addTab: (
    state: AppState,
    action: PayloadAction<{ paneId: string; tabId: string }>,
  ) => {
    const { paneId, tabId } = action.payload;
    const pane = paneOf(state, paneId);
    if (!pane) return;
    // Same invariant as `setPaneTabs`: adding a tab for a document another
    // pane is showing would mount a second editor for it and clobber its save
    // callback. Refuse rather than admit it.
    if (heldElsewhere(state, paneId, tabId)) return;
    if (!pane.tabIds.includes(tabId)) pane.tabIds.push(tabId);
    pane.activeTabId = tabId;
  },
  removeTab: (
    state: AppState,
    action: PayloadAction<{ paneId: string; tabId: string }>,
  ) => {
    const { paneId, tabId } = action.payload;
    const pane = paneOf(state, paneId);
    if (!pane) return;
    const idx = pane.tabIds.indexOf(tabId);
    pane.tabIds = pane.tabIds.filter((id) => id !== tabId);
    if (pane.activeTabId === tabId) {
      const newIdx = Math.min(idx, pane.tabIds.length - 1);
      pane.activeTabId = pane.tabIds[newIdx] ?? null;
    }
  },
  reorderTabs: (
    state: AppState,
    action: PayloadAction<{ paneId: string; tabIds: string[] }>,
  ) => {
    const pane = paneOf(state, action.payload.paneId);
    if (pane) pane.tabIds = action.payload.tabIds;
  },
};
