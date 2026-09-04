/**
 * The right panel's slot model.
 *
 * The panel used to render every section at once as a stack of collapsible
 * cards, and the rail could only toggle the whole thing. Now the rail is a view
 * switcher and the panel is one or two slots that views are assigned to.
 *
 * Import-free on purpose, for the same reason `SideBar/dragGeometry.ts` and
 * `lib/workspaceRestore.ts` are: this is the part with rules in it, and it
 * should be exercisable without mounting anything. The React half is
 * `PanelSlots.tsx`; the storage half rides in the workspace record
 * (`store/workspacePersistence.ts`), which is why {@link sanitizePanelState}
 * lives here too.
 *
 * **The panel's open state is derived, never stored.** It is open iff it has at
 * least one slot filled — see {@link isPanelOpen}. There is deliberately no
 * `isOpen` boolean, because one admits an "open but empty" panel: a column of
 * chrome with nothing in it, reachable by closing a view without closing the
 * panel, and impossible to explain.
 */

import type {
  RailPanelState,
  RailSlotIndex,
  RailSlots,
  RailViewId,
} from "@/types";

/**
 * The shapes are declared in `@/types` next to `WorkspaceState`, because the
 * persistence layer has to name them and that file is a leaf. They are
 * re-exported under shorter names here, where the rules that move between them
 * live and where every consumer already imports from.
 */
export type ViewId = RailViewId;
export type SlotIndex = RailSlotIndex;
export type Slots = RailSlots;
export type PanelState = RailPanelState;

/**
 * Rail order, which is also the `Cmd/Ctrl+1..5` order.
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
  "backlinks",
] as const;

/** The view a document with no stored panel state opens on. */
export const DEFAULT_VIEW: ViewId = "outline";

export const MIN_RATIO = 0.2;
export const MAX_RATIO = 0.8;
export const DEFAULT_RATIO = 0.5;

/** A ratio the divider can actually reach. */
export const clampRatio = (ratio: number): number =>
  Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));

/** The closed panel. */
export const emptyPanel = (): PanelState => ({
  slots: [],
  focused: 0,
  ratio: DEFAULT_RATIO,
  ratioExplicit: false,
});

/** What a document with nothing stored opens on. */
export const defaultPanel = (): PanelState => ({
  ...emptyPanel(),
  slots: [DEFAULT_VIEW],
});

/**
 * Whether the panel is showing at all.
 *
 * The whole of the open/closed question. `AppLayoutContent` sizes the grid
 * column from this and `RightRail` mounts the panel from it; neither stores an
 * answer of its own.
 */
export const isPanelOpen = (state: PanelState): boolean =>
  state.slots.length > 0;

/** Whether the panel is showing two slots — the split. */
export const isSplit = (state: PanelState): boolean => state.slots.length === 2;

/** The view in a slot, or `null` for the placeholder / a slot that isn't there. */
export const viewAt = (state: PanelState, index: SlotIndex): ViewId | null =>
  state.slots[index] ?? null;

/** Which slot a view is in, or `null` if it is not on screen. */
export const slotOf = (state: PanelState, view: ViewId): SlotIndex | null => {
  if (state.slots[0] === view) return 0;
  if (state.slots[1] === view) return 1;
  return null;
};

/**
 * `focused` made consistent with `slots`.
 *
 * The two fields can disagree — a stored record can say `focused: 1` with one
 * slot, and so can any transition that shrinks the slots without thinking about
 * it. Every constructor below goes through here rather than each remembering,
 * because a focused slot that does not exist means the next rail click writes
 * into nothing.
 */
const normalize = (state: PanelState): PanelState => {
  const focused: SlotIndex = state.focused === 1 && state.slots.length === 2
    ? 1
    : 0;
  return focused === state.focused ? state : { ...state, focused };
};

/**
 * A rail click.
 *
 * Three outcomes, and which one you get depends only on where the view already
 * is:
 *
 * - **Not on screen** → it replaces whatever is in the focused slot. With the
 *   panel closed that means opening as a single slot.
 * - **In another slot** → focus moves there. Nothing is replaced; the click was
 *   about attention, not content.
 * - **In the focused slot** → it closes. This is the only way a repeat click
 *   can mean anything, and it is what makes the rail a toggle for the thing you
 *   are already looking at.
 */
export const selectView = (state: PanelState, view: ViewId): PanelState => {
  if (state.slots.length === 0) {
    return { ...state, slots: [view], focused: 0 };
  }

  const existing = slotOf(state, view);
  if (existing !== null) {
    return existing === state.focused
      ? closeSlot(state, existing)
      : normalize({ ...state, focused: existing });
  }

  const slots: Slots = state.focused === 1 && state.slots.length === 2
    ? [state.slots[0], view]
    : state.slots.length === 2
    ? [view, state.slots[1]]
    : [view];
  return normalize({ ...state, slots });
};

/**
 * A modifier-click (Cmd/Ctrl) on a rail icon — open in the *other* slot.
 *
 * The explicit way into a split, and the reason the panel never splits by
 * itself: a layout that rearranges on an ordinary click is a layout the user
 * has to watch rather than use.
 *
 * A view already on screen is focused rather than moved. Placing it in the
 * other slot as well would render it twice, which is never what the click
 * meant, and there is no third state for it to go to.
 */
export const selectViewInOtherSlot = (
  state: PanelState,
  view: ViewId,
): PanelState => {
  const existing = slotOf(state, view);
  if (existing !== null) return normalize({ ...state, focused: existing });

  if (state.slots.length === 0) {
    return { ...state, slots: [view], focused: 0 };
  }
  if (state.slots.length === 1) {
    return { ...state, slots: [state.slots[0], view], focused: 1 };
  }

  const other: SlotIndex = state.focused === 0 ? 1 : 0;
  const slots: Slots = other === 1
    ? [state.slots[0], view]
    : [view, state.slots[1]];
  return normalize({ ...state, slots, focused: other });
};

/**
 * The split control in a slot header, and `Cmd/Ctrl+\`.
 *
 * Splitting opens an empty second slot and focuses it, so the next rail click
 * lands there. Un-splitting keeps the focused view — the one being looked at —
 * and drops the other.
 *
 * On a closed panel this opens the default view *without* splitting. A panel
 * that arrives already split, showing one placeholder and one view nobody
 * asked for, is a worse first frame than the ordinary single slot, and a second
 * press gets you the split anyway.
 */
export const toggleSplit = (state: PanelState): PanelState => {
  if (state.slots.length === 0) return defaultPanel();
  if (state.slots.length === 1) {
    return { ...state, slots: [state.slots[0], null], focused: 1 };
  }

  const survivor = viewAt(state, state.focused) ??
    viewAt(state, state.focused === 0 ? 1 : 0);
  // Both slots empty is unrepresentable — slot 0 is always a real view — but
  // the type does not know that, and closing to a panel with no views is the
  // one outcome that must not silently become an open, empty panel.
  if (!survivor) return emptyPanel();
  return { ...state, slots: [survivor], focused: 0 };
};

/**
 * Close one slot.
 *
 * In split mode the survivor takes the full height and becomes slot 0 —
 * including when the closed slot was the placeholder, which is how a split the
 * user changed their mind about is undone. Closing the last view collapses the
 * panel; the rail stays.
 *
 * `ratio` survives a close, so re-splitting returns to the divider position the
 * user last chose rather than to even.
 */
export const closeSlot = (state: PanelState, index: SlotIndex): PanelState => {
  if (state.slots.length === 0) return state;
  if (state.slots.length === 1) {
    return { ...state, slots: [], focused: 0 };
  }

  const survivor = viewAt(state, index === 0 ? 1 : 0);
  if (!survivor) return { ...state, slots: [], focused: 0 };
  return { ...state, slots: [survivor], focused: 0 };
};

/** Close whichever slot has focus — what `Escape` in the panel does. */
export const closeFocusedSlot = (state: PanelState): PanelState =>
  closeSlot(state, state.focused);

/** Move focus, ignoring a slot that isn't there. */
export const focusSlot = (state: PanelState, index: SlotIndex): PanelState =>
  normalize({ ...state, focused: index });

/** A divider drag. The result is the user's, and outranks `preferredHeight`. */
export const setRatio = (state: PanelState, ratio: number): PanelState => ({
  ...state,
  ratio: clampRatio(ratio),
  ratioExplicit: true,
});

/**
 * Double-click on the divider.
 *
 * Resets to even *and* drops `ratioExplicit`, so the sizing rule goes back to
 * honouring `preferredHeight`. Resetting the number alone would leave a
 * `content` view stretched to half the panel with no way back short of
 * reopening it.
 */
export const resetRatio = (state: PanelState): PanelState => ({
  ...state,
  ratio: DEFAULT_RATIO,
  ratioExplicit: false,
});

// ── Sizing ───────────────────────────────────────────────────────────────────

/**
 * How much height a view wants.
 *
 * `content` views are short and fixed — a property list is as tall as its
 * properties and stretching it to half the panel is empty space with a border
 * round it. `grow` views are lists that keep going, and are the ones worth
 * giving the remainder to.
 */
export type PreferredHeight = "content" | "grow";

/**
 * How the two slots divide the panel.
 *
 * - `ratio` — both want to grow, or the user has dragged the divider. The
 *   divider position is `state.ratio`.
 * - `content-top` / `content-bottom` — one `content` view beside a `grow` one.
 *   The named slot sizes to its content (capped, so a long property list cannot
 *   swallow the panel) and the other takes what is left.
 *
 * Returned as a decision rather than as pixels because the content measurement
 * is the browser's, and this module does not have one.
 */
type SizingMode = "ratio" | "content-top" | "content-bottom";

/** How tall a `content` slot may get before it is just the other half. */
export const CONTENT_SLOT_MAX_SHARE = 0.5;

export const sizingMode = (
  state: PanelState,
  preferred: (view: ViewId) => PreferredHeight,
): SizingMode => {
  if (state.ratioExplicit) return "ratio";
  const top = state.slots[0];
  const bottom = state.slots[1];
  // The placeholder has no appetite of its own; an even split is the honest
  // rendering of "something goes here".
  if (!top || !bottom) return "ratio";

  const topWants = preferred(top);
  const bottomWants = preferred(bottom);
  if (topWants === bottomWants) return "ratio";
  return topWants === "content" ? "content-top" : "content-bottom";
};

// ── Untrusted input ──────────────────────────────────────────────────────────

const isViewId = (value: unknown): value is ViewId =>
  typeof value === "string" && (VIEW_IDS as readonly string[]).includes(value);

/**
 * A stored panel state, made safe to install.
 *
 * The record was written by some build of this app at some time — the same
 * argument `sanitizeWorkspace` makes, and the failures here are the same kind
 * of quiet: a `ViewId` this build no longer has renders nothing, a `focused`
 * that names a missing slot sends the next rail click into the void, and a
 * `NaN` ratio becomes a `flex-grow` of `NaN`.
 *
 * A record whose first slot is missing or unknown is discarded whole rather
 * than compacted. Sliding the second view up would be inventing a layout: the
 * user chose which view was on top, and half of that choice surviving is worse
 * than the default.
 */
export const sanitizePanelState = (raw: unknown): PanelState => {
  if (typeof raw !== "object" || raw === null) return defaultPanel();
  const record = raw as Record<string, unknown>;

  const stored = Array.isArray(record.slots) ? record.slots : [];
  const top = stored[0];
  if (!isViewId(top)) return defaultPanel();

  const rawBottom = stored[1];
  // `null` is the placeholder and is kept; anything else unrecognised means
  // there is no second slot at all.
  const hasBottom = stored.length > 1 &&
    (rawBottom === null || isViewId(rawBottom));
  // One document in two slots would render the same view twice and give the
  // rail two icons to mark active for one click.
  const bottom = hasBottom && rawBottom !== top
    ? (rawBottom as ViewId | null)
    : undefined;

  const slots: Slots = bottom !== undefined ? [top, bottom] : [top];

  const storedRatio = record.ratio;
  const ratio = typeof storedRatio === "number" && Number.isFinite(storedRatio)
    ? clampRatio(storedRatio)
    : DEFAULT_RATIO;

  return normalize({
    slots,
    focused: record.focused === 1 ? 1 : 0,
    ratio,
    ratioExplicit: record.ratioExplicit === true,
  });
};

/** Every stored document's panel, sanitized. Unusable entries are dropped. */
export const sanitizePanelStates = (
  raw: unknown,
): Record<string, PanelState> => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, PanelState> = {};
  for (const [docId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!docId) continue;
    if (typeof value !== "object" || value === null) continue;
    out[docId] = sanitizePanelState(value);
  }
  return capPanelStates(out);
};

/**
 * How many documents' panel layouts to remember.
 *
 * Same bound and same reason as `scrollMemory`'s: the map rides in a record
 * written on every layout change, so a profile that opens a hundred documents a
 * week must not carry all of them forever. Insertion order is the eviction
 * order, which is least-recently-used only because {@link rememberPanel}
 * deletes a key before re-adding it.
 */
export const MAX_REMEMBERED_PANELS = 50;

export const capPanelStates = (
  panels: Record<string, PanelState>,
): Record<string, PanelState> => {
  const ids = Object.keys(panels);
  if (ids.length <= MAX_REMEMBERED_PANELS) return panels;
  const out: Record<string, PanelState> = {};
  for (const id of ids.slice(ids.length - MAX_REMEMBERED_PANELS)) {
    out[id] = panels[id];
  }
  return out;
};

/**
 * Record a document's panel, evicting the oldest if the map is full.
 *
 * The delete-before-set is what makes the cap least-recently-used rather than
 * first-in-first-out — a rewrite has to count as a use, or the document you
 * work in every day is evicted on its fiftieth neighbour.
 */
export const rememberPanel = (
  panels: Record<string, PanelState>,
  docId: string,
  state: PanelState,
): Record<string, PanelState> => {
  const next = { ...panels };
  delete next[docId];
  next[docId] = state;
  return capPanelStates(next);
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
