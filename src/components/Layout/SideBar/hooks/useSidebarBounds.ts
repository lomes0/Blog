"use client";
import { useEffect, useState } from "react";
import {
  SB_FONT_SCALE,
  SIDEBAR_MAX_FRACTION,
  SIDEBAR_MAX_OPEN_FALLBACK,
  SIDEBAR_MIN_OPEN_FALLBACK,
} from "../constants";
import {
  COMPACT_WIDTH,
  DEAD_BAND,
  SNAP_HIDE_BELOW,
  SNAP_HYSTERESIS,
} from "../dragGeometry";

/**
 * Floor on the measured minimum, so the drag ranges can never overlap.
 *
 * The dead band hangs `DEAD_BAND` px below the minimum, and its floor has to
 * clear two things below it: the compact detent's own width (or the panel would
 * be told to stall at a width narrower than the mode it is stalling above), and
 * the hidden edge's hysteresis (or reopening from hidden would land straight in
 * the dead band with no compact zone to stop in).
 *
 * This binds only at the small end of the font scale — at 10px the nav labels
 * genuinely fit in ~110px. Everywhere else the measurement is larger and wins,
 * which is the intent: content decides the minimum, and this only decides how
 * small an answer the geometry can survive.
 */
const MIN_OPEN_FLOOR = DEAD_BAND +
  Math.max(COMPACT_WIDTH, SNAP_HIDE_BELOW + SNAP_HYSTERESIS);

/**
 * The two ends of the open range, both derived rather than declared.
 *
 * `min` is the point where the sidebar's own nav labels stop truncating. It is
 * the number the drag geometry is built on — the dead band sits directly below
 * it and the free range starts at it — and it is the one number in that geometry
 * that a constant cannot answer: the sidebar's base font size is a user setting
 * (Settings +/-, 10–24px), so "wide enough to read the labels" is 40% wider at
 * the top of that range than at the bottom. A hardcoded minimum is either too
 * narrow for large text or wasteful for small.
 *
 * `max` is a share of the viewport, for the ordinary reason: a panel may not eat
 * the document.
 */
interface SidebarBounds {
  min: number;
  max: number;
}

/**
 * A label the panel must be wide enough to show whole, and the chrome that
 * shares its row.
 *
 * Only *nav* labels are listed. Post and series titles are user content and are
 * expected to ellipsize — sizing the panel to fit them would let one long
 * filename set the minimum width for everyone. What must stay legible is the
 * furniture: the section headers that name the tree's regions, and the workspace
 * chip above them.
 */
interface NavLabel {
  text: string;
  /** Multiplier on the sidebar base size — a `SB_FONT_SCALE` entry. */
  scale: number;
  weight: number;
  /** `letter-spacing` in em, as authored on the element. */
  trackingEm: number;
  uppercase: boolean;
  /** Everything on the row that is not the label: padding, icons, gaps. */
  chrome: number;
}

/**
 * Chrome measured off the components themselves, not guessed:
 *
 * - `SidebarSectionHeader`: `px: 2` (32) + actions `ml: 1` (8) + one `IconButton`
 *   at `p: 0.25` around an `ICON_SIZE.inline` glyph (24).
 * - `WorkspaceSwitcher`: the row's `px: 2` (32, unchanged by the switcher's
 *   `mx: -1` + `px: 1`, which cancel) + 22px initial chip + two 8px gaps + a
 *   16px chevron.
 *
 * These are structural, so they are constants here rather than measured: they
 * are fixed px in those files and do not scale with the font setting.
 */
const SECTION_HEADER_CHROME = 64;
const WORKSPACE_CHROME = 86;

const NAV_LABELS: NavLabel[] = [
  // Tree section headers — uppercased and tracked by the component, so they
  // measure meaningfully wider than the string suggests.
  {
    text: "Projects",
    scale: SB_FONT_SCALE.meta,
    weight: 600,
    trackingEm: 0.08,
    uppercase: true,
    chrome: SECTION_HEADER_CHROME,
  },
  {
    text: "Notes",
    scale: SB_FONT_SCALE.meta,
    weight: 600,
    trackingEm: 0.08,
    uppercase: true,
    chrome: SECTION_HEADER_CHROME,
  },
  // The search view's own title header, same overline treatment.
  {
    text: "Explorer",
    scale: SB_FONT_SCALE.meta,
    weight: 600,
    trackingEm: 0.08,
    uppercase: true,
    chrome: SECTION_HEADER_CHROME,
  },
  // The workspace chip. Measured against the *placeholder*, never the signed-in
  // user's name: a long display name would otherwise push everyone's minimum
  // panel width out, and that name is content, not furniture.
  {
    text: "Workspace",
    scale: SB_FONT_SCALE.body,
    weight: 700,
    trackingEm: -0.01,
    uppercase: false,
    chrome: WORKSPACE_CHROME,
  },
];

/** Round up to the 4px spacing grid (DESIGN.md §5). */
const toGrid = (n: number) => Math.ceil(n / 4) * 4;

let ctx: CanvasRenderingContext2D | null | undefined;
const measuringContext = () => {
  if (ctx === undefined) {
    ctx = document.createElement("canvas").getContext("2d");
  }
  return ctx;
};

/**
 * Width at which the widest nav label stops truncating.
 *
 * Canvas `measureText` rather than a hidden DOM node: this runs on every font-size
 * change and on `fonts.ready`, and an offscreen measuring element would either
 * force layout each time or need its own subtree kept in sync with the real
 * components' typography. Tracking is added by hand — `ctx.letterSpacing` is not
 * in every engine we ship to, and per-character spacing is exact for the way CSS
 * applies it (after each character, the trailing one included).
 */
const measureMinOpenWidth = (
  baseFontPx: number,
  fontFamily: string,
): number => {
  const c = measuringContext();
  if (!c) return SIDEBAR_MIN_OPEN_FALLBACK;

  let widest = 0;
  for (const label of NAV_LABELS) {
    const sizePx = baseFontPx * label.scale;
    c.font = `${label.weight} ${sizePx}px ${fontFamily}`;
    const text = label.uppercase ? label.text.toUpperCase() : label.text;
    const tracking = label.trackingEm * sizePx * text.length;
    widest = Math.max(
      widest,
      c.measureText(text).width + tracking + label.chrome,
    );
  }
  return Math.max(toGrid(widest), MIN_OPEN_FLOOR);
};

/**
 * Measure the open range. Both ends re-measure when their input changes: `min`
 * when the user rescales the sidebar font (or a webfont finishes loading and the
 * metrics move under us), `max` on viewport resize.
 *
 * The fallbacks are the initial state on purpose — they are what the server
 * renders, so the first client render agrees with it and the real values arrive
 * in an effect.
 */
export const useSidebarBounds = (
  baseFontPx: number,
  fontFamily: string,
): SidebarBounds => {
  const [min, setMin] = useState(SIDEBAR_MIN_OPEN_FALLBACK);
  const [max, setMax] = useState(SIDEBAR_MAX_OPEN_FALLBACK);

  useEffect(() => {
    const remeasure = () => setMin(measureMinOpenWidth(baseFontPx, fontFamily));
    remeasure();
    // A webfont swapping in changes every metric this was computed from.
    document.fonts?.ready.then(remeasure).catch(() => {});
  }, [baseFontPx, fontFamily]);

  useEffect(() => {
    const onResize = () =>
      setMax(Math.round(window.innerWidth * SIDEBAR_MAX_FRACTION));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // A narrow viewport can put the ceiling under the floor; the floor wins, and
  // the panel is simply not resizable there.
  return { min, max: Math.max(min, max) };
};
