import {
  BLOB_REF_GRACE_MS,
  blobHashesFor,
  blobUrl,
  extractBlobHashes,
  inlineBlobUrls,
  planBlobRefs,
  unionOf,
} from "../blobRefs";

/**
 * What reconciliation is derived from — docs/plans/blob-storage.md §3.
 *
 * The scan is the load-bearing half: a reference it fails to see is a blob the
 * collector (§5) will delete while a document is still rendering it, and the
 * document has no way to get the bytes back. So most of these cases are about
 * *not* missing one, rather than about the diff that follows.
 */

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

const image = (hash: string) => ({
  type: "image",
  src: blobUrl(hash),
  altText: "",
});

describe("extractBlobHashes", () => {
  it("finds a reference at any depth", () => {
    const state = {
      root: {
        children: [
          { type: "paragraph", children: [] },
          {
            type: "table",
            children: [
              { type: "tablerow", children: [{ type: "tablecell", children: [image(A)] }] },
            ],
          },
        ],
      },
    };

    expect([...extractBlobHashes(state)]).toEqual([A]);
  });

  it("does not care which field the URL is in", () => {
    // The scan is deliberately field-agnostic, so a node type that stores its
    // blob somewhere other than `src` — or one that does not exist yet — needs
    // no change here.
    const state = {
      root: {
        children: [
          { type: "link", url: blobUrl(A), children: [] },
          { type: "future-node", poster: blobUrl(B), children: [] },
        ],
      },
    };

    expect([...extractBlobHashes(state)].sort()).toEqual([A, B]);
  });

  it("finds several references inside one string", () => {
    const html = `<img src="${blobUrl(A)}"><img src="${blobUrl(B)}">`;
    expect([...extractBlobHashes({ html })].sort()).toEqual([A, B]);
  });

  it("reports each hash once however many times it appears", () => {
    const state = { root: { children: [image(A), image(A), image(A)] } };
    expect([...extractBlobHashes(state)]).toEqual([A]);
  });

  it("ignores strings that only look like one", () => {
    const state = {
      root: {
        children: [
          // Too short, wrong alphabet, and uppercase — the store's keys are
          // lowercase hex and `isValidHash` says so.
          { src: "/api/blob/abc123" },
          { src: `/api/blob/${"g".repeat(64)}` },
          { src: `/api/blob/${"A".repeat(64)}` },
          { src: "/api/attachments/somefile.png" },
        ],
      },
    };

    expect([...extractBlobHashes(state)]).toEqual([]);
  });

  it("survives a document with nothing in it", () => {
    expect([...extractBlobHashes(null)]).toEqual([]);
    expect([...extractBlobHashes(undefined)]).toEqual([]);
    expect([...extractBlobHashes({})]).toEqual([]);
  });

  it("does not overflow the stack on a deeply nested document", () => {
    // The walk is iterative for this reason: the JSON it reads is
    // attacker-supplied, and a 50,000-deep tree must be a slow scan and not a
    // crashed save.
    let node: object = image(A);
    for (let i = 0; i < 50_000; i++) node = { children: [node] };

    expect([...extractBlobHashes({ root: node })]).toEqual([A]);
  });
});

describe("blobHashesFor", () => {
  it("is what a revision stores beside its content", () => {
    expect(blobHashesFor({ root: { children: [image(B), image(A)] } }))
      .toEqual([A, B]);
  });

  it("is empty for content with no images", () => {
    expect(blobHashesFor({ root: { children: [] } })).toEqual([]);
  });
});

describe("unionOf", () => {
  it("is what the document references, across its whole history", () => {
    // The head no longer holds `A`, but the revision behind it does — and that
    // revision is still readable and restorable, so the reference stands.
    expect([...unionOf([[A, B], [B], []])].sort()).toEqual([A, B]);
  });
});

describe("inlineBlobUrls", () => {
  /**
   * The one direction back out of the store, taken at the boundary of local
   * storage — a signed-out browser can resolve neither a blob URL nor an
   * IndexedDB that holds no blobs (docs/plans/blob-storage.md §9).
   */
  const dataUri = "data:image/png;base64,AAAA";

  it("puts the bytes back where the reference was", () => {
    const doc = { root: { children: [{ type: "image", src: blobUrl(A) }] } };

    expect(inlineBlobUrls(doc, () => dataUri)).toBe(1);
    expect(doc.root.children[0].src).toBe(dataUri);
  });

  it("leaves a reference alone when the bytes are not to hand", () => {
    // A bundle short of one image imports as a document with one broken
    // picture, not as a failed import.
    const doc = { root: { children: [{ type: "image", src: blobUrl(A) }] } };

    expect(inlineBlobUrls(doc, () => null)).toBe(0);
    expect(doc.root.children[0].src).toBe(blobUrl(A));
  });

  it("touches nothing that is not a blob reference", () => {
    const doc = {
      root: {
        children: [
          { type: "image", src: "https://example.com/cat.png" },
          { type: "sketch", src: "data:image/svg+xml,%3Csvg%3E" },
        ],
      },
    };
    const before = JSON.stringify(doc);

    expect(inlineBlobUrls(doc, () => dataUri)).toBe(0);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("round-trips with the hashes the scan finds", () => {
    const doc = {
      root: { children: [{ type: "image", src: blobUrl(A) }, { src: blobUrl(B) }] },
    };
    const seen = [...extractBlobHashes(doc)].sort();

    expect(inlineBlobUrls(doc, () => dataUri)).toBe(seen.length);
    expect(extractBlobHashes(doc).size).toBe(0);
  });
});

describe("planBlobRefs", () => {
  const now = new Date("2026-08-15T12:00:00Z");
  const old = new Date(now.getTime() - BLOB_REF_GRACE_MS - 1);
  const recent = new Date(now.getTime() - 1000);

  const ref = (hash: string, createdAt: Date) => ({ hash, createdAt });

  it("adds what the content gained and removes what it lost", () => {
    expect(planBlobRefs([ref(A, old), ref(B, old)], [B, C], now)).toEqual({
      add: [C],
      remove: [A],
    });
  });

  it("plans nothing when the two agree", () => {
    expect(planBlobRefs([ref(A, old), ref(B, old)], [B, A], now)).toEqual({
      add: [],
      remove: [],
    });
  });

  it("records the first reference to a document that had none", () => {
    expect(planBlobRefs([], [A], now)).toEqual({ add: [A], remove: [] });
  });

  /**
   * The grace period is the whole reason a reference carries a `createdAt`.
   * An image is uploaded — and referenced — the moment it is pasted, which is
   * before any revision mentions it; reconciling in that window must not revoke
   * the reference, because the collector would then take bytes the unsaved
   * draft is holding a URL to.
   */
  it("leaves a just-uploaded reference alone", () => {
    expect(planBlobRefs([ref(A, recent)], [], now)).toEqual({
      add: [],
      remove: [],
    });
  });

  it("removes it once the window has passed", () => {
    expect(planBlobRefs([ref(A, old)], [], now)).toEqual({
      add: [],
      remove: [A],
    });
  });

  it("holds a reference for exactly the window, not a moment less", () => {
    const onTheBoundary = new Date(now.getTime() - BLOB_REF_GRACE_MS);
    expect(planBlobRefs([ref(A, onTheBoundary)], [], now).remove).toEqual([]);
  });
});
