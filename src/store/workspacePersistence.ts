import type { Middleware } from "@reduxjs/toolkit";
import { getStore } from "@/indexeddb";
import {
  type StoredWorkspaceRead,
  workspaceKeyFor,
  workspaceWriteKey,
} from "@/lib/workspaceRestore";
import {
  capScrollTops,
  sanitizeScrollTops,
  type ScrollTops,
  shouldRecord,
} from "@/lib/scrollMemory";
import type { AppState, RailViewId, WorkspaceState } from "@/types";
import { appSlice } from "./app";

/**
 * Persisting `ui.workspace` across a reload (plan §8.2).
 *
 * **Where.** IndexedDB, in a `workspaces` store, one record per user id — or
 * `"guest"`. Not the cloud, and the reason is not effort: a workspace layout is
 * a fact about a *device*. A 70/30 split that reads well on a desktop is
 * unusable on a laptop, and a guest with no account still has documents and so
 * still has a workspace. Storing it per-account would make the second of those
 * impossible and the first actively wrong.
 *
 * **When.** On change, debounced. A resize drag dispatches per pointer move, so
 * writing on every store change would mean a few hundred IndexedDB transactions
 * per drag; {@link WRITE_DEBOUNCE_MS} collapses those into one. The snapshot is
 * taken when the write is *scheduled*, not when it fires — otherwise a pane
 * closed 10ms before navigating away would have its write land after
 * `closeAllPanes` had already emptied the state, and record nothing.
 *
 * **Never empty.** `WorkspacePanes` clears every pane on unmount, which happens
 * on each navigation out of `/edit`. Writing that through would erase the
 * layout on the way out the door, every time. An empty workspace is therefore
 * not a layout worth recording — and it is not a state a user can sit in
 * either, since the deep-link seam opens a pane the moment the route mounts.
 *
 * **Never over a record this session could not read.** That last sentence is
 * also how a layout was destroyed: a restore that timed out installed an empty
 * workspace, the seam minted its pane into it, and one pane is not empty. So the
 * read now says which of its three outcomes happened
 * ({@link readStoredWorkspace}), and a session that never got an answer stays
 * usable but writes nothing — losing this session's layout changes rather than
 * the stored layout.
 *
 * **Never a layout the user did not choose.** A cold-start `/edit/<id>`
 * retargets the focused pane, which on a just-restored split evicts the
 * document that was in it — and the debounce put that eviction in the record
 * before the user had touched anything. So an entry that displaces a pane marks
 * the workspace provisional (`ui.workspaceProvisional`,
 * docs/plans/archive/workspace-url.md §3.3) and this module writes nothing
 * until a deliberate layout change lowers the flag. For one session the view
 * and the record disagree; a reload lands on the record, which is the layout
 * the user built.
 */

/** Long enough to swallow a resize drag; short enough to beat a reload. */
const WRITE_DEBOUNCE_MS = 400;

/**
 * One record per user, keyed by the id the layout belongs to.
 *
 * `maximizedPaneId` is omitted rather than merely unwritten: a maximize is a way
 * of looking at a layout and not part of one (see the field's own note), and
 * stating that in the type is what makes leaving it out of `schedule` below a
 * compile error to undo rather than an omission to notice.
 */
interface StoredWorkspace extends Omit<WorkspaceState, "maximizedPaneId"> {
  /** A user id, or `"guest"`. */
  id: string;
  /**
   * Where each document was last left. Part of the layout record rather than a
   * store of its own: a scroll offset is the same kind of fact as a split
   * ratio — device-local, per document, worthless to another browser — and
   * giving it a second record would mean a second read on the critical path
   * and two lifetimes to keep in step. Optional because records written before
   * this existed do not carry it.
   */
  scrollTops?: ScrollTops;
  /**
   * Which view each document's right panel is showing, or `null` for one the
   * user closed.
   *
   * Here for the same reason `scrollTops` is: it is device-local, per document
   * and worthless to another browser, and a second record would mean a second
   * read on the critical path and two lifetimes to keep in step. Optional
   * because records written before the panel had views do not carry it.
   *
   * Unlike `scrollTops` this one lives in Redux rather than in module state.
   * It changes on a click, not on a scroll frame, and components render it —
   * both of the reasons the scroll map is kept out of the store point the other
   * way here.
   */
  railPanel?: Record<string, RailViewId | null>;
  updatedAt: string;
}

const workspaceDB = getStore<StoredWorkspace>("workspaces");

/**
 * Which user the workspace store should be read for, before the session says.
 *
 * `localStorage` rather than IndexedDB because this one has to be answerable
 * *synchronously*, and because it is a note about the device rather than data:
 * "the last session on this browser belonged to X". The layout itself stays in
 * IndexedDB where the rest of the client's storage lives.
 *
 * A wrong guess is survivable and self-correcting — see `workspaceKeyChanged` —
 * but it is right in every case except a session that ended without a sign-out.
 */
const KEY_HINT = "workspace.lastUserKey";

export const readWorkspaceKeyHint = (): string => {
  try {
    return localStorage.getItem(KEY_HINT) ?? workspaceKeyFor(null);
  } catch {
    // Private-mode Safari and friends: no hint, so guess guest and let the
    // session correct it.
    return workspaceKeyFor(null);
  }
};

const rememberWorkspaceKeyHint = (key: string) => {
  try {
    localStorage.setItem(KEY_HINT, key);
  } catch {
    // A layout that does not survive a reload is not worth an error dialog.
  }
};

/**
 * How long the editor will wait for its layout before opening without one.
 *
 * The deep-link seam is gated on this read, which makes a hung read a blank
 * editor. `getConnection` waits up to ten seconds for `setupIndexedDB` before
 * giving up — fine for a draft nobody is looking at, far too long for the thing
 * standing between the user and their document. A restore is a convenience and
 * is bounded like one.
 */
const READ_TIMEOUT_MS = 2000;

/** Distinguishes the timeout below from a record that is genuinely absent. */
const TIMED_OUT = Symbol("workspace-read-timeout");

/**
 * The stored layout for a user.
 *
 * Answers with {@link StoredWorkspaceRead} rather than with the record, because
 * "nothing is stored", "the read threw" and "the read ran out of time" are three
 * different facts and only the first of them means the user has no layout. The
 * other two must not be allowed to look like an empty workspace, or the session
 * writes one back over a record it never read.
 *
 * `stored` is typed `unknown`, and that is the point: what comes back was
 * written by some build of this app at some time, and the only way to turn it
 * into a `WorkspaceState` is `sanitizeWorkspace`, which does not trust it.
 * Handing the caller a `StoredWorkspace` here would be the same compile-time
 * fiction `parseBody` exists to refuse for request bodies.
 */
export const readStoredWorkspace = async (
  key: string,
): Promise<StoredWorkspaceRead> => {
  try {
    const stored = await Promise.race([
      workspaceDB.getByID(key),
      new Promise<typeof TIMED_OUT>((resolve) =>
        setTimeout(() => resolve(TIMED_OUT), READ_TIMEOUT_MS)
      ),
    ]);
    if (stored === TIMED_OUT) {
      // Warned about for the same reason a thrown read is: the session is about
      // to open without a layout and refuse to record one, and nothing else says
      // so. Not an error dialog — a layout is a convenience.
      console.warn(
        `stored workspace read timed out after ${READ_TIMEOUT_MS}ms; ` +
          "opening without a layout and not recording one",
      );
      return { ok: false, reason: "timeout" };
    }
    return { ok: true, stored };
  } catch (error) {
    console.warn("could not read the stored workspace", error);
    return { ok: false, reason: "error" };
  }
};

// ── The debounced writer ─────────────────────────────────────────────────────

let pending: StoredWorkspace | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const write = async () => {
  timer = null;
  const record = pending;
  pending = null;
  if (!record) return;
  try {
    await workspaceDB.update(record);
  } catch (error) {
    console.warn("could not record the workspace layout", error);
  }
};

/**
 * Write any scheduled layout now.
 *
 * Bound to `visibilitychange` by `WorkspacePanes`, so a change made in the last
 * few hundred milliseconds before a reload is not the one that gets lost —
 * which is exactly the change a user is most likely to be testing.
 */
export const flushWorkspaceWrite = () => {
  if (timer !== null) clearTimeout(timer);
  void write();
};

const schedule = (
  key: string,
  workspace: WorkspaceState,
  railPanel: Record<string, RailViewId | null>,
) => {
  pending = {
    id: key,
    // Copied field by field: `workspace` is the live Immer-produced state, and
    // the record is about to outlive the store it came from.
    panes: workspace.panes.map((pane) => ({
      ...pane,
      tabIds: [...pane.tabIds],
    })),
    focusedPaneId: workspace.focusedPaneId,
    splitRatio: workspace.splitRatio,
    scrollTops: { ...scrollTops },
    // A shallow copy is enough: the values are strings or null, so there is
    // nothing nested for a later reducer to mutate underneath the record.
    railPanel: { ...railPanel },
    updatedAt: new Date().toISOString(),
  };
  if (timer === null) timer = setTimeout(write, WRITE_DEBOUNCE_MS);
};

// ── Scroll positions ─────────────────────────────────────────────────────────

/**
 * Where each open document was last left.
 *
 * Module state rather than Redux, deliberately. A scroll listener fires per
 * frame, and routing that through the store would re-render every subscriber of
 * `ui.workspace` — the pane row, both headers, every tab — sixty times a second
 * for a fact no component renders. Nothing reads this during a render; the one
 * consumer is an effect that assigns `scrollTop`.
 *
 * It still shares the workspace's *record*, so it inherits the debounce and the
 * `visibilitychange` flush that already exist to survive a reload.
 */
let scrollTops: ScrollTops = {};

/**
 * The last layout worth attaching a scroll write to.
 *
 * A scroll changes no Redux state, so it cannot ride the middleware's own write
 * path — it has to schedule one itself, and a scheduled record has to carry a
 * layout. Held from the last non-empty workspace seen, which also means a
 * scroll landing in the beat after `closeAllPanes` records the layout the user
 * actually had rather than the empty one on the way out.
 */
let lastKey: string | null = null;
let lastWorkspace: WorkspaceState | null = null;
/** The panel map to attach to that same scroll-triggered write. */
let lastPanels: Record<string, RailViewId | null> = {};

/**
 * Seed the map from a record just read back.
 *
 * Called by `WorkspacePanes` with the same object it hands `restoreWorkspace`,
 * so the read stays single: the layout and the offsets come out of one record
 * on one trip, and the editor's first paint waits on neither a second one.
 */
export const primeScrollMemory = (stored: unknown) => {
  const record = stored as { scrollTops?: unknown } | undefined;
  scrollTops = sanitizeScrollTops(record?.scrollTops);
};

/** Where `docId` was last left, or `undefined` if it is not remembered. */
export const readScroll = (docId: string): number | undefined =>
  scrollTops[docId];

/**
 * Record where `docId` is now.
 *
 * Cheap to call per frame: {@link shouldRecord} drops the repeats and the
 * sub-threshold moves, and a scroll that survives that only mutates the map and
 * the already-scheduled record. Rebuilding the pane array is reserved for the
 * case where no write is pending yet.
 */
export const rememberScroll = (docId: string, top: number) => {
  if (!docId) return;
  const next = Math.max(0, Math.round(top));
  if (!shouldRecord(scrollTops[docId], next)) return;
  // Delete before setting so the key moves to the end: `capScrollTops` evicts
  // in insertion order, and that is only least-recently-used if a rewrite
  // counts as a use.
  delete scrollTops[docId];
  scrollTops[docId] = next;
  scrollTops = capScrollTops(scrollTops);

  if (pending) {
    pending.scrollTops = { ...scrollTops };
    return;
  }
  if (lastKey && lastWorkspace) schedule(lastKey, lastWorkspace, lastPanels);
};

// ── The middleware ───────────────────────────────────────────────────────────

/**
 * `loadSession` is the only action that can tell us who the user actually is.
 * Before it settles, `state.user` being undefined means "not asked yet" and not
 * "signed out" — writing the hint then would destroy it on every cold load.
 */
let sessionResolved = false;
/** The last workspace object written, by identity. Immer gives us that cheaply. */
let lastSeen: WorkspaceState | null = null;
/**
 * The last panel map written, by identity.
 *
 * Tracked separately from {@link lastSeen} because the two change
 * independently: switching the right panel to Revisions touches no pane, and a
 * write gated only on the workspace object would drop it.
 */
let lastSeenPanels: Record<string, RailViewId | null> | null = null;
/** The last key written to the hint, so the middleware is not a `localStorage` loop. */
let lastHint: string | null = null;

export const workspacePersistenceMiddleware: Middleware =
  (store) => (next) => (action) => {
    const result = next(action);

    const type = (action as { type?: unknown }).type;
    if (
      type === "app/loadSession/fulfilled" ||
      type === "app/loadSession/rejected"
    ) {
      sessionResolved = true;
    }

    // The store's own state type is not available here — `store/index.ts`
    // derives `RootState` from a store that this middleware is an argument to,
    // so naming it would be a cycle. `AppState` is that shape.
    const state = store.getState() as AppState;
    const { railPanel, workspace, workspaceKey } = state.ui;

    if (sessionResolved) {
      const key = workspaceKeyFor(state.user);
      if (lastHint !== key) {
        lastHint = key;
        rememberWorkspaceKeyHint(key);
      }
      if (workspaceKey !== null && workspaceKey !== key) {
        // Restored under the wrong user. Drop it and read again — and do not
        // fall through to the write below, or the layout that is on its way out
        // would be written under the key that just arrived.
        store.dispatch(appSlice.actions.workspaceKeyChanged(key));
        lastSeen = null;
        lastSeenPanels = null;
        return result;
      }
    }

    // Whether this session may record at all, and under which key — see
    // `workspaceWriteKey`, which holds the rules so they can be tested without
    // a browser. The one it refuses that is easy to miss: a session whose read
    // failed is perfectly usable, but the pane the deep-link seam mints for it
    // is not a layout, it is what is left when the real one could not be read.
    const writeKey = workspaceWriteKey(state.ui);
    if (writeKey !== null) {
      // Held even when the layout itself has not changed, because this is what
      // a scroll write attaches itself to and a scroll is not a store change.
      lastKey = writeKey;
      lastWorkspace = workspace;
      lastPanels = railPanel;
      if (workspace !== lastSeen || railPanel !== lastSeenPanels) {
        lastSeen = workspace;
        lastSeenPanels = railPanel;
        schedule(writeKey, workspace, railPanel);
      }
    } else if (
      state.ui.workspaceRestoreFailed || state.ui.workspaceProvisional
    ) {
      // A scroll is not a store change, so it schedules its own write against
      // the last layout seen — which outlives a navigation on purpose (see
      // `lastWorkspace`). It must not outlive a failed restore: that layout is
      // from before this session gave up reading, and scrolling would put it
      // back over the record through the one path the guard above does not sit
      // on. Nor a provisional one, and there the trap is sharper: reading the
      // document a deep link opened is exactly what scrolls, so the side door
      // would be walked through every time.
      lastKey = null;
      lastWorkspace = null;
      lastPanels = {};
    }

    return result;
  };
