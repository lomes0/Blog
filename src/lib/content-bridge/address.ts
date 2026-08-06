/**
 * Block addressing (plan §4.2).
 *
 * An address is a structural path in document order — `b3` is the third block,
 * `b4.2` the second child of the fourth. Addresses are minted per read and
 * never stored, so no node class changes and nothing is backfilled. They are
 * only valid against the content that minted them, which `stateHash` certifies.
 */
import type { Address, SerializedNode, StoredState } from "./types";

/**
 * The only node types whose children are addressed individually.
 *
 * This is deliberately an allowlist of *structural* containers rather than a
 * denylist of leaves. An unrecognised container — a node type added later, or
 * one nobody thought about — is then treated as a single opaque block: less
 * granular, but still addressable, movable and preserved. The denylist spelling
 * would instead descend into it and mint addresses for children the codecs do
 * not understand, which is how you get a confident write to the wrong node.
 *
 * `list` is deliberately absent: a list is one block whose items the codec
 * handles internally (see `blocks.ts`).
 */
export const BLOCK_CONTAINERS: ReadonlySet<string> = new Set([
  "root",
  "layout-container",
  "layout-item",
  "details-container",
  "details-content",
]);

const ADDRESS_RE = /^b\d+(?:\.\d+)*$/;

/** `[0, 1]` -> `"b1.2"`. Path entries are 0-based; addresses read 1-based. */
export function formatAddress(path: readonly number[]): Address {
  return `b${path.map((i) => i + 1).join(".")}`;
}

/** `"b1.2"` -> `[0, 1]`, or null if the address is malformed. */
export function parseAddress(address: string): number[] | null {
  if (!ADDRESS_RE.test(address)) return null;
  const path = address
    .slice(1)
    .split(".")
    .map((part) => Number(part) - 1);
  return path.some((i) => i < 0 || !Number.isInteger(i)) ? null : path;
}

const childrenOf = (node: SerializedNode): SerializedNode[] =>
  Array.isArray(node.children) ? node.children : [];

/** True when this node's children get addresses of their own. */
const isContainer = (node: SerializedNode): boolean =>
  BLOCK_CONTAINERS.has(node.type) && childrenOf(node).length > 0;

export interface Located {
  node: SerializedNode;
  /** The node holding it, and where — what an insert or delete needs. */
  parent: SerializedNode;
  index: number;
}

/** Resolve an address against a state, or null if it points at nothing. */
export function locate(state: StoredState, address: string): Located | null {
  const path = parseAddress(address);
  if (!path || path.length === 0) return null;

  let parent = state.root;
  let node: SerializedNode | undefined;

  for (let depth = 0; depth < path.length; depth++) {
    // Only a container's children are addressable, so a path that tries to
    // descend through a leaf is malformed rather than merely missing.
    if (depth > 0) {
      if (!node || !isContainer(node)) return null;
      parent = node;
    }
    node = childrenOf(parent)[path[depth]];
    if (!node) return null;
  }

  return { node: node!, parent, index: path[path.length - 1] };
}

export interface WalkEntry {
  address: Address;
  path: number[];
  node: SerializedNode;
  /** Nesting level; 0 for a top-level block. */
  depth: number;
}

/**
 * Every addressable block, in document order, parents before children.
 *
 * Kept separate from outline rendering so the numbering has one definition —
 * reads, writes and the outline all have to agree on what `b4.2` means, and the
 * cheapest way to guarantee that is for them to share this walk.
 */
export function walkBlocks(state: StoredState): WalkEntry[] {
  const entries: WalkEntry[] = [];

  const visit = (parent: SerializedNode, prefix: number[]): void => {
    childrenOf(parent).forEach((node, index) => {
      const path = [...prefix, index];
      entries.push({
        address: formatAddress(path),
        path,
        node,
        depth: prefix.length,
      });
      if (isContainer(node)) visit(node, path);
    });
  };

  visit(state.root, []);
  return entries;
}
