import {
  applySubsetOrder,
  moveByDirection,
  moveToTarget,
} from "@/lib/orderMove";

/**
 * The write side of container order
 * (docs/plans/archive/ordering-simplification.md §4), which is what replaced
 * the bracketing this file's neighbour — `ordering.test.ts` — used to cover.
 *
 * Everything a reorder computes is here, so these are the cases that decide
 * whether a drag lands where the user watched it go.
 */
describe("moveByDirection", () => {
  const ids = ["a", "b", "c", "d"];

  it("moves one step up and down", () => {
    expect(moveByDirection(ids, "c", "up")).toEqual(["a", "c", "b", "d"]);
    expect(moveByDirection(ids, "b", "down")).toEqual(["a", "c", "b", "d"]);
  });

  it("moves to either end", () => {
    expect(moveByDirection(ids, "c", "top")).toEqual(["c", "a", "b", "d"]);
    expect(moveByDirection(ids, "b", "bottom")).toEqual(["a", "c", "d", "b"]);
  });

  it("is a no-op at the edge it is already on", () => {
    expect(moveByDirection(ids, "a", "up")).toBeNull();
    expect(moveByDirection(ids, "a", "top")).toBeNull();
    expect(moveByDirection(ids, "d", "down")).toBeNull();
    expect(moveByDirection(ids, "d", "bottom")).toBeNull();
  });

  it("is a no-op for an id the list does not hold", () => {
    expect(moveByDirection(ids, "z", "up")).toBeNull();
  });

  it("does not mutate its input", () => {
    const input = [...ids];
    moveByDirection(input, "c", "top");
    expect(input).toEqual(ids);
  });
});

describe("moveToTarget", () => {
  const ids = ["a", "b", "c", "d"];

  it("drops on either edge of the target", () => {
    expect(moveToTarget(ids, ["a"], "c", "before")).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
    expect(moveToTarget(ids, ["a"], "c", "after")).toEqual([
      "b",
      "c",
      "a",
      "d",
    ]);
  });

  // The property the chained ranks used to buy: a multi-row selection lands as
  // one block, in the order it was rendered, not scrambled across the slot.
  it("drops a multi-row selection as one contiguous block", () => {
    expect(moveToTarget(["a", "b", "c", "d"], ["a", "c"], "d", "before"))
      .toEqual(["b", "a", "c", "d"]);
  });

  it("removes the dragged rows before locating the target", () => {
    // Dropping "after b" when b is directly below a must not put a back where
    // it started: the target's index is read from the list minus the block.
    expect(moveToTarget(ids, ["a"], "b", "after")).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
  });

  it("refuses a drop on a row that is itself being dragged", () => {
    expect(moveToTarget(ids, ["a", "b"], "b", "before")).toBeNull();
  });

  it("refuses a drop on a target this list does not hold", () => {
    expect(moveToTarget(ids, ["a"], "z", "before")).toBeNull();
  });

  it("is a no-op when the drop reproduces the current order", () => {
    expect(moveToTarget(ids, ["b"], "a", "after")).toBeNull();
  });

  // A cross-container drop appends the arriving ids first, then moves the whole
  // block to the slot — so a row that was not in the list is placed by the same
  // call that reorders the ones that were.
  it("places a row appended for an arrival", () => {
    expect(moveToTarget(["a", "b", "new"], ["new"], "a", "before")).toEqual([
      "new",
      "a",
      "b",
    ]);
  });
});

describe("applySubsetOrder", () => {
  // Root is one array rendered as two sections. Reordering within a section
  // must leave the other section's rows exactly where they are.
  it("rewrites only the slots the subset occupies", () => {
    const full = ["p1", "s1", "p2", "s2", "p3"];
    expect(applySubsetOrder(full, ["p3", "p1", "p2"])).toEqual([
      "p3",
      "s1",
      "p1",
      "s2",
      "p2",
    ]);
  });

  it("ignores a subset id the full list does not hold", () => {
    const full = ["a", "b"];
    expect(applySubsetOrder(full, ["b", "z", "a"])).toEqual(["b", "a"]);
  });

  it("leaves the list alone when the subset is empty", () => {
    expect(applySubsetOrder(["a", "b"], [])).toEqual(["a", "b"]);
  });

  it("does not mutate its input", () => {
    const full = ["a", "b", "c"];
    applySubsetOrder(full, ["c", "a"]);
    expect(full).toEqual(["a", "b", "c"]);
  });
});
