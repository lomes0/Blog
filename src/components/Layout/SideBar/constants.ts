/**
 * Sidebar layout constants
 * Single source of truth for all sidebar-related dimensions
 */

/** Width when sidebar is collapsed (icons only) — legacy value kept for reference */
export const SIDEBAR_COLLAPSED_WIDTH = 72;

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
