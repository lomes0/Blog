import {
  COMPACT_WIDTH,
  type Geometry,
  type Landing,
  landingCommit,
  nextLanding,
  restingWidth,
} from "../dragGeometry";

/**
 * The sidebar drag, pinned.
 *
 * `dragGeometry` is import-free precisely so that it *can* be pinned: the feel
 * of this interaction is a set of thresholds, and thresholds are the part of a
 * gesture you can hold still without a browser.
 *
 * What these assert is the *destination* the drag previews, not anything the
 * panel renders — the panel does not move until release, so there are no frames
 * here and nothing to time. Bounds are the ones measured at the default sidebar
 * font size; they are parameters, not constants, so a change to the nav labels
 * moves them. What is fixed is the shape the ranges make.
 */
const geom: Geometry = { min: 180, max: 640, openWidth: 300 };

const HIDDEN: Landing = { mode: "hidden", width: 0 };
const OPEN: Landing = { mode: "full", width: 300 };

/** Drag the pointer one px at a time, recording where each step would land. */
const sweep = (from: number, to: number, start: Landing, bypass = false) => {
  const step = from < to ? 1 : -1;
  const frames: Array<Landing & { raw: number }> = [];
  let p = start;
  for (let raw = from; step > 0 ? raw <= to : raw >= to; raw += step) {
    p = nextLanding(raw, p, geom, bypass);
    frames.push({ ...p, raw });
  }
  return frames;
};

describe("sidebar drag geometry", () => {
  describe("dragging out from hidden", () => {
    const frames = sweep(0, 400, HIDDEN);

    it("offers only discrete positions below the open range", () => {
      const below = [...new Set(frames.map((f) => f.width))]
        .filter((w) => w < geom.min)
        .sort((a, b) => a - b);
      expect(below).toEqual([0, COMPACT_WIDTH]);
    });

    it("steps to compact past the hidden edge's hysteresis", () => {
      expect(frames.find((f) => f.mode === "compact")?.raw).toBe(58);
    });

    it("stalls — the destination does not move between the step and the open range", () => {
      const stall = frames.filter((f) => f.raw > 58 && f.raw < geom.min);
      expect(stall.every((f) => f.width === COMPACT_WIDTH)).toBe(true);
    });

    it("then tracks the pointer 1:1", () => {
      const tracking = frames.filter((f) => f.raw >= geom.min);
      expect(tracking.every((f) => f.width === f.raw)).toBe(true);
    });
  });

  describe("dragging shut from open", () => {
    const frames = sweep(400, 0, { mode: "full", width: 400 });
    const at = (raw: number) => frames.find((f) => f.raw === raw)!;

    it("holds still through the dead band", () => {
      const band = frames.filter((f) => f.raw < geom.min && f.raw >= 140);
      expect(band.every((f) => f.width === geom.min && f.mode === "full"))
        .toBe(true);
    });

    it("drops to exactly compact when it leaves the open range", () => {
      expect(at(139).mode).toBe("compact");
      expect(at(139).width).toBe(COMPACT_WIDTH);
    });

    it("hides at the snap threshold", () => {
      expect(at(39).mode).toBe("hidden");
      expect(at(39).width).toBe(0);
    });
  });

  describe("hysteresis", () => {
    it("cannot flicker the hidden edge", () => {
      let p = HIDDEN;
      for (const raw of [45, 52, 41, 48, 39, 44, 53, 40]) {
        p = nextLanding(raw, p, geom, false);
        expect(p.mode).toBe("hidden");
      }
    });

    it("cannot flicker the open edge — the dead band is its band", () => {
      let p = OPEN;
      for (const raw of [175, 182, 168, 150, 178, 145]) {
        p = nextLanding(raw, p, geom, false);
        expect(p.mode).toBe("full");
      }
    });
  });

  describe("modifier bypass", () => {
    const frames = sweep(400, 100, { mode: "full", width: 400 }, true);

    it("resizes continuously with no zones", () => {
      expect(frames.every((f) => f.mode === "full")).toBe(true);
      expect(
        frames.filter((f) => f.raw >= geom.min).every((f) => f.width === f.raw),
      ).toBe(true);
    });

    it("still floors at the minimum open width", () => {
      expect(frames[frames.length - 1].width).toBe(geom.min);
    });
  });

  describe("release detent", () => {
    it("lands on the remembered width when released near it", () => {
      expect(restingWidth(292, geom)).toBe(geom.openWidth);
      expect(restingWidth(308, geom)).toBe(geom.openWidth);
    });

    it("keeps a width chosen deliberately", () => {
      expect(restingWidth(340, geom)).toBe(340);
    });

    it("moves with the memory rather than sitting at a constant", () => {
      expect(restingWidth(412, { ...geom, openWidth: 420 })).toBe(420);
    });

    it("clamps to the ceiling", () => {
      expect(restingWidth(999, geom)).toBe(geom.max);
    });
  });

  describe("what a release writes", () => {
    it("applies the detent to an open landing", () => {
      expect(landingCommit({ mode: "full", width: 292 }, geom))
        .toEqual({ mode: "full", width: geom.openWidth });
    });

    it("leaves the discrete landings alone — they have no gap to close", () => {
      expect(landingCommit(HIDDEN, geom)).toEqual(HIDDEN);
      expect(landingCommit({ mode: "compact", width: COMPACT_WIDTH }, geom))
        .toEqual({ mode: "compact", width: COMPACT_WIDTH });
    });

    it("is comparable to the panel's current mode and width, so an unmoved drag is detectably a no-op", () => {
      // The whole point of returning a `Landing` rather than a width: the
      // release handler decides "commit nothing" with one equality test,
      // identically for all three modes.
      const unmoved = landingCommit({ mode: "full", width: 305 }, geom);
      expect(unmoved).toEqual({ mode: "full", width: geom.openWidth });

      const current: Landing = { mode: "full", width: geom.openWidth };
      expect(
        unmoved.mode === current.mode && unmoved.width === current.width,
      ).toBe(true);
    });
  });

  describe("pointer moves that change nothing", () => {
    it("are returned by reference, so the preview writes no DOM", () => {
      const held: Landing = { mode: "full", width: geom.min };
      expect(nextLanding(160, held, geom, false)).toBe(held);

      const pinned: Landing = { mode: "compact", width: COMPACT_WIDTH };
      expect(nextLanding(100, pinned, geom, false)).toBe(pinned);
    });
  });
});
