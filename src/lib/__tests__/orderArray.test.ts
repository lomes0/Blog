import { orderBy } from "@/lib/orderArray";

/**
 * The tolerant reader of docs/plans/ordering-simplification.md §6.
 *
 * What is being pinned is the *drift* behaviour, because that is the half that
 * decides whether a stale array is cosmetic or a broken view: an id the array
 * has never heard of must still render, and an id whose row is gone must not
 * leave a hole or throw.
 */

type Row = { id: string; createdAt?: string | Date | null };

const row = (id: string, createdAt?: string | Date): Row => ({
  id,
  createdAt,
});
const ids = (rows: Row[]) => rows.map((r) => r.id);

describe("orderBy", () => {
  it("orders rows by their index in the array", () => {
    const rows = [row("c"), row("a"), row("b")];
    expect(ids(orderBy(["a", "b", "c"], rows))).toEqual(["a", "b", "c"]);
  });

  it("does not mutate its inputs", () => {
    const order = ["b", "a"];
    const rows = [row("a"), row("b")];
    orderBy(order, rows);
    expect(order).toEqual(["b", "a"]);
    expect(ids(rows)).toEqual(["a", "b"]);
  });

  it("falls to the end, oldest first, for ids missing from the array", () => {
    const rows = [
      row("new", "2026-08-30T00:00:00.000Z"),
      row("a"),
      row("older", "2026-01-01T00:00:00.000Z"),
    ];
    expect(ids(orderBy(["a"], rows))).toEqual(["a", "older", "new"]);
  });

  it("breaks a createdAt tie by id, so the tail is total", () => {
    const at = "2026-08-30T00:00:00.000Z";
    const rows = [row("b", at), row("c", at), row("a", at)];
    expect(ids(orderBy([], rows))).toEqual(["a", "b", "c"]);
  });

  it("reads a missing createdAt as the epoch rather than dropping the row", () => {
    const rows = [row("dated", "2026-01-01T00:00:00.000Z"), row("undated")];
    expect(ids(orderBy([], rows))).toEqual(["undated", "dated"]);
  });

  it("accepts a Date as readily as an ISO string", () => {
    const rows = [
      row("later", new Date("2026-08-30T00:00:00.000Z")),
      row("earlier", "2026-01-01T00:00:00.000Z"),
    ];
    expect(ids(orderBy([], rows))).toEqual(["earlier", "later"]);
  });

  it("ignores ids in the array with no row", () => {
    const rows = [row("a"), row("b")];
    expect(ids(orderBy(["deleted", "b", "gone", "a"], rows))).toEqual([
      "b",
      "a",
    ]);
  });

  it("reads an empty array as createdAt order", () => {
    const rows = [
      row("b", "2026-03-01T00:00:00.000Z"),
      row("a", "2026-02-01T00:00:00.000Z"),
    ];
    expect(ids(orderBy([], rows))).toEqual(["a", "b"]);
  });

  it("returns nothing for no rows, whatever the array says", () => {
    expect(orderBy(["a", "b"], [])).toEqual([]);
  });

  it("reads a duplicated id at its first mention", () => {
    const rows = [row("a"), row("b")];
    expect(ids(orderBy(["a", "b", "a"], rows))).toEqual(["a", "b"]);
  });

  it("keeps rows sharing an id adjacent, in arrival order", () => {
    const first = { id: "a", createdAt: "2026-01-01T00:00:00.000Z" };
    const second = { id: "a", createdAt: "2026-02-01T00:00:00.000Z" };
    expect(orderBy(["a"], [first, second])).toEqual([first, second]);
  });

  it("is stable across repeated calls on the same inputs", () => {
    const rows = [
      row("x", "2026-02-01T00:00:00.000Z"),
      row("b", "2026-01-01T00:00:00.000Z"),
      row("a"),
    ];
    const once = ids(orderBy(["a"], rows));
    expect(ids(orderBy(["a"], rows))).toEqual(once);
    expect(once).toEqual(["a", "b", "x"]);
  });

  it("carries the row through, not a copy of its id", () => {
    const only = { id: "a", name: "post" };
    expect(orderBy(["a"], [only])[0]).toBe(only);
  });
});
