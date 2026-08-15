import { isBlobSrc, resolveBlobSrc, withBlobBytes } from "../blobs";

/**
 * The bytes a .docx embeds for a blob-backed image —
 * docs/plans/blob-storage.md §9.
 *
 * The conversion is synchronous, so this is the only way bytes can reach it,
 * and getting it wrong is the difference between a Word file with the picture
 * in it and one with the alt text.
 */

const HASH = "a".repeat(64);
const bytes = new Uint8Array([1, 2, 3]);
const blob = { bytes, mimeType: "image/png" };

describe("isBlobSrc", () => {
  it("recognises a blob path and nothing else", () => {
    expect(isBlobSrc(`/api/blob/${HASH}`)).toBe(true);
    expect(isBlobSrc("data:image/png;base64,AAAA")).toBe(false);
    expect(isBlobSrc("https://example.com/api/blob/" + HASH)).toBe(false);
    expect(isBlobSrc(`/api/blob/${HASH}?v=2`)).toBe(false);
  });
});

describe("resolveBlobSrc", () => {
  it("finds the bytes provided for this conversion", () => {
    withBlobBytes(new Map([[HASH, blob]]), () => {
      expect(resolveBlobSrc(`/api/blob/${HASH}`)).toEqual(blob);
    });
  });

  it("is null for a blob nobody resolved", () => {
    // Which is how the converter knows to export the alt text rather than
    // throw — a picture whose bytes are gone must not cost the whole document.
    withBlobBytes(new Map(), () => {
      expect(resolveBlobSrc(`/api/blob/${HASH}`)).toBeNull();
    });
  });

  it("is null outside any conversion", () => {
    expect(resolveBlobSrc(`/api/blob/${HASH}`)).toBeNull();
  });
});

describe("withBlobBytes", () => {
  it("restores the previous map rather than clearing it", () => {
    // A caption or a sticky note converts inside the outer conversion; the
    // inner one finishing must not blank what the outer one is still using.
    const outer = new Map([[HASH, blob]]);
    const inner = new Map();

    withBlobBytes(outer, () => {
      withBlobBytes(inner, () => {
        expect(resolveBlobSrc(`/api/blob/${HASH}`)).toBeNull();
      });
      expect(resolveBlobSrc(`/api/blob/${HASH}`)).toEqual(blob);
    });
  });

  it("restores even when the conversion throws", () => {
    expect(() =>
      withBlobBytes(new Map([[HASH, blob]]), () => {
        throw new Error("conversion failed");
      })
    ).toThrow("conversion failed");

    expect(resolveBlobSrc(`/api/blob/${HASH}`)).toBeNull();
  });
});
