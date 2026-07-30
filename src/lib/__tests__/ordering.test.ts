import {
  byRank,
  rankAtEnd,
  rankAtStart,
  rankBetween,
  type Ranked,
  ranksForList,
} from "@/lib/ordering";

// NOTE: No test runner is configured in this repo yet (see CLAUDE.md). These
// specs follow a standard `describe`/`it`/`expect` shape so they run as-is once
// vitest/jest is wired up. Until then, the logic is verified ad hoc via
// scripts (see the ordering plan, Phase 1).

const ranked = (id: string, rank: string): Ranked => ({ id, rank });

describe("ordering", () => {
  describe("rankBetween", () => {
    it("mints a key strictly between two neighbours", () => {
      const a = rankBetween(null, null);
      const b = rankAtEnd([ranked("1", a)]);
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

  describe("rankAtEnd / rankAtStart", () => {
    it("appends after the max and prepends before the min, unsorted input ok", () => {
      const [r0, r1, r2] = ranksForList(3);
      const siblings = [ranked("b", r1), ranked("c", r2), ranked("a", r0)];
      const end = rankAtEnd(siblings);
      const start = rankAtStart(siblings);
      expect(r2 < end).toBe(true);
      expect(start < r0).toBe(true);
    });

    it("seeds an empty container", () => {
      expect(rankAtEnd([])).toBe(rankAtStart([]));
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
