/**
 * The right panel's state.
 *
 * The panel used to render every section at once as a stack of collapsible
 * cards, and the rail could only toggle the whole thing. Now the rail is a view
 * switcher and the panel shows the one view you picked.
 *
 * Import-free on purpose, for the same reason `SideBar/dragGeometry.ts` and
 * `lib/workspaceRestore.ts` are: this is the part with rules in it, and it
 * should be exercisable without mounting anything. The storage half rides in
 * the workspace record (`store/workspacePersistence.ts`), which is why
 * {@link sanitizePanelView} lives here too.
 *
 * **The panel's open state is derived, never stored.** It is open iff a view is
 * showing — see {@link isPanelOpen}. There is deliberately no `isOpen` boolean,
 * because one admits an "open but empty" panel: a column of chrome with nothing
 * in it, reachable by closing the view without closing the panel, and
 * impossible to explain.
 */

import type { RailViewId } from "@/types";

/**
 * The shape is declared in `@/types` next to `WorkspaceState`, because the
 * persistence layer has to name it and that file is a leaf. It is re-exported
 * under a shorter name here, where the rules live and where every consumer
 * already imports from.
 */
export type ViewId = RailViewId;

/** What the panel is showing, or `null` when it is closed. */
export type PanelView = ViewId | null;

/**
 * Rail order, which is also the `Cmd/Ctrl+1..4` order.
 *
 * Agent changes leads because it is the only view that speaks about documents
 * other than the open one, so it is the one whose badge is worth reaching
 * first.
 */
export const VIEW_IDS: readonly ViewId[] = [
  "agent-changes",
  "outline",
  "properties",
  "revisions",
] as const;

/** The view a document with no stored panel state opens on. */
export const DEFAULT_VIEW: ViewId = "outline";

/**
 * Whether the panel is showing at all.
 *
 * The whole of the open/closed question. `AppLayoutContent` sizes the grid
 * column from this and `RightRail` mounts the panel from it; neither stores an
 * answer of its own.
 */
export const isPanelOpen = (view: PanelView): boolean => view !== null;

/**
 * A rail click.
 *
 * Clicking the view already showing closes the panel; clicking any other
 * replaces it. That is the whole interaction — a repeat click is the only thing
 * a second click can mean that the first did not already say, and making it a
 * toggle is what gives the rail a way to close the panel at all.
 */
export const selectView = (current: PanelView, view: ViewId): PanelView =>
  current === view ? null : view;

// ── Untrusted input ──────────────────────────────────────────────────────────

const isViewId = (value: unknown): value is ViewId =>
  typeof value === "string" && (VIEW_IDS as readonly string[]).includes(value);

/**
 * A stored view, made safe to install.
 *
 * The record was written by some build of this app at some time — the same
 * argument `sanitizeWorkspace` makes, and the failure here is the same kind of
 * quiet: a `ViewId` this build no longer has would leave the panel open,
 * rendering nothing, with no way to tell why.
 *
 * `null` survives, because a closed panel is a choice the user made. Anything
 * unrecognised becomes the default instead — a value we cannot read is not
 * evidence that they wanted the panel shut.
 */
export const sanitizePanelView = (raw: unknown): PanelView => {
  if (raw === null) return null;
  return isViewId(raw) ? raw : DEFAULT_VIEW;
};

/** Every stored document's view, sanitized. */
export const sanitizePanelViews = (raw: unknown): Record<string, PanelView> => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, PanelView> = {};
  for (const [docId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!docId) continue;
    // An entry that is neither null nor a string was never one of ours. Dropped
    // rather than defaulted: absent means "never touched", which is the honest
    // reading, where a default would look like a choice somebody made.
    if (value !== null && typeof value !== "string") continue;
    out[docId] = sanitizePanelView(value);
  }
  return capPanelViews(out);
};

/**
 * How many documents' panel choices to remember.
 *
 * Same bound and same reason as `scrollMemory`'s: the map rides in a record
 * written on every change, so a profile that opens a hundred documents a week
 * must not carry all of them forever. Insertion order is the eviction order,
 * which is least-recently-used only because {@link rememberPanel} deletes a key
 * before re-adding it.
 */
export const MAX_REMEMBERED_PANELS = 50;

export const capPanelViews = (
  panels: Record<string, PanelView>,
): Record<string, PanelView> => {
  const ids = Object.keys(panels);
  if (ids.length <= MAX_REMEMBERED_PANELS) return panels;
  const out: Record<string, PanelView> = {};
  for (const id of ids.slice(ids.length - MAX_REMEMBERED_PANELS)) {
    out[id] = panels[id];
  }
  return out;
};

/**
 * Record a document's view, evicting the oldest if the map is full.
 *
 * The delete-before-set is what makes the cap least-recently-used rather than
 * first-in-first-out — a rewrite has to count as a use, or the document you
 * work in every day is evicted on its fiftieth neighbour.
 */
export const rememberPanel = (
  panels: Record<string, PanelView>,
  docId: string,
  view: PanelView,
): Record<string, PanelView> => {
  const next = { ...panels };
  delete next[docId];
  next[docId] = view;
  return capPanelViews(next);
};

/**
 * The key a panel is remembered under while nothing is open.
 *
 * The panel is not useless with an empty workspace: `agent-changes` is global
 * and still has something to say, and it is the only view the rail could show
 * there. That state needs somewhere to live and it cannot be a document id.
 * The leading space keeps it out of the id space — a document really called
 * "no-document" must not inherit someone else's layout.
 */
export const NO_DOCUMENT_KEY = " no-document";
