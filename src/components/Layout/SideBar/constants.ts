/**
 * Sidebar layout constants
 * Single source of truth for all sidebar-related dimensions
 */

/** Width when sidebar is collapsed (icons only) — legacy value kept for reference */
export const SIDEBAR_COLLAPSED_WIDTH = 72;

/**
 * Width of the far-left activity rail (icon strip that switches sidebar views).
 * The sidebar Drawer's fixed paper and its resize handle are offset by this so
 * the sidebar docks to the right of the rail rather than the viewport edge.
 */
export const ACTIVITY_RAIL_W = 54;

/** Width of the new compact (icon-strip) sidebar mode */
export const COMPACT_WIDTH = 62;

/** LocalStorage key for persisting sidebar mode */
export const SIDEBAR_MODE_KEY = "ui.sidebarMode";

/** Default width when sidebar is expanded; also the minimum resizable width */
export const SIDEBAR_DEFAULT_WIDTH = 130;

/** Minimum width when resizing — equal to the default so the user cannot shrink below it */
export const SIDEBAR_MIN_WIDTH = SIDEBAR_DEFAULT_WIDTH;

/** Maximum width when resizing */
export const SIDEBAR_MAX_WIDTH = 450;

/** Right padding for content area (space from right edge of viewport) */
export const CONTENT_RIGHT_PADDING = 75;

/** LocalStorage key for persisting user's preferred width */
export const SIDEBAR_STORAGE_KEY = "sidebar-width";

/**
 * Motion tokens from the sidebar design handoff. Durations/easings are shared
 * across header, tree chevrons, and the collapse transition so the whole nav
 * animates in concert. `prefers-reduced-motion` callers should swap these for
 * `none`.
 */
export const SIDEBAR_EASING = "cubic-bezier(.4,0,.2,1)";
/** Container width slide between open and rail states */
export const SIDEBAR_WIDTH_TRANSITION = `width .34s ${SIDEBAR_EASING}`;
/** Open/rail layer cross-fade duration (s) */
export const LAYER_FADE_DURATION = 0.2;
/** Folder chevron rotate (0deg -> 90deg) on expand/collapse */
export const CHEVRON_TRANSITION = `transform .22s ${SIDEBAR_EASING}`;

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
