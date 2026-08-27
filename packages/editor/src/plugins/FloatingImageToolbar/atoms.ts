/**
 * The floating figure panel's state — jotai, scoped to one figure.
 *
 * ## Why atoms at all, and why they are not global
 *
 * These are module-level atom *definitions*, which is the only shape jotai
 * has; the values live in a store, and the store comes from the `<Provider>`
 * this plugin renders around the panel. There is **no app-level `Provider`**
 * (docs/plans/archive/haklex-reprise.md §5, and the lint fence in
 * `eslint.config.mjs` that keeps `src/**` off jotai entirely), so nothing
 * outside that subtree can read or write these. The `Provider` is keyed on the
 * figure's node key as well, so selecting a different image is a fresh store
 * rather than a stale slider value arriving on the new panel.
 *
 * The alternative was `useState` in the panel root plus five props threaded
 * through three rows. What jotai buys is the third and fourth lines below:
 * `layout`, `displayWidth` and `sliderWidth` are *derived*, so the rule for
 * each is written once and every row that needs one subscribes to exactly it.
 * Two rows read the width; one reads the layout; none re-renders for the
 * other's state.
 *
 * The node remains the source of truth. `figureStyle` is a mirror the panel
 * refreshes from every editor update, plus an optimistic write on each of its
 * own edits — the committed value arrives back a render later, and reading
 * only that would make the slider thumb stutter behind the pointer.
 */
import { atom } from "jotai";
import {
  readDisplayWidth,
  readLayout,
  WIDTH_MAX,
} from "@/editor/nodes/imageLayout";

/** The selected figure's `__style`, parsed — the panel's whole input. */
export const figureStyleAtom = atom<Record<string, string | null>>({});

/**
 * The value of a slider drag in progress, or `null` when none is.
 *
 * Separate from `figureStyle` because it is the one piece of panel state that
 * is *not* a view of the node: it exists for the frames between the pointer
 * moving and the update committing.
 */
export const dragWidthAtom = atom<number | null>(null);

/** Which single layout the figure is in — float and align share one answer. */
export const layoutAtom = atom((get) => readLayout(get(figureStyleAtom)));

/** The committed display width in percent, or `null` for the natural size. */
export const displayWidthAtom = atom((get) =>
  readDisplayWidth(get(figureStyleAtom))
);

/**
 * Where the slider's thumb sits: the drag if there is one, else the committed
 * width, else the full column — a figure at its natural size is *at most* the
 * column wide, so the thumb starts at the end it can only travel back from.
 */
export const sliderWidthAtom = atom((get) =>
  get(dragWidthAtom) ?? get(displayWidthAtom) ?? WIDTH_MAX
);
