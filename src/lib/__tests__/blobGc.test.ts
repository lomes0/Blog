import { BLOB_REF_GRACE_MS } from "../blobRefs";
import {
  ageOf,
  BLOB_GC_GRACE_MS,
  type BlobCandidate,
  formatAge,
  isCollectable,
  planBlobCollection,
} from "../blobGc";

/**
 * What the collector is allowed to delete — docs/plans/blob-storage.md §5.
 *
 * These are the only tests in the blob work where a false *positive* is the
 * expensive direction. Elsewhere a missed reference costs a wasted kilobyte;
 * here it costs the bytes themselves, and a document referencing a blob whose
 * object is gone cannot be repaired from anything the app still holds. So most
 * of what follows is about the cases that must be **kept**.
 */

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

const now = new Date("2026-08-15T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

const blob = (
  hash: string,
  overrides: Partial<BlobCandidate> = {},
): BlobCandidate => ({
  hash,
  size: 1000,
  createdAt: ago(BLOB_GC_GRACE_MS * 2),
  refCount: 0,
  ...overrides,
});

describe("BLOB_GC_GRACE_MS", () => {
  /**
   * The blob window is measured from when the *bytes* arrived, and a blob is
   * always at least as old as its youngest reference. So a window no longer
   * than §3.2's reference grace would already have expired at the moment that
   * grace released the last reference, and the collector would be running with
   * no margin of its own — the constant would still be there, doing nothing.
   * Shortening it that far should fail here rather than silently disarm §5.
   */
  it("is strictly longer than the reference grace it sits behind", () => {
    expect(BLOB_GC_GRACE_MS).toBeGreaterThan(BLOB_REF_GRACE_MS);
  });
});

describe("isCollectable", () => {
  it("takes a blob nothing references and nothing is waiting on", () => {
    expect(isCollectable(blob(A), now)).toBe(true);
  });

  it("never takes a referenced blob, however old", () => {
    const ancient = blob(A, {
      refCount: 1,
      createdAt: new Date("2020-01-01T00:00:00Z"),
    });
    expect(isCollectable(ancient, now)).toBe(false);
  });

  /**
   * The state this window exists for: bytes are stored and their `Blob` row
   * written before any document can reference them — `ingestInlineBlobs` on a
   * guest draft signing in, `/api/import` restoring a bundle, the migration
   * script's bytes-first ordering. Each leaves a real blob with zero references
   * for as long as the write takes to finish, and §3.2's grace cannot help,
   * because there is no reference yet for it to hold.
   */
  it("leaves a freshly stored blob alone while its document is still arriving", () => {
    expect(isCollectable(blob(A, { createdAt: ago(60_000) }), now)).toBe(false);
  });

  it("holds it for exactly the window, not a moment less", () => {
    const onTheBoundary = blob(A, { createdAt: ago(BLOB_GC_GRACE_MS) });
    expect(isCollectable(onTheBoundary, now)).toBe(false);

    const oneMsPast = blob(A, { createdAt: ago(BLOB_GC_GRACE_MS + 1) });
    expect(isCollectable(oneMsPast, now)).toBe(true);
  });

  it("honours a window passed in, so an operator can widen it without a deploy", () => {
    const week = blob(A, { createdAt: ago(BLOB_GC_GRACE_MS + 1) });
    expect(isCollectable(week, now, 30 * 24 * 60 * 60 * 1000)).toBe(false);
  });
});

describe("planBlobCollection", () => {
  it("splits the store into what goes and what stays", () => {
    const plan = planBlobCollection(
      [
        blob(A),
        blob(B, { refCount: 2 }),
        blob(C, { createdAt: ago(60_000) }),
      ],
      now,
    );

    expect(plan.collect.map((b) => b.hash)).toEqual([A]);
    expect(plan.keep.map((k) => [k.blob.hash, k.reason])).toEqual([
      [B, "referenced"],
      [C, "within-grace"],
    ]);
  });

  it("says a blob is referenced rather than young when it is both", () => {
    // A referenced blob is not waiting on a timer, and reporting one as if it
    // were would tell an operator to come back next week for nothing.
    const plan = planBlobCollection(
      [blob(A, { refCount: 1, createdAt: ago(60_000) })],
      now,
    );

    expect(plan.keep[0].reason).toBe("referenced");
  });

  it("counts only the bytes it would actually reclaim", () => {
    const plan = planBlobCollection(
      [
        blob(A, { size: 120_224 }),
        blob(B, { size: 999, refCount: 1 }),
        blob(C, { size: 5, createdAt: ago(1000) }),
      ],
      now,
    );

    expect(plan.bytes).toBe(120_224);
  });

  it("reports oldest first, and identically on a second run", () => {
    const candidates = [
      blob(C, { createdAt: ago(BLOB_GC_GRACE_MS * 2) }),
      blob(A, { createdAt: ago(BLOB_GC_GRACE_MS * 4) }),
      blob(B, { createdAt: ago(BLOB_GC_GRACE_MS * 3) }),
    ];

    expect(planBlobCollection(candidates, now).collect.map((b) => b.hash))
      .toEqual([A, B, C]);
    // Same instant, same age — the hash breaks the tie, so the log of an
    // unchanged store is diffable against the previous run's.
    const sameAge = [blob(C), blob(A), blob(B)];
    expect(planBlobCollection(sameAge, now).collect.map((b) => b.hash))
      .toEqual([A, B, C]);
  });

  it("plans nothing for an empty store", () => {
    expect(planBlobCollection([], now)).toEqual({
      collect: [],
      keep: [],
      bytes: 0,
    });
  });

  it("takes nothing at all while every blob is still referenced", () => {
    const plan = planBlobCollection(
      [blob(A, { refCount: 1 }), blob(B, { refCount: 7 })],
      now,
    );

    expect(plan.collect).toEqual([]);
    expect(plan.bytes).toBe(0);
  });
});

describe("ageOf", () => {
  it("measures from when the bytes arrived", () => {
    expect(ageOf(blob(A, { createdAt: ago(3_600_000) }), now)).toBe(3_600_000);
  });

  it("reads a row from the future as brand new rather than as negative", () => {
    // Clock skew between the app and the database is not a reason to print a
    // nonsense age, and it is not a reason to collect anything either — a
    // negative age fails the window comparison on the safe side already.
    const skewed = blob(A, { createdAt: new Date(now.getTime() + 60_000) });
    expect(ageOf(skewed, now)).toBe(0);
    expect(isCollectable(skewed, now)).toBe(false);
  });
});

describe("formatAge", () => {
  it("picks one unit and stays in it", () => {
    expect(formatAge(0)).toBe("0m");
    expect(formatAge(59 * 60_000)).toBe("59m");
    expect(formatAge(60 * 60_000)).toBe("1h");
    expect(formatAge(47 * 3_600_000)).toBe("47h");
    expect(formatAge(48 * 3_600_000)).toBe("2d");
    expect(formatAge(BLOB_GC_GRACE_MS)).toBe("7d");
  });
});
