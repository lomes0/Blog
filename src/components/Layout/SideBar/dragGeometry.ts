/**
 * The sidebar resize gesture, as arithmetic.
 *
 * One handle, two behaviours, chosen by where the pointer is. Not a blend of
 * the two — the ranges are disjoint, and the boundary between them is a range in
 * its own right:
 *
 *   pointer width:  0 ···· 40 ···· 76 ········ min-40 ······ min ──────── max
 *                   │ HIDE  │ COMPACT           │ DEAD BAND │  FREE (1:1)
 *                   └── mode selector: discrete ┴─ no motion ┴─ splitter ─────
 *
 * **Snap range** (below `min - DEAD_BAND`). The handle is a mode selector: the
 * panel is painted at exactly `0` or exactly `COMPACT_WIDTH`, never at the
 * pointer. Crossing a threshold is a hard step, on the frame it happens.
 *
 * **Dead band** (`DEAD_BAND` px below `min`). The panel does not move at all —
 * it holds whatever it was last showing, so the band is directional: you stall
 * at `min` coming down and at `COMPACT_WIDTH` coming up. Two jobs, one
 * mechanism: an open panel narrower than `min` is unreachable, and the boundary
 * is *felt* rather than only seen.
 *
 * **Free range** (`min` and above). An ordinary splitter tracking the pointer
 * 1:1, and the width it lands on becomes the remembered open width.
 *
 * This module has **no imports on purpose**. It is the part of the interaction
 * that is decidable without a browser — every threshold, the hysteresis, and the
 * one step allowed to animate — and keeping it free of React and MUI is what
 * lets it be read, reasoned about and exercised on its own. `min` and `max` are
 * parameters rather than constants here because neither is knowable statically:
 * see `hooks/useSidebarBounds`, which measures one off the nav labels and takes
 * the other off the viewport.
 */

export type SidebarMode = "full" | "compact" | "hidden";

/**
 * Width of the compact (icon-strip) mode — one of the two *discrete* positions
 * the handle can select. The panel occupies exactly this or exactly 0 in the
 * snap range; nothing in between is reachable.
 */
export const COMPACT_WIDTH = 76;

/**
 * Pointer width below which the panel snaps shut.
 *
 * Deliberately 36px *below* `COMPACT_WIDTH` rather than just under it:
 * accidentally hiding the panel is the costly mistake of the three, so it is the
 * one that costs a deliberate extra push past the compact detent's own edge.
 * Raise it toward `COMPACT_WIDTH` to make closing easier; lower it to make the
 * panel harder to lose. This is the tunable that decides that trade.
 */
export const SNAP_HIDE_BELOW = 40;

/**
 * Hysteresis on the hidden ↔ compact threshold: once shut, the pointer must come
 * back past `SNAP_HIDE_BELOW + SNAP_HYSTERESIS` before the panel reopens to
 * compact. Without it, a hand resting on the boundary flips the mode — and so
 * the previewed content — every frame.
 *
 * The compact ↔ open threshold needs no constant of its own: the dead band *is*
 * its hysteresis, and a wider one, which is why only this edge carries a band.
 */
export const SNAP_HYSTERESIS = 18;

/**
 * Width of the dead band, measured down from `min`. With the measured minimum
 * landing around 180 at the default font scale this puts the band at roughly
 * 140–180 — but derived, so it follows the user's sidebar font size instead of
 * drifting away from it.
 */
export const DEAD_BAND = 40;

/**
 * Release detent radius around the *remembered* open width.
 *
 * Relative to the remembered width, not a constant position: releasing within
 * this many px of the width you already chose lands exactly on it, so a
 * nudge-and-release does not quietly rewrite a width you were happy with. This
 * is the only gap a release can leave, and the reason it is bounded is that
 * closing it is the only easing that happens after one.
 */
export const OPEN_DETENT = 18;

/**
 * The one animated step in the whole gesture.
 *
 * Crossing *down* out of the free range moves the panel from `min` to
 * `COMPACT_WIDTH` in a single frame — around 100px, and the panel leaves the
 * pointer behind as it goes, which is unreadable instantly. Every other step is
 * either small or lands under the pointer, so every other step is instant.
 *
 * Ease-*out* (not the theme's ease-in-out): the move is already at full speed
 * when it starts — it inherits the drag — so easing in would read as a hitch.
 * Also used for the ≤`OPEN_DETENT` release settle.
 */
export const COLLAPSE_MS = 130;
export const COLLAPSE_EASING = "cubic-bezier(0, 0, 0.2, 1)";

export const clamp = (n: number, lo: number, hi: number) =>
  Math.min(Math.max(n, lo), hi);

/**
 * What the panel paints on one frame of a drag, and how it gets there.
 *
 * `mode` is the mode a release *now* would commit — the sidebar renders it live,
 * so the gesture is WYSIWYG. `ease` is non-zero only on the frames allowed to
 * animate; every other frame sets the width outright.
 */
export interface Paint {
  mode: SidebarMode;
  width: number;
  ease: number;
}

export interface Geometry {
  /** Narrowest open panel that still shows its nav labels whole. */
  min: number;
  /** Widest the open panel may go — a share of the viewport. */
  max: number;
  /** The remembered open width, already clamped into [min, max]. */
  openWidth: number;
}

/**
 * Pointer width → what the panel shows. The whole interaction is this function.
 *
 * Takes the previous frame explicitly, because two of the three behaviours are
 * defined in terms of it: hysteresis on the hidden edge, and the dead band,
 * which *is* "whatever we were showing, unchanged". Reading those off component
 * state instead would make the gesture depend on render timing.
 *
 * Returns `prev` **by reference** whenever nothing changes, which is what makes
 * the stalled and pinned ranges free: `setPaint` bails on an identical value, so
 * those frames re-render nothing at all.
 */
export const nextPaint = (
  raw: number,
  prev: Paint,
  { min, max }: Geometry,
  bypass: boolean,
): Paint => {
  // Modifier held: no zones at all, just a splitter over the open range. The
  // floor still holds — it is the width below which the panel cannot show its
  // own labels, and bypassing a snap zone is not a reason to undo that.
  if (bypass) return { mode: "full", width: clamp(raw, min, max), ease: 0 };

  // ── Free range: an ordinary splitter, 1:1, no easing. ─────────────────────
  if (raw >= min) return { mode: "full", width: Math.min(raw, max), ease: 0 };

  // ── Dead band: the panel does not move. ───────────────────────────────────
  if (raw >= min - DEAD_BAND) {
    return prev.ease === 0 ? prev : { ...prev, ease: 0 };
  }

  // ── Snap range: a mode selector, discrete positions only. ─────────────────
  const shutAt = prev.mode === "hidden"
    ? SNAP_HIDE_BELOW + SNAP_HYSTERESIS
    : SNAP_HIDE_BELOW;
  const hidden = raw < shutAt;
  const mode: SidebarMode = hidden ? "hidden" : "compact";
  if (prev.mode === mode && prev.ease === 0) return prev;

  return {
    mode,
    width: hidden ? 0 : COMPACT_WIDTH,
    // The one animated step. Stepping hidden ↔ compact is *not* animated —
    // those are hard steps, and reading as hard is what says they are discrete.
    ease: prev.mode === "full" ? COLLAPSE_MS : 0,
  };
};

/**
 * Where a release in the free range comes to rest, given where it was painted.
 *
 * Split out from the release handler so the detent is stated once, next to the
 * radius that defines it.
 */
export const restingWidth = (
  painted: number,
  { min, max, openWidth }: Geometry,
): number => {
  const raw = clamp(painted, min, max);
  return Math.abs(raw - openWidth) <= OPEN_DETENT ? openWidth : raw;
};
