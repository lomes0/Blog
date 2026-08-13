import { diffCatchUp } from "@/lib/changes/diff";

/**
 * The catch-up diff — docs/plans/archive/changes-detection.md §3, §3.1, §8.
 *
 * This is where the hard-delete reasoning either holds or does not. The
 * endpoint's shape (the *full* id set, no `since=` cursor) exists solely so
 * that absence can mean something, and the only place that meaning is written
 * down as executable is here.
 */

const at = (iso: string) => new Date(iso).toISOString();

const T0 = at("2026-08-08T10:00:00.000Z");
const T1 = at("2026-08-08T11:00:00.000Z");
const T2 = at("2026-08-08T12:00:00.000Z");

describe("diffCatchUp", () => {
  it("reports nothing when the store already agrees with the server", () => {
    const rows = [{ id: "a", updatedAt: T0 }, { id: "b", updatedAt: T1 }];
    expect(diffCatchUp(rows, rows)).toEqual({
      changedIds: [],
      deletedIds: [],
    });
  });

  it("treats an id the store does not hold as a create", () => {
    const result = diffCatchUp(
      [{ id: "a", updatedAt: T0 }],
      [{ id: "a", updatedAt: T0 }, { id: "new", updatedAt: T1 }],
    );
    expect(result).toEqual({ changedIds: ["new"], deletedIds: [] });
  });

  it("treats a newer server timestamp as an update", () => {
    const result = diffCatchUp(
      [{ id: "a", updatedAt: T0 }, { id: "b", updatedAt: T1 }],
      [{ id: "a", updatedAt: T2 }, { id: "b", updatedAt: T1 }],
    );
    expect(result).toEqual({ changedIds: ["a"], deletedIds: [] });
  });

  /**
   * The whole reason the response is a full set. `Document` has no `deletedAt`
   * — `deleteDocumentRow` runs `tx.document.delete` — so the deleted row leaves
   * nothing behind with a recent `updatedAt`. A `since=` response would have
   * been empty here and the client would have kept rendering a post that no
   * longer exists, forever.
   */
  it("reports an id missing from the response as a hard delete", () => {
    const result = diffCatchUp(
      [
        { id: "kept", updatedAt: T0 },
        { id: "gone", updatedAt: T0 },
      ],
      [{ id: "kept", updatedAt: T0 }],
    );
    expect(result).toEqual({ changedIds: [], deletedIds: ["gone"] });
  });

  it("answers all three questions from one response", () => {
    const result = diffCatchUp(
      [
        { id: "same", updatedAt: T0 },
        { id: "edited", updatedAt: T0 },
        { id: "gone", updatedAt: T0 },
      ],
      [
        { id: "same", updatedAt: T0 },
        { id: "edited", updatedAt: T2 },
        { id: "created", updatedAt: T1 },
      ],
    );
    expect(result.changedIds.sort()).toEqual(["created", "edited"]);
    expect(result.deletedIds).toEqual(["gone"]);
  });

  it("empties the store when the server says the author owns nothing", () => {
    const result = diffCatchUp(
      [{ id: "a", updatedAt: T0 }, { id: "b", updatedAt: T1 }],
      [],
    );
    expect(result).toEqual({ changedIds: [], deletedIds: ["a", "b"] });
  });

  it("loads everything when the store is empty", () => {
    const result = diffCatchUp([], [
      { id: "a", updatedAt: T0 },
      { id: "b", updatedAt: T1 },
    ]);
    expect(result).toEqual({ changedIds: ["a", "b"], deletedIds: [] });
  });

  /**
   * `Post.updatedAt` is `string | Date` and both really occur — a `Date` on an
   * entity that never left the process, an ISO string once it has crossed the
   * wire. Compared as strings these are never equal and every row would be
   * permanently changed.
   */
  it("compares a Date in the store against an ISO string from the wire", () => {
    const result = diffCatchUp(
      [{ id: "a", updatedAt: new Date(T1) }],
      [{ id: "a", updatedAt: T1 }],
    );
    expect(result.changedIds).toEqual([]);
  });

  /**
   * Strictly newer, not merely different. `createDocument` returns
   * `findDocument(id)`, whose single-revision branch reports the revision's
   * `createdAt` — written *after* the document row, so a freshly created post
   * can sit in the store a few milliseconds ahead of `Document.updatedAt`.
   * Under a `!==` rule that row would re-fetch on every poll and never converge.
   */
  it("does not re-fetch a store row whose timestamp is ahead of the server's", () => {
    const result = diffCatchUp(
      [{ id: "a", updatedAt: T2 }],
      [{ id: "a", updatedAt: T1 }],
    );
    expect(result.changedIds).toEqual([]);
  });

  it("re-fetches rather than stalls when a timestamp does not parse", () => {
    const result = diffCatchUp(
      [{ id: "a", updatedAt: "not a date" }],
      [{ id: "a", updatedAt: T1 }],
    );
    expect(result.changedIds).toEqual(["a"]);
  });

  it("ignores the order either side arrives in", () => {
    const result = diffCatchUp(
      [{ id: "b", updatedAt: T1 }, { id: "a", updatedAt: T0 }],
      [{ id: "a", updatedAt: T0 }, { id: "b", updatedAt: T1 }],
    );
    expect(result).toEqual({ changedIds: [], deletedIds: [] });
  });
});
