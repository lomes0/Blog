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
 * destination is exactly `0` or exactly `COMPACT_WIDTH`, never the pointer.
 * Crossing a threshold is a hard step, on the frame it happens.
 *
 * **Dead band** (`DEAD_BAND` px below `min`). The destination does not move at
 * all — it holds whatever it was last, so the band is directional: you stall at
 * `min` coming down and at `COMPACT_WIDTH` coming up. Two jobs, one mechanism:
 * an open panel narrower than `min` is unreachable, and the boundary is *felt*
 * rather than only seen.
 *
 * **Free range** (`min` and above). An ordinary splitter tracking the pointer
 * 1:1, and the width it lands on becomes the remembered open width.
 *
 * The panel does not move while any of this is happening. The drag is a
 * preview: `nextLanding` answers "where would letting go right now put the
 * panel", `SidebarDragPreview` draws that answer as an outline next to a guide
 * line tracking the raw pointer, and the panel takes the width exactly once, on
 * release. Nothing here is a frame of animation, which is why nothing here
 * carries a duration — the destination has been on screen the whole gesture, so
 * easing towards it would only add lag to a result the user is already looking
 * at.
 *
 * This module has **no imports on purpose**. It is the part of the interaction
 * that is decidable without a browser — every threshold and the hysteresis — and
 * keeping it free of React and MUI is what lets it be read, reasoned about and
 * exercised on its own. `min` and `max` are parameters rather than constants
 * here because neither is knowable statically: see `hooks/useSidebarBounds`,
 * which measures one off the nav labels and takes the other off the viewport.
 */

export type SidebarMode = "full" | "compact" | "hidden";

/**
 * Width of the compact (icon-strip) mode — one of the two *discrete* positions
 * the handle can select. A release in the snap range lands on exactly this or
 * exactly 0; nothing in between is reachable.
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
 * Hysteresis on the hidden ↔ compact threshold: once the preview reads shut, the
 * pointer must come back past `SNAP_HIDE_BELOW + SNAP_HYSTERESIS` before it
 * reopens to compact. Without it, a hand resting on the boundary flips the
 * previewed destination every frame.
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
 * nudge-and-release does not quietly rewrite a width you were happy with.
 */
export const OPEN_DETENT = 18;

export const clamp = (n: number, lo: number, hi: number) =>
  Math.min(Math.max(n, lo), hi);

/**
 * Where the panel would end up if the pointer were released right now.
 *
 * This is what the preview draws and what the release commits — never a frame
 * the panel itself renders, which is the whole point of the deferred commit.
 */
export interface Landing {
  mode: SidebarMode;
  width: number;
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
 * Pointer width → where a release would land. The whole interaction is this
 * function.
 *
 * Takes the previous answer explicitly, because two of the three behaviours are
 * defined in terms of it: hysteresis on the hidden edge, and the dead band,
 * which *is* "wherever we were pointing, unchanged". Reading those off component
 * state instead would make the gesture depend on render timing.
 *
 * Returns `prev` **by reference** whenever nothing changes. That identity is
 * load-bearing now rather than merely tidy: the drag loop writes the preview's
 * transform only when the answer actually moves, so the stalled and pinned
 * ranges touch no DOM at all.
 */
export const nextLanding = (
  raw: number,
  prev: Landing,
  { min, max }: Geometry,
  bypass: boolean,
): Landing => {
  // Modifier held: no zones at all, just a splitter over the open range. The
  // floor still holds — it is the width below which the panel cannot show its
  // own labels, and bypassing a snap zone is not a reason to undo that.
  if (bypass) return { mode: "full", width: clamp(raw, min, max) };

  // ── Free range: an ordinary splitter, 1:1. ────────────────────────────────
  if (raw >= min) return { mode: "full", width: Math.min(raw, max) };

  // ── Dead band: the destination does not move. ─────────────────────────────
  if (raw >= min - DEAD_BAND) return prev;

  // ── Snap range: a mode selector, discrete positions only. ─────────────────
  const shutAt = prev.mode === "hidden"
    ? SNAP_HIDE_BELOW + SNAP_HYSTERESIS
    : SNAP_HIDE_BELOW;
  const hidden = raw < shutAt;
  const mode: SidebarMode = hidden ? "hidden" : "compact";
  if (prev.mode === mode) return prev;

  return { mode, width: hidden ? 0 : COMPACT_WIDTH };
};

/**
 * Where a release in the free range comes to rest, given where it was pointing.
 *
 * Split out from `landingCommit` so the detent is stated once, next to the
 * radius that defines it.
 */
export const restingWidth = (
  pointed: number,
  { min, max, openWidth }: Geometry,
): number => {
  const raw = clamp(pointed, min, max);
  return Math.abs(raw - openWidth) <= OPEN_DETENT ? openWidth : raw;
};

/**
 * The landing a release actually writes — the previewed one, with the free
 * range's detent applied.
 *
 * Returned as a whole `Landing` rather than a width so the caller can decide
 * "commit nothing" with one comparison against the panel's current mode and
 * width. A release that lands back where it started must not write state, and
 * making that a single `mode === mode && width === width` test is what stops it
 * being three special cases at the call site.
 */
export const landingCommit = (landing: Landing, geom: Geometry): Landing =>
  landing.mode === "full"
    ? { mode: "full", width: restingWidth(landing.width, geom) }
    : landing;
