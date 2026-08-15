/**
 * Moving the data URIs already in the database into the blob store —
 * docs/plans/blob-storage.md §10, phase 3.
 *
 * The walk is separate from the script that drives it because it is the half
 * that can be wrong quietly. A missed node leaves bytes behind; a node rewritten
 * that should not have been leaves a post that renders nothing, and this runs
 * over every revision in the database at once. So it is specced
 * (`src/lib/__tests__/blobMigration.test.ts`) rather than trusted.
 *
 * ## Not every node holding a data URI may have it taken away
 *
 * A data URI in a node's `src` is sometimes just a picture, and sometimes the
 * node's own source document — §6.1 found that for sketches, whose SVG carries
 * the drawing between `<!-- payload-start -->` markers. Migration never destroys
 * that payload (it moves into the blob intact), but it does change **how the
 * node renders**, and that is what decides whether a type may be migrated:
 *
 * | Type | Renders a data URI as | Renders a URL as | Migratable |
 * | --- | --- | --- | --- |
 * | `image` | `<img>` | `<img>` | **yes** — nothing changes |
 * | `graph` | inline `<svg>` | `<img>` (it guards on the prefix) | not yet |
 * | `sketch` | inline `<svg>` | broken — it decodes unconditionally | no |
 *
 * Only `image` is migrated here, and it is where the bytes are: one PNG stored
 * 67 times is 10 MB of the 13.6 MB. The other two are the same decision — inline
 * SVG becomes an `<img>` — and that is a rendering change to verify in a
 * browser, not a migration.
 */
import { hashBytes } from "./storage";

/** `data:<mime>[;base64],<payload>` — the two forms §10 insists on matching. */
const DATA_URI = /^data:([^;,]+)(;base64)?,([\s\S]*)$/;

/** The node types whose `src` this migration may rewrite. See the docblock. */
export const MIGRATABLE_TYPES = new Set(["image"]);

export interface DecodedDataUri {
  mimeType: string;
  bytes: Buffer;
}

/**
 * The bytes a browser would fetch from this data URI, or `null` if it is not
 * one.
 *
 * Both encodings, because the base64 half is 67 occurrences and the
 * percent-encoded half is 74 — a decoder that handled only the obvious one would
 * silently migrate half the database and report success.
 */
export function decodeDataUri(value: string): DecodedDataUri | null {
  const match = DATA_URI.exec(value);
  if (!match) return null;

  const [, mimeType, base64, payload] = match;
  try {
    return {
      mimeType,
      bytes: base64
        ? Buffer.from(payload, "base64")
        : Buffer.from(decodeURIComponent(payload), "utf8"),
    };
  } catch {
    // A payload that will not decode is left where it is rather than stored as
    // whatever the decoder happened to produce.
    return null;
  }
}

/** One node in a stored state whose `src` is a data URI. */
export interface DataUriSite {
  /** The Lexical node type: `image`, `sketch`, `graph`, … */
  nodeType: string;
  mimeType: string;
  /** Bytes as stored in the document — what this occurrence costs today. */
  size: number;
  hash: string;
  migratable: boolean;
}

/** A site plus the bytes to store, for the sites that are being migrated. */
export interface MigratableSite extends DataUriSite {
  bytes: Buffer;
}

interface Walked {
  sites: DataUriSite[];
  migratable: MigratableSite[];
}

/**
 * Every data URI in a stored state, with what it decodes to.
 *
 * Iterative for the same reason as `extractBlobHashes`: this reads whatever is
 * in the database, and depth is not something a migration gets to assume.
 */
function walk(state: unknown, onSite?: (node: Record<string, unknown>, site: DataUriSite) => void): Walked {
  const sites: DataUriSite[] = [];
  const migratable: MigratableSite[] = [];
  const stack: unknown[] = [state];

  while (stack.length > 0) {
    const value = stack.pop();
    if (Array.isArray(value)) {
      stack.push(...value);
      continue;
    }
    if (value === null || typeof value !== "object") continue;

    const node = value as Record<string, unknown>;
    const src = node.src;
    if (typeof src === "string" && src.startsWith("data:")) {
      const decoded = decodeDataUri(src);
      if (decoded) {
        const nodeType = typeof node.type === "string" ? node.type : "unknown";
        const site: DataUriSite = {
          nodeType,
          mimeType: decoded.mimeType,
          size: decoded.bytes.byteLength,
          hash: hashBytes(decoded.bytes),
          migratable: MIGRATABLE_TYPES.has(nodeType),
        };
        sites.push(site);
        if (site.migratable) {
          migratable.push({ ...site, bytes: decoded.bytes });
          onSite?.(node, site);
        }
      }
    }

    stack.push(...Object.values(node));
  }

  return { sites, migratable };
}

/** What a revision holds, without changing it. */
export function findDataUriSites(state: unknown): DataUriSite[] {
  return walk(state).sites;
}

/** The distinct blobs a state would contribute, keyed by hash. */
export function blobsToStore(state: unknown): Map<string, MigratableSite> {
  const byHash = new Map<string, MigratableSite>();
  for (const site of walk(state).migratable) {
    if (!byHash.has(site.hash)) byHash.set(site.hash, site);
  }
  return byHash;
}

/**
 * Point every migratable `src` at its blob.
 *
 * **Mutates `state`** — the caller owns it (it comes straight from a query) and
 * the alternative is cloning 11 MB per document to throw the original away.
 * Returns how many nodes were rewritten, which is what the script reports and
 * what tells a dry run from a no-op.
 */
export function rewriteToBlobUrls(
  state: unknown,
  urlFor: (hash: string) => string,
): number {
  let rewritten = 0;
  walk(state, (node, site) => {
    node.src = urlFor(site.hash);
    rewritten++;
  });
  return rewritten;
}
