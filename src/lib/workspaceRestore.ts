import {
  type AppState,
  DEFAULT_PANE_RATIO,
  MAX_PANE_RATIO,
  MAX_PANES,
  MIN_PANE_RATIO,
  type PaneMode,
  type WorkspacePane,
  type WorkspaceState,
} from "@/types";

/**
 * Turning a stored workspace record back into `ui.workspace` (plan §8.2).
 *
 * Import-light on purpose — types and constants only, no store, no IndexedDB,
 * no React — for the same reason `SideBar/dragGeometry.ts` is: it is the part
 * with rules in it, and it should be testable without a browser.
 *
 * The premise is that **a persisted record is untrusted input**. It was written
 * by an older build of this app, or by a tab that crashed mid-write, or by a
 * user with dev tools open. It is not a request body, but the difference is one
 * of likelihood and not of kind, and the failure modes here are quiet: a record
 * naming one document in two panes reproduces exactly the `saveRegistry`
 * collision the Phase 5 reducer invariant exists to make unreachable (§5.2),
 * and one naming three panes reproduces the layout §5.3 refused to build.
 */

/** The key a signed-out session's layout is stored under. */
const WORKSPACE_GUEST_KEY = "guest";

/**
 * Whose workspace this is.
 *
 * Per user, not per browser: a shared machine must not hand one account the
 * other's panes. Guests get a key too — they have documents (IndexedDB) and so
 * they have a workspace.
 */
export const workspaceKeyFor = (user?: { id: string } | null): string =>
  user?.id ?? WORKSPACE_GUEST_KEY;

/** A ratio the splitter can actually reach. */
export const clampPaneRatio = (ratio: number): number =>
  Math.min(MAX_PANE_RATIO, Math.max(MIN_PANE_RATIO, ratio));

/**
 * What a read of the stored workspace actually found.
 *
 * Three outcomes, and collapsing them into one `undefined` was a way to destroy
 * a layout: a read that timed out looks exactly like a user with nothing stored,
 * so the restore installed an empty workspace, the deep-link seam minted a pane
 * into it, and the debounced writer put that one pane over the record it had
 * never managed to read. `ok: false` is what stops the writer for the rest of
 * the session — this session's layout changes are lost, which is the direction
 * that is allowed to fail.
 *
 * `stored` stays `unknown` for the same reason {@link sanitizeWorkspace} exists:
 * the payload was written by some build of this app at some time, and knowing
 * the read succeeded says nothing about what it returned.
 */
export type StoredWorkspaceRead =
  | { ok: true; stored: unknown }
  | { ok: false; reason: "timeout" | "error" };

/**
 * The key this session may record its layout under, or `null` if it may not.
 *
 * The persistence middleware's whole write decision, here rather than there so
 * it can be exercised without IndexedDB — the same reason `dragGeometry.ts` is
 * import-free. Five conditions, and each one is a way a write destroys
 * something:
 *
 * 1. **Hydrated.** Before the restore lands the store holds no layout, only a
 *    default one.
 * 2. **The read did not fail.** A timed-out or thrown read leaves the stored
 *    record unseen and still valid. See {@link StoredWorkspaceRead}.
 * 3. **Not provisional.** A cold-start `/edit/<id>` retargets a pane the
 *    restore had just filled. Nobody asked for that eviction — a bookmark did
 *    — so it is shown and not recorded until the user changes the layout on
 *    purpose. See `AppState["ui"].workspaceProvisional` and
 *    docs/plans/archive/workspace-url.md §3.3.
 * 4. **A key.** There is nothing to write under until the restore names one.
 * 5. **Non-empty.** `closeAllPanes` fires on every navigation out of `/edit`.
 *
 * Returning the key rather than a boolean is what keeps the caller from having
 * to re-establish that it is non-null.
 */
export const workspaceWriteKey = (ui: AppState["ui"]): string | null =>
  ui.workspaceHydrated && !ui.workspaceRestoreFailed &&
    !ui.workspaceProvisional &&
    ui.workspaceKey !== null && ui.workspace.panes.length > 0
    ? ui.workspaceKey
    : null;

/** The workspace of a session that has nothing stored (or nothing usable). */
export const emptyWorkspace = (): WorkspaceState => ({
  panes: [],
  focusedPaneId: null,
  splitRatio: DEFAULT_PANE_RATIO,
  maximizedPaneId: null,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asId = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const asIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of value) {
    const id = asId(entry);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
};

const asMode = (value: unknown): PaneMode =>
  value === "read" || value === "write" ? value : "write";

/**
 * One stored pane, or `null` if it is not one.
 *
 * A pane with no `rootId` is the case that matters: `TabbedDocumentEditor` is
 * handed `rootId` directly and `usePostLoader` would go looking for the
 * document `undefined`.
 */
const restorePane = (raw: unknown): WorkspacePane | null => {
  if (!isRecord(raw)) return null;
  const id = asId(raw.id);
  const rootId = asId(raw.rootId);
  if (!id || !rootId) return null;

  const tabIds = asIdList(raw.tabIds);
  const storedActive = asId(raw.activeTabId);
  // A pane may legitimately name an active tab before its tab list is known —
  // that is what `openPane`'s `activeTabId` seed is for — but once the list is
  // there the active tab has to be in it, or `EditorTabPanel` renders nothing.
  const activeTabId = tabIds.length === 0
    ? storedActive
    : storedActive && tabIds.includes(storedActive)
    ? storedActive
    : tabIds.includes(rootId)
    ? rootId
    : tabIds[0];

  return {
    id,
    rootId,
    tabIds,
    activeTabId,
    mode: asMode(raw.mode),
    // Never restored open: `ui.diff` — which revisions to compare, and whose
    // review it is — is not persisted, so a pane that came back with `diffOpen`
    // would render a diff of nothing. A review asked for in *this* session and
    // still waiting for its pane is not lost by this: the deep-link `openPane`
    // that follows the restore re-derives the flag from `ui.diff.docId`.
    diffOpen: false,
  };
};

/** Every document id a pane would mount an `EditorTabPanel` for. */
const documentsOf = (pane: WorkspacePane): string[] => [
  pane.rootId,
  ...pane.tabIds,
];

/**
 * A stored record, made safe to install.
 *
 * Four rules, each one a way the record can be wrong:
 *
 * 1. **Clamp to {@link MAX_PANES}.** Three panes is a layout that has no
 *    resize handle and no way back to two.
 * 2. **One document, one pane.** A later pane claiming a document an earlier
 *    one already holds is dropped whole — root *or* tab, since the collision is
 *    per mounted editor. Panes are ordered, so "earlier" means the left one
 *    wins, which is the one the user reads first.
 * 3. **`focusedPaneId` must name a survivor**, falling back to the last pane —
 *    the same choice `closePane` makes when the focused pane goes away.
 * 4. **`splitRatio` is clamped**, and a non-finite one is discarded rather than
 *    propagated into a `flex-grow` of `NaN`.
 * 5. **Nothing comes back maximized.** Like `diffOpen`, that is a way of looking
 *    at the layout rather than part of it — see `WorkspaceState.maximizedPaneId`
 *    — and a record written by a build that stored one is not a reason to open
 *    with a pane hidden.
 *
 * Documents that no longer exist are **not** checked here, and cannot be: posts
 * are not loaded when this runs, and a pane may hold a document that is
 * legitimately absent from the session's list (a fork source, the well-known
 * `notes` post, which is created on first open). `usePostLoader` already ends
 * at "Post Not Found" for a document it cannot fetch, in the pane, without
 * destroying the other one.
 */
export const sanitizeWorkspace = (raw: unknown): WorkspaceState => {
  if (!isRecord(raw)) return emptyWorkspace();

  const panes: WorkspacePane[] = [];
  const paneIds = new Set<string>();
  const claimedDocs = new Set<string>();

  for (const entry of Array.isArray(raw.panes) ? raw.panes : []) {
    if (panes.length >= MAX_PANES) break;
    const pane = restorePane(entry);
    if (!pane || paneIds.has(pane.id)) continue;
    const docs = documentsOf(pane);
    if (docs.some((docId) => claimedDocs.has(docId))) continue;
    paneIds.add(pane.id);
    for (const docId of docs) claimedDocs.add(docId);
    panes.push(pane);
  }

  const storedFocus = asId(raw.focusedPaneId);
  const focusedPaneId = storedFocus && paneIds.has(storedFocus)
    ? storedFocus
    : panes[panes.length - 1]?.id ?? null;

  const storedRatio = raw.splitRatio;
  const splitRatio = typeof storedRatio === "number" &&
      Number.isFinite(storedRatio)
    ? clampPaneRatio(storedRatio)
    : DEFAULT_PANE_RATIO;

  return { panes, focusedPaneId, splitRatio, maximizedPaneId: null };
};
