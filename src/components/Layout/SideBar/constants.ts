/**
 * Sidebar layout constants
 * Single source of truth for all sidebar-related dimensions
 */
import { MOTION } from "@/theme/tokens";
import { TREE_ROW_RADIUS } from "@/theme/treeRow";

/** Width when sidebar is collapsed (icons only) — legacy value kept for reference */
export const SIDEBAR_COLLAPSED_WIDTH = 72;

/**
 * Width of the far-left activity rail (icon strip that switches sidebar views).
 * The sidebar Drawer's fixed paper and its resize handle are offset by this so
 * the sidebar docks to the right of the rail rather than the viewport edge.
 */
export const ACTIVITY_RAIL_W = 54;

/**
 * Width of the compact (icon-strip) sidebar mode. Dragging the resize handle
 * shut lands here — a narrow collections rail — rather than fully hidden.
 */
export const COMPACT_WIDTH = 62;

/** LocalStorage key for persisting sidebar mode (full/compact/hidden) */
export const SIDEBAR_MODE_KEY = "ui.sidebarMode";

/** Default width when sidebar is expanded; also the minimum resizable width */
export const SIDEBAR_DEFAULT_WIDTH = 130;

/** Minimum resting width — the sidebar snaps back up to this when released in the full zone */
export const SIDEBAR_MIN_WIDTH = SIDEBAR_DEFAULT_WIDTH;

/** Maximum width when resizing */
export const SIDEBAR_MAX_WIDTH = 450;

/**
 * ── Drag detent geometry ───────────────────────────────────────────────────
 *
 * One drag crosses all three modes: full → compact → hidden. Rather than hard
 * thresholds, `COMPACT_WIDTH` is a *magnetic detent* — inside its radius the
 * panel is drawn toward 62px, so the width lags the cursor and you feel the
 * state rather than only seeing it.
 *
 *   raw cursor width:  450 ─────────── 130 ······· 62 ····· 44 ──── 0
 *                          FULL (1:1)   │  detent radius  │  HIDDEN (1:1)
 *                                       └── attraction ───┘
 *
 * The radius' upper edge is `SIDEBAR_MIN_WIDTH`, which makes the mapping
 * continuous there (attraction is 0 at the edge) *and* WYSIWYG: the full zone
 * begins exactly where a full panel is allowed to be narrowest, so a release in
 * it never snaps to a width you weren't already shown.
 */

/** Attraction radius below `SIDEBAR_MIN_WIDTH` where the compact detent pulls. */
export const SIDEBAR_DETENT_RADIUS = SIDEBAR_MIN_WIDTH - COMPACT_WIDTH;

/**
 * How hard the detent pulls at its centre (0 = none, 1 = fully pinned to 62px).
 * Below 1 so the panel still tracks the cursor a little inside the detent —
 * pinning it dead still reads as a broken drag rather than a sticky one.
 */
export const SIDEBAR_DETENT_STRENGTH = 0.85;

/**
 * Pull the cursor this far past `COMPACT_WIDTH` to break the detent loose into
 * hidden. Crossing it drops the attraction, so the width jumps ~11px to meet the
 * cursor: the "pop" that tells you the panel has let go.
 */
export const SIDEBAR_DETENT_PULL = 18;

/** Cursor width at which the detent breaks loose and the hidden zone begins. */
export const SIDEBAR_HIDE_BREAK = COMPACT_WIDTH - SIDEBAR_DETENT_PULL;

/**
 * Re-entry width for compact after breaking loose into hidden. Wider than
 * `SIDEBAR_HIDE_BREAK` on purpose: without this hysteresis gap, jitter at the
 * break point would flip the zone (and so the previewed content) every frame.
 */
export const SIDEBAR_HIDE_REENTRY = COMPACT_WIDTH;

/**
 * Hysteresis on the full/compact edge, for the same anti-flicker reason. Kept
 * narrow (8px): a release inside this band is still in the full zone, so it
 * springs up to `SIDEBAR_MIN_WIDTH`, and the band is how far that snap can be.
 */
export const SIDEBAR_FULL_EXIT = SIDEBAR_MIN_WIDTH - 8;

/** Width of the invisible strip that drags the panel back out when hidden. */
export const SIDEBAR_GRAB_STRIP_W = 6;

/**
 * Settle spring, in the usual `v += (k·Δx − c·v)·dt` form with unit mass. A
 * detent drag needs to feel *finished*, which a pure ease-out never quite does,
 * so this is deliberately under-damped.
 *
 * What matters is the damping ratio ζ = c / 2√k = 0.55, and ω = √k = 24.5 rad/s.
 * Together they give ~4px of overshoot and a ~283ms settle on the longest
 * landing the detent geometry can actually produce (a ~54px move: released at
 * the top of the compact zone, springing down to 62px). Overshoot scales with
 * distance, which is safe here only because that distance is bounded — the full
 * zone springs at most across its 8px hysteresis band, never from 450px.
 *
 * Retuning: hold ζ and change k to trade settle time for snap. Raising k alone
 * makes it faster *and* bouncier; c must follow by √ to keep the same feel.
 * `prefers-reduced-motion` skips the spring entirely and jumps to the target.
 */
export const SIDEBAR_SPRING_STIFFNESS = 600;
export const SIDEBAR_SPRING_DAMPING = 27;

/** Right padding for content area (space from right edge of viewport) */
export const CONTENT_RIGHT_PADDING = 75;

/** LocalStorage key for persisting user's preferred width */
export const SIDEBAR_STORAGE_KEY = "sidebar-width";

/**
 * Sidebar motion, derived from the app-wide tokens in `@/theme/tokens`.
 *
 * These were four hand-written constants until it turned out they restated
 * values the theme already had: `cubic-bezier(.4,0,.2,1)` is MUI's
 * `easing.easeInOut` and `.2s` is `duration.shorter`. They stay as named
 * sidebar constants because call sites want the whole composed transition
 * string, but the numbers come from one place now.
 *
 * `prefers-reduced-motion` no longer needs handling per call site — it is
 * enforced globally in `globals.css` (DESIGN.md §11).
 */
export const SIDEBAR_EASING = MOTION.easing;
/** Container width slide between open and hidden states */
export const SIDEBAR_WIDTH_TRANSITION =
  `width ${MOTION.layout}ms ${SIDEBAR_EASING}`;
/**
 * The rail/tree push. Sliding one track sideways by `COMPACT_WIDTH` swaps which
 * pane occupies the panel; nothing fades, so both panes stay fully opaque and
 * the swap reads as a filmstrip advancing.
 *
 * Deliberately `MOTION.base` (200ms) and not `MOTION.layout` (340ms): the panes
 * travel 62px while the panel itself travels up to ~54px on its spring, and a
 * push that outlasts the width move it belongs to reads as two separate events.
 */
export const SIDEBAR_LAYER_TRANSITION =
  `transform ${MOTION.base}ms ${SIDEBAR_EASING}`;
/**
 * The drag edge's slide, for programmatic mode changes only (rail click, Cmd+\).
 * Matches `SIDEBAR_WIDTH_TRANSITION` so the handle and the panel it belongs to
 * arrive together; a drag release is driven by the rAF spring instead and turns
 * every transition here off.
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
 * The Explorer accent moved to `palette.accent` in
 * `components/Layout/ThemeProvider.tsx`. It was a palette, so it belongs in the
 * palette: reach it as `sx={{ color: "accent.main" }}` — scheme-aware, and
 * available to any surface rather than only to files willing to import from a
 * component folder. The dark scheme has real values now, so the
 * `theme.applyStyles("light", …)` wrapper each call site used to need is gone.
 */
