import {
  createEntityAdapter,
  createSlice,
  EntityState,
  PayloadAction,
} from "@reduxjs/toolkit";
import { v4 as uuidv4 } from "uuid";
import {
  Announcement,
  AppState,
  DEFAULT_PANE_RATIO,
  MAX_PANES,
  PaneMode,
  PendingProposal,
  Post,
  SaveStatus,
  Series,
  SidebarView,
  WorkspacePane,
} from "../types";
import {
  clampPaneRatio,
  emptyWorkspace,
  sanitizeWorkspace,
} from "../lib/workspaceRestore";

// ── Domain thunks (split into separate files for maintainability) ────────────
import { loadSession } from "./thunks/sessionThunks";
import {
  applyPostRank,
  createPost,
  deletePost,
  duplicatePost,
  forkPost,
  getPost,
  loadPosts,
  movePost,
  updatePost,
} from "./thunks/postThunks";
import {
  createRevision,
  deleteRevision,
  getRevision,
} from "./thunks/revisionThunks";
import {
  applySeriesRank,
  createSeries,
  deleteSeries,
  loadSeries,
  moveSeries,
  updateSeries,
} from "./thunks/seriesThunks";
import {
  applyProjectRank,
  createProject,
  deleteProject,
  loadProjects,
  moveProject,
  updateProject,
} from "./thunks/projectThunks";
import {
  acceptAgentPost,
  approveProposal,
  discardAgentPost,
  refreshProposals,
  rejectProposal,
} from "./thunks/proposalThunks";
import { alert, updateUser } from "./thunks/userThunks";
import { importGuestDrafts } from "./thunks/importGuestDrafts";
import { createApiThunk, type Failure } from "./thunks/createApiThunk";

export const postsAdapter = createEntityAdapter<Post>();

/** Insert a new post at the front of ids[] so it appears first in the list. */
function prependPost(state: EntityState<Post, string>, post: Post) {
  postsAdapter.addOne(state, post);
  const idx = state.ids.indexOf(post.id);
  if (idx > 0) {
    state.ids.splice(idx, 1);
    state.ids.unshift(post.id);
  }
}

/**
 * Apply an authoritative post to the store: upsert it and keep `series.posts` in
 * sync with any membership change. Shared by create, update and move.
 *
 * A list-view post carries no `data`; merging rather than replacing keeps content
 * already loaded for the editor from being dropped by a background refresh.
 */
function applyPost(
  posts: EntityState<Post, string>,
  series: Series[],
  post: Post,
) {
  const existing = posts.entities[post.id];
  const previousSeriesId = existing?.seriesId;
  if (!existing) {
    prependPost(posts, post);
  } else {
    // A list payload carries only the newest revision (see `revisionsSelect`),
    // so it must not replace a fuller history the detail route already loaded —
    // otherwise a background refresh would collapse the revisions panel to one
    // entry. Revision *deletion* has its own reducer and does not come through
    // here, so keeping the longer list cannot strand a removed revision.
    const incoming = post.revisions;
    const kept = existing.revisions;
    Object.assign(existing, post, {
      data: post.data ?? existing.data,
      revisions: incoming && incoming.length >= (kept?.length ?? 0)
        ? incoming
        : kept,
    });
  }

  if (previousSeriesId && previousSeriesId !== post.seriesId) {
    const oldSeries = series.find((s) => s.id === previousSeriesId);
    if (oldSeries) {
      oldSeries.posts = oldSeries.posts.filter((p) => p.id !== post.id);
    }
  }
  if (post.seriesId) {
    const target = series.find((s) => s.id === post.seriesId);
    if (target) {
      const idx = target.posts.findIndex((p) => p.id === post.id);
      if (idx === -1) target.posts.push(post);
      else target.posts[idx] = post;
    }
  }
}

/** Drop a post from the store and from any series that lists it. */
function removePost(state: AppState, id: string) {
  postsAdapter.removeOne(state.posts, id);
  for (const series of state.series) {
    if (series.posts?.length) {
      series.posts = series.posts.filter((post) => post.id !== id);
    }
  }
  // A document that is gone cannot still be waiting on review. The proposal
  // went with it server-side (the revision cascades), so leaving the flags
  // behind would keep a badge counting work nobody can reach — and once
  // `agentPostIds` answers per row, a stale key outlives the row that would
  // have made it visible. Both helpers are no-ops when the id is not flagged,
  // which is what lets the discard path call one of them first.
  forgetProposal(state, id);
  forgetAgentPost(state, id);
}

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

/**
 * Drop a document's pending proposal and keep the badge count honest.
 *
 * The count is decremented rather than recomputed because it is what the *poll*
 * last reported, and the next poll is up to a window focus away: leaving it
 * alone would keep a badge on a document whose proposal is already gone.
 */
function forgetProposal(state: AppState, documentId: string) {
  if (!state.ui.proposals.byDocId[documentId]) return;
  delete state.ui.proposals.byDocId[documentId];
  const { count } = state.ui.proposals;
  count.proposals = Math.max(0, count.proposals - 1);
  count.total = count.proposals + count.agentPosts;
}

/**
 * The same, for an agent-created post that has been accepted or discarded.
 *
 * The keyed mirror is dropped in the same breath as the array entry: the two
 * are one fact in two shapes, and a reader that found them disagreeing would
 * have no way to tell which one is the truth.
 */
function forgetAgentPost(state: AppState, id: string) {
  const before = state.ui.proposals.agentPosts.length;
  state.ui.proposals.agentPosts = state.ui.proposals.agentPosts.filter(
    (post) => post.id !== id,
  );
  delete state.ui.proposals.agentPostIds[id];
  if (state.ui.proposals.agentPosts.length === before) return;
  const { count } = state.ui.proposals;
  count.agentPosts = Math.max(0, count.agentPosts - 1);
  count.total = count.proposals + count.agentPosts;
}

/** Push a thunk's `rejectWithValue` payload onto the announcement queue. */
const announceFailure = (state: AppState, payload: unknown) => {
  state.ui.announcements.push({ message: payload as Failure });
};

const initialState: AppState = {
  posts: postsAdapter.getInitialState(),
  series: [],
  projects: [],
  ui: {
    announcements: [],
    alerts: [],
    initialized: false,
    postsLoading: false,
    saveStatus: {},
    drawer: false,
    page: 1,
    diff: {},
    attachmentPreview: null,
    attachmentModified: null,
    workspace: {
      panes: [],
      focusedPaneId: null,
      splitRatio: DEFAULT_PANE_RATIO,
      maximizedPaneId: null,
    },
    workspaceHydrated: false,
    workspaceKey: null,
    sidebarView: "explorer",
    proposals: {
      byDocId: {},
      agentPosts: [],
      agentPostIds: {},
      count: { proposals: 0, agentPosts: 0, total: 0 },
      status: "idle",
      error: null,
      loaded: false,
    },
  },
};

/**
 * Bring the store up on first render.
 *
 * The session decides everything downstream — which backend `loadPosts` reads
 * from, and whether series/projects exist at all — so it is awaited first. Guest
 * drafts left over from before sign-in are imported before the load so they show
 * up in the same pass.
 */
export const load = createApiThunk("app/load", async (_, thunkAPI) => {
  await thunkAPI.dispatch(loadSession());
  await thunkAPI.dispatch(importGuestDrafts());
  await thunkAPI.dispatch(loadPosts());

  // Series must settle after posts so `series.posts` wins for shared entries.
  // Projects only group series, so they need not block.
  const { user } = thunkAPI.getState();
  if (user) {
    await thunkAPI.dispatch(loadSeries());
    thunkAPI.dispatch(loadProjects());
  }
});

// ── Slice ────────────────────────────────────────────────────────────────────
export const appSlice = createSlice({
  name: "app",
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<AppState["user"]>) {
      state.user = action.payload;
    },
    announce: (state, action: PayloadAction<Announcement>) => {
      state.ui.announcements.push(action.payload);
    },
    clearAnnouncement: (state) => {
      state.ui.announcements.shift();
    },
    clearAlert: (state) => {
      state.ui.alerts.shift();
    },
    setSaveStatus: (
      state,
      action: PayloadAction<{ id: string; status: SaveStatus }>,
    ) => {
      const { id, status } = action.payload;
      if (status === "idle") delete state.ui.saveStatus[id];
      else state.ui.saveStatus[id] = status;
    },
    toggleDrawer: (state, action: PayloadAction<boolean | undefined>) => {
      if (action.payload !== undefined) state.ui.drawer = action.payload;
      else state.ui.drawer = !state.ui.drawer;
    },
    setPage: (state, action: PayloadAction<number>) => {
      state.ui.page = action.payload;
    },
    setDiffRevisions: (
      state,
      action: PayloadAction<{ old?: string; new?: string }>,
    ) => {
      state.ui.diff = { ...state.ui.diff, ...action.payload };
    },

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
        state,
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
    closePane: (state, action: PayloadAction<string>) => {
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
    closeAllPanes: (state) => {
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
      state,
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
    workspaceKeyChanged: (state, action: PayloadAction<string>) => {
      if (state.ui.workspaceKey === action.payload) return;
      state.ui.workspaceKey = action.payload;
      state.ui.workspaceHydrated = false;
      state.ui.workspace = emptyWorkspace();
    },
    focusPane: (state, action: PayloadAction<string>) => {
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
    toggleMaximizePane: (state, action: PayloadAction<string>) => {
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
    unmaximizePane: (state) => {
      state.ui.workspace.maximizedPaneId = null;
    },
    /**
     * Where the splitter sits, as the left pane's share of the row.
     *
     * In the store rather than in `WorkspacePanes`' `useState` because it is
     * part of the layout being persisted, and a second storage path for one
     * concept is how the two drift apart.
     */
    setSplitRatio: (state, action: PayloadAction<number>) => {
      if (!Number.isFinite(action.payload)) return;
      state.ui.workspace.splitRatio = clampPaneRatio(action.payload);
    },
    setPaneMode: (
      state,
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
      state,
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
      state,
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
      state,
      action: PayloadAction<{ paneId: string; tabId: string }>,
    ) => {
      const pane = paneOf(state, action.payload.paneId);
      if (pane) pane.activeTabId = action.payload.tabId;
    },
    addTab: (
      state,
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
      state,
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
      state,
      action: PayloadAction<{ paneId: string; tabIds: string[] }>,
    ) => {
      const pane = paneOf(state, action.payload.paneId);
      if (pane) pane.tabIds = action.payload.tabIds;
    },

    openAttachmentPreview: (
      state,
      action: PayloadAction<{
        nodeKey?: string | null;
        url: string;
        filename: string;
        mimetype: string;
      }>,
    ) => {
      state.ui.attachmentPreview = {
        open: true,
        nodeKey: action.payload.nodeKey ?? null,
        url: action.payload.url,
        filename: action.payload.filename,
        mimetype: action.payload.mimetype,
      };
    },
    closeAttachmentPreview: (state) => {
      state.ui.attachmentPreview = null;
    },
    notifyAttachmentModified: (
      state,
      action: PayloadAction<{ url: string }>,
    ) => {
      state.ui.attachmentModified = {
        url: action.payload.url,
        timestamp: Date.now(),
      };
    },
    clearAttachmentModified: (state) => {
      state.ui.attachmentModified = null;
    },
    setSidebarView: (state, action: PayloadAction<SidebarView>) => {
      state.ui.sidebarView = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // ── Session ──
      .addCase(loadSession.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      .addCase(load.fulfilled, (state) => {
        state.ui.initialized = true;
      })
      // ── Posts ──
      .addCase(loadPosts.pending, (state) => {
        state.ui.postsLoading = true;
      })
      .addCase(loadPosts.fulfilled, (state, action) => {
        state.ui.postsLoading = false;
        const sorted = [...action.payload].sort((a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        postsAdapter.setAll(state.posts, sorted);
      })
      .addCase(loadPosts.rejected, (state, action) => {
        state.ui.postsLoading = false;
        announceFailure(state, action.payload);
      })
      .addCase(getPost.fulfilled, (state, action) => {
        applyPost(state.posts, state.series, action.payload);
      })
      .addCase(createPost.fulfilled, (state, action) => {
        applyPost(state.posts, state.series, action.payload);
      })
      .addCase(createPost.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(updatePost.fulfilled, (state, action) => {
        applyPost(state.posts, state.series, action.payload);
      })
      .addCase(updatePost.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(duplicatePost.fulfilled, (state, action) => {
        applyPost(state.posts, state.series, action.payload);
      })
      .addCase(duplicatePost.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(forkPost.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(deletePost.fulfilled, (state, action) => {
        removePost(state, action.payload);
        delete state.ui.saveStatus[action.payload];
      })
      .addCase(deletePost.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(applyPostRank, (state, action) => {
        const { id, rank } = action.payload;
        const post = state.posts.entities[id];
        if (post) post.rank = rank;
        // Reflect on the copy inside its series (for series-internal reorder).
        for (const s of state.series) {
          const p = s.posts.find((post) => post.id === id);
          if (p) p.rank = rank;
        }
      })
      .addCase(movePost.fulfilled, (state, action) => {
        applyPost(state.posts, state.series, action.payload);
      })
      .addCase(movePost.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(importGuestDrafts.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      // ── Revisions ──
      .addCase(createRevision.fulfilled, (state, action) => {
        const revision = action.payload;
        const post = state.posts.entities[revision.documentId];
        if (!post) return;
        if (!post.revisions) post.revisions = [];
        // Autosaves fold into one revision, so a known id means that revision
        // advanced — refresh it in place rather than skipping, or the revisions
        // panel would keep showing the timestamp the stretch started at.
        const index = post.revisions.findIndex((r) => r.id === revision.id);
        if (index === -1) post.revisions.unshift(revision);
        else post.revisions[index] = revision;
      })
      .addCase(createRevision.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(getRevision.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(deleteRevision.fulfilled, (state, action) => {
        const { id, documentId } = action.payload;
        const post = state.posts.entities[documentId];
        if (!post?.revisions) return;
        post.revisions = post.revisions.filter((r) => r.id !== id);
      })
      .addCase(deleteRevision.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      // ── Agent proposals (docs/plans/agent-gating.md §3.5) ──
      //
      // No `announceFailure` on the poll, unlike almost everything else here: it
      // runs on every window focus, and a server that is down would stack a
      // snackbar each time you came back to the tab. The failure is recorded on
      // the slice and the rail renders it — loud where someone is looking, quiet
      // where nobody asked. The four *actions* below do announce, because a
      // button that did nothing and said nothing is the worse failure.
      .addCase(refreshProposals.pending, (state) => {
        state.ui.proposals.status = "loading";
      })
      .addCase(refreshProposals.fulfilled, (state, action) => {
        const { count, proposals, agentPosts } = action.payload;
        const byDocId: Record<string, PendingProposal> = {};
        for (const proposal of proposals) {
          byDocId[proposal.documentId] = proposal;
        }
        // Both shapes are rebuilt from the same listing rather than patched, so
        // a document whose proposal was approved elsewhere disappears from
        // every reader in one assignment.
        const agentPostIds: Record<string, true> = {};
        for (const post of agentPosts) {
          agentPostIds[post.id] = true;
        }
        state.ui.proposals.byDocId = byDocId;
        state.ui.proposals.agentPosts = agentPosts;
        state.ui.proposals.agentPostIds = agentPostIds;
        state.ui.proposals.count = count;
        state.ui.proposals.status = "idle";
        state.ui.proposals.error = null;
        state.ui.proposals.loaded = true;
      })
      .addCase(refreshProposals.rejected, (state, action) => {
        state.ui.proposals.status = "error";
        state.ui.proposals.error = action.payload?.subtitle ??
          "Could not reach the server.";
      })
      .addCase(approveProposal.fulfilled, (state, action) => {
        const { documentId, head } = action.payload;
        forgetProposal(state, documentId);
        // The document's `head` moved. Reflect it so the open tab's next save
        // carries the right compare-and-set precondition rather than 409ing
        // against the head it was loaded at.
        const post = state.posts.entities[documentId];
        if (post && head) post.head = head;
      })
      .addCase(approveProposal.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(rejectProposal.fulfilled, (state, action) => {
        forgetProposal(state, action.payload.documentId);
      })
      .addCase(rejectProposal.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(acceptAgentPost.fulfilled, (state, action) => {
        forgetAgentPost(state, action.payload);
      })
      .addCase(acceptAgentPost.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(discardAgentPost.fulfilled, (state, action) => {
        forgetAgentPost(state, action.payload);
        removePost(state, action.payload);
      })
      .addCase(discardAgentPost.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      // ── User ──
      .addCase(updateUser.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      .addCase(updateUser.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(alert.pending, (state, action) => {
        state.ui.alerts.push(action.meta.arg);
      })
      .addCase(alert.fulfilled, (state) => {
        state.ui.alerts.shift();
      })
      .addCase(alert.rejected, (state, action) => {
        state.ui.alerts.shift();
        announceFailure(state, action.payload);
      })
      // ── Series ──
      .addCase(loadSeries.fulfilled, (state, action) => {
        state.series = action.payload || [];
      })
      .addCase(loadSeries.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(createSeries.fulfilled, (state, action) => {
        if (action.payload) state.series.unshift(action.payload);
      })
      .addCase(createSeries.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(updateSeries.fulfilled, (state, action) => {
        const updated = action.payload;
        if (!updated) return;
        const index = state.series.findIndex((s) => s.id === updated.id);
        if (index !== -1) state.series[index] = updated;
      })
      .addCase(updateSeries.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(applySeriesRank, (state, action) => {
        const s = state.series.find((x) => x.id === action.payload.id);
        if (!s) return;
        s.rank = action.payload.rank;
        // Only touch membership when the caller included it (a move), so a plain
        // reorder never clears the series' project.
        if ("projectId" in action.payload) {
          s.projectId = action.payload.projectId ?? null;
        }
      })
      .addCase(moveSeries.fulfilled, (state, action) => {
        const updated = action.payload;
        if (!updated) return;
        const s = state.series.find((x) => x.id === updated.id);
        if (s) {
          s.rank = updated.rank;
          s.projectId = updated.projectId ?? null;
        }
      })
      .addCase(moveSeries.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(deleteSeries.fulfilled, (state, action) => {
        if (action.payload) {
          state.series = state.series.filter((s) => s.id !== action.payload);
        }
      })
      .addCase(deleteSeries.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      // ── Projects ──
      .addCase(loadProjects.fulfilled, (state, action) => {
        state.projects = action.payload || [];
      })
      .addCase(loadProjects.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(createProject.fulfilled, (state, action) => {
        if (action.payload) state.projects.unshift(action.payload);
      })
      .addCase(createProject.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(updateProject.fulfilled, (state, action) => {
        const updated = action.payload;
        if (!updated) return;
        const index = state.projects.findIndex((p) => p.id === updated.id);
        if (index !== -1) state.projects[index] = updated;
      })
      .addCase(updateProject.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(applyProjectRank, (state, action) => {
        const p = state.projects.find((x) => x.id === action.payload.id);
        if (p) p.rank = action.payload.rank;
      })
      .addCase(moveProject.fulfilled, (state, action) => {
        const updated = action.payload;
        if (!updated) return;
        const p = state.projects.find((x) => x.id === updated.id);
        if (p) p.rank = updated.rank;
      })
      .addCase(moveProject.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(deleteProject.fulfilled, (state, action) => {
        const deletedId = action.payload;
        if (!deletedId) return;
        state.projects = state.projects.filter((p) => p.id !== deletedId);
        // The deleted project's series are freed to root; reflect that so the
        // sidebar stops nesting them (a reload settles their exact rank).
        state.series.forEach((s) => {
          if (s.projectId === deletedId) s.projectId = null;
        });
      })
      .addCase(deleteProject.rejected, (state, action) => {
        announceFailure(state, action.payload);
      });
  },
});

// ── Re-exports so external consumers keep the same import paths ──────────────
export { loadSession } from "./thunks/sessionThunks";

export {
  applyPostRank,
  createPost,
  deletePost,
  duplicatePost,
  forkPost,
  getPost,
  getPostById,
  getPostChildren,
  loadPosts,
  mergePostsIntoTabs,
  movePost,
  updatePost,
} from "./thunks/postThunks";

export {
  createRevision,
  deleteRevision,
  getRevision,
} from "./thunks/revisionThunks";

export {
  fetchStorageUsage,
  getPostThumbnail,
  getStorageUsage,
} from "./thunks/storageThunks";

export {
  createSeries,
  deleteSeries,
  loadSeries,
  moveSeries,
  updateSeries,
} from "./thunks/seriesThunks";
export {
  createProject,
  deleteProject,
  loadProjects,
  moveProject,
  updateProject,
} from "./thunks/projectThunks";
export {
  acceptAgentPost,
  approveProposal,
  discardAgentPost,
  refreshProposals,
  rejectProposal,
} from "./thunks/proposalThunks";
export { alert, updateUser } from "./thunks/userThunks";
export { importGuestDrafts } from "./thunks/importGuestDrafts";

export default appSlice.reducer;
