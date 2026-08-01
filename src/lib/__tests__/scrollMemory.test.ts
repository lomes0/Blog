import {
  capScrollTops,
  clampScrollTop,
  isRestoreSettled,
  MAX_REMEMBERED,
  sanitizeScrollTops,
  shouldRecord,
} from "@/lib/scrollMemory";

describe("sanitizeScrollTops", () => {
  it("returns an empty map for anything that is not a plain object", () => {
    expect(sanitizeScrollTops(undefined)).toEqual({});
    expect(sanitizeScrollTops(null)).toEqual({});
    expect(sanitizeScrollTops("120")).toEqual({});
    expect(sanitizeScrollTops(120)).toEqual({});
    // An array is an object, and would otherwise sanitize to index keys.
    expect(sanitizeScrollTops([1, 2, 3])).toEqual({});
  });

  it("keeps finite non-negative offsets and drops everything else", () => {
    expect(
      sanitizeScrollTops({
        good: 120,
        zero: 0,
        negative: -5,
        nan: Number.NaN,
        infinite: Number.POSITIVE_INFINITY,
        stringy: "240",
        nested: { top: 10 },
        nullish: null,
      }),
    ).toEqual({ good: 120, zero: 0 });
  });

  it("rounds fractional offsets", () => {
    expect(sanitizeScrollTops({ a: 120.4, b: 120.6 })).toEqual({
      a: 120,
      b: 121,
    });
  });

  it("caps a record written by a build with a larger limit", () => {
    const oversized: Record<string, number> = {};
    for (let i = 0; i < MAX_REMEMBERED + 10; i++) oversized[`doc-${i}`] = i;
    const result = sanitizeScrollTops(oversized);
    expect(Object.keys(result)).toHaveLength(MAX_REMEMBERED);
    expect(result["doc-0"]).toBeUndefined();
    expect(result[`doc-${MAX_REMEMBERED + 9}`]).toBe(MAX_REMEMBERED + 9);
  });
});

describe("capScrollTops", () => {
  it("leaves a map at or under the limit alone", () => {
    const tops = { a: 1, b: 2 };
    expect(capScrollTops(tops)).toBe(tops);
  });

  it("evicts from the front, which is the least recently written", () => {
    const tops: Record<string, number> = {};
    for (let i = 0; i < MAX_REMEMBERED + 3; i++) tops[`doc-${i}`] = i;
    const result = capScrollTops(tops);
    expect(Object.keys(result)).toHaveLength(MAX_REMEMBERED);
    expect(result["doc-0"]).toBeUndefined();
    expect(result["doc-1"]).toBeUndefined();
    expect(result["doc-2"]).toBeUndefined();
    expect(result["doc-3"]).toBe(3);
  });
});

describe("clampScrollTop", () => {
  it("clamps to the furthest the content allows", () => {
    // 2000px of content in an 800px viewport scrolls 1200px.
    expect(clampScrollTop(5000, 2000, 800)).toBe(1200);
    expect(clampScrollTop(500, 2000, 800)).toBe(500);
  });

  it("floors at zero, including when the content does not fill the box", () => {
    expect(clampScrollTop(-10, 2000, 800)).toBe(0);
    expect(clampScrollTop(300, 400, 800)).toBe(0);
  });
});

describe("isRestoreSettled", () => {
  const base = { scrollHeight: 2000, clientHeight: 800, grown: false };

  it("settles once the scroller reaches the target", () => {
    expect(isRestoreSettled({ ...base, target: 900, actual: 900 })).toBe(true);
  });

  it("tolerates a pixel of rounding", () => {
    expect(isRestoreSettled({ ...base, target: 900, actual: 899 })).toBe(true);
    expect(isRestoreSettled({ ...base, target: 900, actual: 898 })).toBe(false);
  });

  it("keeps retrying while the content is still growing", () => {
    // The target is past the end *so far*, but more content is coming — this
    // is the case a single assignment on mount gets wrong.
    expect(
      isRestoreSettled({
        target: 1500,
        actual: 200,
        scrollHeight: 1000,
        clientHeight: 800,
        grown: false,
      }),
    ).toBe(false);
  });

  it("gives up once the content has settled shorter than the target", () => {
    // The document genuinely shrank since it was last open; 200 is as far as
    // this scroller goes and retrying cannot change that.
    expect(
      isRestoreSettled({
        target: 1500,
        actual: 200,
        scrollHeight: 1000,
        clientHeight: 800,
        grown: true,
      }),
    ).toBe(true);
  });

  it("does not give up on a short landing the content could still reach", () => {
    // Grown, but the scroller is parked well short of where it could go — the
    // assignment has not taken effect rather than the target being unreachable.
    expect(
      isRestoreSettled({
        target: 1100,
        actual: 300,
        scrollHeight: 2000,
        clientHeight: 800,
        grown: true,
      }),
    ).toBe(false);
  });
});

describe("shouldRecord", () => {
  it("records the first position seen for a document", () => {
    expect(shouldRecord(undefined, 0)).toBe(true);
    expect(shouldRecord(undefined, 640)).toBe(true);
  });

  it("records a return to the top", () => {
    // The top is a real destination; treating 0 as "nothing to remember" would
    // make it the one place a reload could not return to.
    expect(shouldRecord(640, 0)).toBe(true);
  });

  it("ignores moves below the threshold, in both directions", () => {
    expect(shouldRecord(640, 640)).toBe(false);
    expect(shouldRecord(640, 643)).toBe(false);
    expect(shouldRecord(640, 637)).toBe(false);
    expect(shouldRecord(640, 644)).toBe(true);
    expect(shouldRecord(640, 636)).toBe(true);
  });

  it("refuses a position that is not a usable number", () => {
    expect(shouldRecord(640, Number.NaN)).toBe(false);
    expect(shouldRecord(640, Number.POSITIVE_INFINITY)).toBe(false);
    expect(shouldRecord(640, -20)).toBe(false);
  });
});
