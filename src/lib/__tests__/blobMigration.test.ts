import {
  blobsToStore,
  decodeDataUri,
  findDataUriSites,
  rewriteToBlobUrls,
} from "../blobMigration";
import { blobUrl } from "../blobRefs";
import { createHash } from "node:crypto";

/**
 * The migration's walk — docs/plans/blob-storage.md §10.
 *
 * It runs once, over every revision in the database, and both ways of being
 * wrong are quiet: a node it does not see keeps its bytes, and a node it
 * rewrites that cannot render a URL becomes an empty picture in a published
 * post. So the cases here are mostly about *which* nodes it touches.
 */

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngUri = `data:image/png;base64,${PNG.toString("base64")}`;
const pngHash = createHash("sha256").update(PNG).digest("hex");

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><!-- payload-start -->{}<!-- payload-end --></svg>';
const svgUri = `data:image/svg+xml,${encodeURIComponent(SVG)}`;

const state = (...children: unknown[]) => ({
  root: { type: "root", children },
});

describe("decodeDataUri", () => {
  it("decodes the base64 form", () => {
    expect(decodeDataUri(pngUri)).toEqual({
      mimeType: "image/png",
      bytes: PNG,
    });
  });

  it("decodes the percent-encoded form", () => {
    // 74 of the 141 occurrences are this one. A decoder that handled only
    // base64 would report success having migrated half the database.
    const decoded = decodeDataUri(svgUri);
    expect(decoded?.mimeType).toBe("image/svg+xml");
    expect(decoded?.bytes.toString("utf8")).toBe(SVG);
  });

  it("is null for anything that is not a data URI", () => {
    expect(decodeDataUri(blobUrl(pngHash))).toBeNull();
    expect(decodeDataUri("https://example.com/cat.png")).toBeNull();
    expect(decodeDataUri("")).toBeNull();
  });

  it("is null rather than lossy when the payload will not decode", () => {
    expect(decodeDataUri("data:image/svg+xml,%E0%A4%A")).toBeNull();
  });
});

describe("findDataUriSites", () => {
  it("reports what each node holds and whether it may be moved", () => {
    const sites = findDataUriSites(
      state(
        { type: "image", src: pngUri },
        { type: "sketch", src: svgUri },
      ),
    );

    // Sorted, because the walk makes no promise about order — only about
    // finding everything.
    expect([...sites].sort((a, b) => a.nodeType.localeCompare(b.nodeType)))
      .toEqual([
        {
          nodeType: "image",
          mimeType: "image/png",
          size: PNG.byteLength,
          hash: pngHash,
          migratable: true,
        },
        {
          nodeType: "sketch",
          mimeType: "image/svg+xml",
          size: Buffer.byteLength(SVG),
          hash: createHash("sha256").update(Buffer.from(SVG)).digest("hex"),
          migratable: false,
        },
      ]);
  });

  it("finds a node nested anywhere", () => {
    const sites = findDataUriSites(
      state({
        type: "table",
        children: [{ type: "tablecell", children: [{ type: "image", src: pngUri }] }],
      }),
    );
    expect(sites.map((s) => s.nodeType)).toEqual(["image"]);
  });

  it("ignores a src that is already a blob URL", () => {
    expect(findDataUriSites(state({ type: "image", src: blobUrl(pngHash) })))
      .toEqual([]);
  });
});

describe("blobsToStore", () => {
  it("collapses repeated copies of one image to a single blob", () => {
    // This is the whole point: one PNG stored 67 times becomes one object.
    const blobs = blobsToStore(
      state(
        { type: "image", src: pngUri },
        { type: "image", src: pngUri },
        { type: "image", src: pngUri },
      ),
    );

    expect([...blobs.keys()]).toEqual([pngHash]);
    expect(blobs.get(pngHash)?.bytes).toEqual(PNG);
  });

  it("offers nothing for a type that may not be migrated", () => {
    expect(blobsToStore(state({ type: "sketch", src: svgUri })).size).toBe(0);
  });
});

describe("rewriteToBlobUrls", () => {
  it("points every copy at the one blob", () => {
    const doc = state(
      { type: "image", src: pngUri },
      { type: "image", src: pngUri },
    );

    expect(rewriteToBlobUrls(doc, blobUrl)).toBe(2);
    expect(doc.root.children.map((c) => (c as { src: string }).src)).toEqual([
      blobUrl(pngHash),
      blobUrl(pngHash),
    ]);
  });

  it("leaves a sketch exactly as it was", () => {
    // §6.1: a sketch decodes its own `src` on every render with no fallback,
    // so a URL there is a picture that does not appear.
    const doc = state({ type: "sketch", src: svgUri });

    expect(rewriteToBlobUrls(doc, blobUrl)).toBe(0);
    expect((doc.root.children[0] as { src: string }).src).toBe(svgUri);
  });

  it("preserves everything about the node except its src", () => {
    const doc = state({
      type: "image",
      src: pngUri,
      altText: "a cat",
      width: 320,
      height: 240,
      showCaption: true,
    });

    expect(rewriteToBlobUrls(doc, blobUrl)).toBe(1);
    expect(doc.root.children[0]).toEqual({
      type: "image",
      src: blobUrl(pngHash),
      altText: "a cat",
      width: 320,
      height: 240,
      showCaption: true,
    });
  });

  it("does nothing to a document that has already been migrated", () => {
    const doc = state({ type: "image", src: blobUrl(pngHash) });
    expect(rewriteToBlobUrls(doc, blobUrl)).toBe(0);
  });
});
