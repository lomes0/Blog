/**
 * The figure panel's store.
 *
 * Two things are worth pinning here, and only one of them is arithmetic:
 *
 *  1. **The derivations.** `layout`, `displayWidth` and `sliderWidth` are the
 *     rules three rows of controls read their state from. They are written
 *     once in `atoms.ts` precisely so they can be exercised here rather than
 *     by mounting a panel.
 *  2. **The scoping claim.** jotai is adopted on the condition that it has no
 *     global store — one `Provider` per node subtree, no app-level provider,
 *     and a lint fence keeping `src/**` off it entirely
 *     (docs/plans/haklex-reprise.md §5). A `Provider` *is* a store, so two
 *     stores holding two different figures without seeing each other is the
 *     executable form of that condition. If someone later reaches for jotai's
 *     implicit global store, or drops the `key` that gives each figure its own
 *     `Provider`, the last case here is what says so.
 */
import { createStore } from "jotai";
import { WIDTH_MAX } from "@/editor/nodes/imageLayout";
import {
  displayWidthAtom,
  dragWidthAtom,
  figureStyleAtom,
  layoutAtom,
  sliderWidthAtom,
} from "../atoms";

describe("the figure panel's atoms", () => {
  it("starts on the answers a figure with no style gives", () => {
    const store = createStore();
    expect(store.get(layoutAtom)).toBe("none");
    expect(store.get(displayWidthAtom)).toBeNull();
    expect(store.get(sliderWidthAtom)).toBe(WIDTH_MAX);
  });

  it("derives the layout from the style the node carries", () => {
    const store = createStore();
    store.set(figureStyleAtom, { float: "left" });
    expect(store.get(layoutAtom)).toBe("float-left");
    store.set(figureStyleAtom, { "margin-inline": "auto" });
    expect(store.get(layoutAtom)).toBe("align-center");
  });

  it("derives the committed width, and reads only a percentage as one", () => {
    const store = createStore();
    store.set(figureStyleAtom, { width: "50%" });
    expect(store.get(displayWidthAtom)).toBe(50);
    expect(store.get(sliderWidthAtom)).toBe(50);

    // A pixel width belongs to `__width`, which the resize handles own.
    store.set(figureStyleAtom, { width: "300px" });
    expect(store.get(displayWidthAtom)).toBeNull();
    expect(store.get(sliderWidthAtom)).toBe(WIDTH_MAX);
  });

  /**
   * The thumb follows the gesture, not the commit: the committed value arrives
   * a render later, and reading only that would make it stutter behind the
   * pointer.
   */
  it("lets a drag in progress outrank the committed width", () => {
    const store = createStore();
    store.set(figureStyleAtom, { width: "50%" });
    store.set(dragWidthAtom, 75);
    expect(store.get(sliderWidthAtom)).toBe(75);
    expect(store.get(displayWidthAtom)).toBe(50);

    store.set(dragWidthAtom, null);
    expect(store.get(sliderWidthAtom)).toBe(50);
  });

  it("keeps two figures' panels out of each other's state", () => {
    const first = createStore();
    const second = createStore();

    first.set(figureStyleAtom, { width: "25%", float: "left" });
    first.set(dragWidthAtom, 40);

    expect(second.get(displayWidthAtom)).toBeNull();
    expect(second.get(layoutAtom)).toBe("none");
    expect(second.get(sliderWidthAtom)).toBe(WIDTH_MAX);

    second.set(figureStyleAtom, { width: "100%" });
    expect(first.get(displayWidthAtom)).toBe(25);
    expect(first.get(sliderWidthAtom)).toBe(40);
  });
});
