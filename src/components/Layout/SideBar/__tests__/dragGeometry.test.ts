import {
  COLLAPSE_MS,
  COMPACT_WIDTH,
  type Geometry,
  nextPaint,
  type Paint,
  restingWidth,
} from "../dragGeometry";

/**
 * The sidebar drag, pinned.
 *
 * `describe`/`it`/`expect` shape, like `src/lib/__tests__/ordering.test.ts`: the
 * repo has no runner wired up yet, so this runs as-is the day one is. It is
 * written anyway because `dragGeometry` is import-free precisely so that it
 * *can* be — the feel of this interaction is a set of thresholds, and thresholds
 * are the part of a gesture you can hold still without a browser.
 *
 * Bounds are the ones measured at the default sidebar font size. They are
 * parameters, not constants, so a change to the nav labels moves them; what
 * these assert is the *shape* the ranges make, not the pixel values.
 */
const geom: Geometry = { min: 180, max: 640, openWidth: 300 };

const HIDDEN: Paint = { mode: "hidden", width: 0, ease: 0 };
const OPEN: Paint = { mode: "full", width: 300, ease: 0 };

/** Drag the pointer one px at a time, recording every frame it paints. */
const sweep = (from: number, to: number, start: Paint, bypass = false) => {
  const step = from < to ? 1 : -1;
  const frames: Array<Paint & { raw: number }> = [];
  let p = start;
  for (let raw = from; step > 0 ? raw <= to : raw >= to; raw += step) {
    p = nextPaint(raw, p, geom, bypass);
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

    it("stalls — the panel does not move between the step and the open range", () => {
      const stall = frames.filter((f) => f.raw > 58 && f.raw < geom.min);
      expect(stall.every((f) => f.width === COMPACT_WIDTH)).toBe(true);
    });

    it("then tracks the pointer 1:1", () => {
      const tracking = frames.filter((f) => f.raw >= geom.min);
      expect(tracking.every((f) => f.width === f.raw)).toBe(true);
    });

    it("animates nothing on the way out", () => {
      expect(frames.every((f) => f.ease === 0)).toBe(true);
    });
  });

  describe("dragging shut from open", () => {
    const frames = sweep(400, 0, { mode: "full", width: 400, ease: 0 });
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

    it("eases that step, and only that step", () => {
      expect(at(139).ease).toBe(COLLAPSE_MS);
      expect(frames.filter((f) => f.ease > 0)).toHaveLength(1);
    });

    it("hides with a hard step, not an animated one", () => {
      expect(at(39).mode).toBe("hidden");
      expect(at(39).ease).toBe(0);
    });
  });

  describe("hysteresis", () => {
    it("cannot flicker the hidden edge", () => {
      let p = HIDDEN;
      for (const raw of [45, 52, 41, 48, 39, 44, 53, 40]) {
        p = nextPaint(raw, p, geom, false);
        expect(p.mode).toBe("hidden");
      }
    });

    it("cannot flicker the open edge — the dead band is its band", () => {
      let p = OPEN;
      for (const raw of [175, 182, 168, 150, 178, 145]) {
        p = nextPaint(raw, p, geom, false);
        expect(p.mode).toBe("full");
      }
    });
  });

  describe("modifier bypass", () => {
    const frames = sweep(400, 100, { mode: "full", width: 400, ease: 0 }, true);

    it("resizes continuously with no zones and no animation", () => {
      expect(frames.every((f) => f.mode === "full" && f.ease === 0)).toBe(true);
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

  describe("frames that change nothing", () => {
    it("are returned by reference, so a stalled drag renders nothing", () => {
      const held: Paint = { mode: "full", width: geom.min, ease: 0 };
      expect(nextPaint(160, held, geom, false)).toBe(held);

      const pinned: Paint = { mode: "compact", width: COMPACT_WIDTH, ease: 0 };
      expect(nextPaint(100, pinned, geom, false)).toBe(pinned);
    });
  });
});
