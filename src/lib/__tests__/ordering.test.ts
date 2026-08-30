import {
  byRank,
  rankAtStart,
  rankBetween,
  type Ranked,
  ranksAfter,
  ranksForList,
} from "@/lib/ordering";

/**
 * What is left of the fractional keys after
 * docs/plans/ordering-simplification.md §4.
 *
 * Ordering is the order arrays now (`orderArray.test.ts` reads them,
 * `orderMove.test.ts` writes them). These four survive for the create path,
 * whose ranks nothing sorts by, and for the local library, which does — so the
 * cases that went with bracketing a *reorder* (`rankAtEnd` and the pair of
 * neighbours that positioned a drop) are gone with the code they covered, and
 * what remains is what still has a caller.
 */

const ranked = (id: string, rank: string): Ranked => ({ id, rank });

describe("ordering", () => {
  describe("rankBetween", () => {
    it("mints a key strictly between two neighbours", () => {
      const a = rankBetween(null, null);
      const b = rankBetween(a, null);
      const mid = rankBetween(a, b);
      expect(a < mid).toBe(true);
      expect(mid < b).toBe(true);
    });

    it("supports both edges (empty container, top, bottom)", () => {
      const first = rankBetween(null, null);
      const before = rankBetween(null, first);
      const after = rankBetween(first, null);
      expect(before < first).toBe(true);
      expect(first < after).toBe(true);
    });

    it("survives repeated inserts at the head without collapsing", () => {
      let head = rankBetween(null, null);
      const seen = new Set<string>([head]);
      for (let i = 0; i < 50; i++) {
        head = rankBetween(null, head);
        expect(seen.has(head)).toBe(false);
        seen.add(head);
      }
    });

    it("throws when neighbours are passed out of order", () => {
      const lo = rankBetween(null, null);
      const hi = rankBetween(lo, null);
      expect(() => rankBetween(hi, lo)).toThrow();
    });
  });

  describe("rankAtStart", () => {
    it("prepends before the min, unsorted input ok", () => {
      const [r0, r1, r2] = ranksForList(3);
      const siblings = [ranked("b", r1), ranked("c", r2), ranked("a", r0)];
      expect(rankAtStart(siblings) < r0).toBe(true);
    });

    it("seeds an empty container", () => {
      expect(rankAtStart([])).toBe(rankBetween(null, null));
    });
  });

  describe("ranksAfter", () => {
    // The batch the delete paths mint: a freed series' posts, or a deleted
    // project's series, arriving at the end of the root list together.
    it("returns ascending keys that all sort after the base", () => {
      const base = rankBetween(null, null);
      const keys = ranksAfter(base, 3);
      expect(keys).toHaveLength(3);
      expect(base < keys[0]).toBe(true);
      for (let i = 1; i < keys.length; i++) {
        expect(keys[i - 1] < keys[i]).toBe(true);
      }
    });

    it("treats a null base as the start of the list", () => {
      expect(ranksAfter(null, 2)).toHaveLength(2);
      expect(ranksAfter(null, 0)).toEqual([]);
    });
  });

  describe("ranksForList", () => {
    it("returns count keys in strictly ascending order", () => {
      const ranks = ranksForList(5);
      expect(ranks).toHaveLength(5);
      for (let i = 1; i < ranks.length; i++) {
        expect(ranks[i - 1] < ranks[i]).toBe(true);
      }
    });

    it("returns [] for non-positive counts", () => {
      expect(ranksForList(0)).toEqual([]);
      expect(ranksForList(-3)).toEqual([]);
    });
  });

  describe("byRank", () => {
    it("orders by rank ascending", () => {
      const [r0, r1] = ranksForList(2);
      const sorted = [ranked("x", r1), ranked("y", r0)].sort(byRank);
      expect(sorted.map((s) => s.id)).toEqual(["y", "x"]);
    });

    it("breaks rank ties by id deterministically", () => {
      const r = rankBetween(null, null);
      const sorted = [ranked("b", r), ranked("a", r)].sort(byRank);
      expect(sorted.map((s) => s.id)).toEqual(["a", "b"]);
    });
  });
});
