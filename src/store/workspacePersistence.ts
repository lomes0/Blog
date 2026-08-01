import type { Middleware } from "@reduxjs/toolkit";
import { getStore } from "@/indexeddb";
import { workspaceKeyFor } from "@/lib/workspaceRestore";
import type { AppState, WorkspaceState } from "@/types";
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
 */

/** Long enough to swallow a resize drag; short enough to beat a reload. */
const WRITE_DEBOUNCE_MS = 400;

/** One record per user, keyed by the id the layout belongs to. */
interface StoredWorkspace extends WorkspaceState {
  /** A user id, or `"guest"`. */
  id: string;
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

/**
 * The stored layout for a user, `undefined` when there is none.
 *
 * Typed `unknown` on the way out, and that is the point: what comes back was
 * written by some build of this app at some time, and the only way to turn it
 * into a `WorkspaceState` is `sanitizeWorkspace`, which does not trust it.
 * Handing the caller a `StoredWorkspace` here would be the same compile-time
 * fiction `parseBody` exists to refuse for request bodies.
 */
export const readStoredWorkspace = async (
  key: string,
): Promise<unknown> => {
  try {
    return await Promise.race([
      workspaceDB.getByID(key),
      new Promise<undefined>((resolve) =>
        setTimeout(() => resolve(undefined), READ_TIMEOUT_MS)
      ),
    ]);
  } catch (error) {
    console.warn("could not read the stored workspace", error);
    return undefined;
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

const schedule = (key: string, workspace: WorkspaceState) => {
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
    updatedAt: new Date().toISOString(),
  };
  if (timer === null) timer = setTimeout(write, WRITE_DEBOUNCE_MS);
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
    const { workspace, workspaceHydrated, workspaceKey } = state.ui;

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
        return result;
      }
    }

    if (
      workspaceHydrated && workspaceKey !== null &&
      workspace !== lastSeen && workspace.panes.length > 0
    ) {
      lastSeen = workspace;
      schedule(workspaceKey, workspace);
    }

    return result;
  };
