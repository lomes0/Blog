/**
 * Sidebar layout constants
 * Single source of truth for all sidebar-related dimensions
 */
import { MOTION } from "@/theme/tokens";
import { TREE_ROW_RADIUS } from "@/theme/treeRow";

/**
 * Width of the far-left activity rail (icon strip that switches sidebar views).
 * The sidebar Drawer's fixed paper and its resize handle are offset by this so
 * the sidebar docks to the right of the rail rather than the viewport edge.
 */
export const ACTIVITY_RAIL_W = 54;

/** LocalStorage key for persisting sidebar mode (full/compact/hidden) */
export const SIDEBAR_MODE_KEY = "ui.sidebarMode";

/** LocalStorage key for persisting the user's preferred *open* width. */
export const SIDEBAR_STORAGE_KEY = "sidebar-width";

/**
 * ── Drag geometry ──────────────────────────────────────────────────────────
 *
 * The thresholds, the hysteresis and the pointer → width mapping all live in
 * `./dragGeometry`, which has no imports: it is the part of the interaction that
 * is decidable without a browser, and keeping it free of React and MUI is what
 * lets it be read and exercised on its own. What stays here is everything the
 * gesture needs a *layout* answer for.
 *
 * Neither end of the open range is a constant anywhere — see
 * `hooks/useSidebarBounds`, which measures the minimum off the nav labels and
 * takes the maximum off the viewport. Hardcoding either would put a number in
 * this file that only content can answer.
 */

/** Open width used before anything is stored; clamped to the measured bounds. */
export const SIDEBAR_DEFAULT_OPEN_WIDTH = 240;

/** Share of the viewport the open panel may occupy at most. */
export const SIDEBAR_MAX_FRACTION = 0.45;

/**
 * Pre-measurement bounds. Used for the first render (server and client both, so
 * there is no hydration mismatch) and as the answer if measurement is
 * impossible — an environment with no canvas, not a browser we ship to.
 */
export const SIDEBAR_MIN_OPEN_FALLBACK = 180;
export const SIDEBAR_MAX_OPEN_FALLBACK = 450;

/** Width of the invisible strip that drags the panel back out when hidden. */
export const SIDEBAR_GRAB_STRIP_W = 6;

/** Id on the sidebar's Drawer paper, for the handle's `aria-controls`. */
export const SIDEBAR_PANEL_ID = "app-sidebar";

/**
 * Sidebar motion, derived from the app-wide tokens in `@/theme/tokens`.
 *
 * These were four hand-written constants until it turned out they restated
 * values the theme already had: `cubic-bezier(.4,0,.2,1)` is MUI's
 * `easing.easeInOut` and `.2s` is `duration.shorter`. They stay as named
 * sidebar constants because call sites want the whole composed transition
 * string, but the numbers come from one place now.
 *
 * These cover *programmatic* mode changes only — rail click, Cmd+\, keyboard,
 * double-click. A drag never uses them: it sets the width per frame, and the two
 * moments it eases use `SIDEBAR_COLLAPSE_*` above.
 *
 * `prefers-reduced-motion` no longer needs handling per call site — it is
 * enforced globally in `globals.css` (DESIGN.md §11).
 */
const SIDEBAR_EASING = MOTION.easing;
/** Container width slide between open and hidden states */
export const SIDEBAR_WIDTH_TRANSITION =
  `width ${MOTION.layout}ms ${SIDEBAR_EASING}`;
/**
 * The rail/tree push. Sliding one track sideways by `COMPACT_WIDTH` swaps which
 * pane occupies the panel; nothing fades, so both panes stay fully opaque and
 * the swap reads as a filmstrip advancing.
 *
 * Deliberately `MOTION.base` (200ms) and not `MOTION.layout` (340ms): the panes
 * travel `COMPACT_WIDTH` while the panel itself is being dragged, and a push
 * that outlasts the width move it belongs to reads as two separate events.
 */
export const SIDEBAR_LAYER_TRANSITION =
  `transform ${MOTION.base}ms ${SIDEBAR_EASING}`;
/**
 * The drag edge's slide, for programmatic mode changes only. Matches
 * `SIDEBAR_WIDTH_TRANSITION` so the handle and the panel it belongs to arrive
 * together; during a drag the handle is positioned per frame with no transition
 * at all.
 */
export const SIDEBAR_EDGE_TRANSITION = [
  `left ${MOTION.layout}ms ${SIDEBAR_EASING}`,
  `width ${MOTION.layout}ms ${SIDEBAR_EASING}`,
  `background-color ${MOTION.fast}ms ${SIDEBAR_EASING}`,
  `opacity ${MOTION.fast}ms ${SIDEBAR_EASING}`,
].join(", ");

/**
 * Corner radius shared by every selectable sidebar row — post/document rows,
 * series rows, and sub-tabs — so the "soft filled pill" select treatment stays
 * identical across all three.
 *
 * Re-exported from `@/theme/treeRow`: the value is DESIGN.md §17.4's radius for
 * *any* tree row, not a sidebar preference, and the /posts rows were carrying
 * their own (`0.5`, `1`) precisely because it was only written down here. Kept
 * as an alias so the sidebar's own call sites read in sidebar vocabulary.
 */
export const SB_ITEM_RADIUS = TREE_ROW_RADIUS;

/**
 * Monospace stack for IDE file-system cues (`.md` filenames, folder paths,
 * palette shortcuts, front-matter). Leads with **Cascadia** — already bundled
 * for editor code blocks (`@font-face` in globals.css) — then the platform
 * stack as fallback. See DESIGN.md §17.2. Reserved for file cues, never prose.
 */
export const MONO_FONT =
  '"Cascadia", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/**
 * Sidebar relative-scale ladder (DESIGN.md §17.2 carve-out). The sidebar has a
 * user-adjustable base font size (`useSidebarFontSize`, Settings +/-), set as
 * `px` on the drawer paper; children size in **em** so they track the user's
 * scale. This is the single source of truth for those ratios — do not inline
 * `em`/`px`/`rem` font sizes in sidebar rows. Fixed theme variants (dense/micro)
 * would break user resize, so the sidebar is exempt from the fixed-variant rule.
 *
 * `useSidebarBounds` measures the minimum open width off these, via
 * `SB_FONT_SCALE` below, so a change here moves the drag geometry with it.
 */
export const SB_FONT = {
  /** counts, badges, sub-tab labels, dirty/meta text */
  meta: "0.72em",
  /** filenames, series names, nav/footer labels, search results */
  body: "0.9em",
  /** sidebar wordmark / emphasis */
  emphasis: "1.2em",
} as const;

/**
 * The same ladder as multipliers.
 *
 * `SB_FONT` is authored as `em` strings because that is what an `sx` call site
 * wants, but the minimum-open-width measurement needs a number to multiply the
 * user's base size by. Kept beside its source rather than re-parsed at the
 * measurement site: a `parseFloat` there would be a second place the ladder is
 * encoded, and silently wrong the day a value grows a unit.
 */
export const SB_FONT_SCALE = {
  meta: 0.72,
  body: 0.9,
  emphasis: 1.2,
} as const;

/**
 * The Explorer accent moved to `palette.accent` in
 * `components/Layout/ThemeProvider.tsx`. It was a palette, so it belongs in the
 * palette: reach it as `sx={{ color: "accent.main" }}` — scheme-aware, and
 * available to any surface rather than only to files willing to import from a
 * component folder. The dark scheme has real values now, so the
 * `theme.applyStyles("light", …)` wrapper each call site used to need is gone.
 */
