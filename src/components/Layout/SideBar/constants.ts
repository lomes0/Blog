/**
 * Sidebar layout constants
 * Single source of truth for all sidebar-related dimensions
 */
import { MOTION } from "@/theme/tokens";

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

/** Minimum resting width — the sidebar snaps back up to this when released above the collapse threshold */
export const SIDEBAR_MIN_WIDTH = SIDEBAR_DEFAULT_WIDTH;

/** Lowest width the handle can be dragged to (below MIN, into the "collapse zone") for visual feedback */
export const SIDEBAR_DRAG_FLOOR = 44;

/** Releasing the resize handle below this width collapses the sidebar to hidden */
export const SIDEBAR_COLLAPSE_THRESHOLD = 90;

/** Maximum width when resizing */
export const SIDEBAR_MAX_WIDTH = 450;

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
/** Full/compact layer cross-fade duration (s) */
export const LAYER_FADE_DURATION = MOTION.base / 1000;

/**
 * Corner radius (MUI borderRadius units) shared by every selectable sidebar row
 * — post/document rows, series rows, and sub-tabs — so the "soft filled pill"
 * select treatment stays identical across all three. Single source of truth.
 */
export const SB_ITEM_RADIUS = 1.5;

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
