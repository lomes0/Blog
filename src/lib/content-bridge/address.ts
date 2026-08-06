/**
 * Block addressing (plan §4.2).
 *
 * An address is a structural path in document order — `b3` is the third block,
 * `b4.2` the second child of the fourth. Addresses are minted per read and
 * never stored, so no node class changes and nothing is backfilled. They are
 * only valid against the content that minted them, which `stateHash` certifies.
 */
import type { Address, SerializedNode, StoredState } from "./types";
import { isBlockId, readBlockId } from "./blockId";

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
  // Tables descend to their rows and rows to their cells, but a cell is a
  // *leaf*: it carries its own text (see `blocks.ts`), so addressing through
  // to the paragraph inside would double the depth of every table in an
  // outline and give two addresses for one piece of content. Both the current
  // and pre-rename spellings, because the old one is data in stored revisions.
  "blog-table",
  "matheditor-table",
  "tablerow",
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

/** Resolve an address — id or path — against a state, or null. */
export function locate(state: StoredState, address: string): Located | null {
  const path = pathOf(state, address);
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
  /** The id when the block has one, otherwise its structural path. */
  address: Address;
  /** The structural path, always — `readBlocks` and moves need it. */
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
      // A stamped block is addressed by its id, which survives the tree
      // shifting underneath it; an unstamped one falls back to its path. Both
      // spellings coexist in one document, which is what lets ids arrive
      // gradually instead of by migration (see `blockId.ts`).
      const id = readBlockId(node);
      entries.push({
        address: id || formatAddress(path),
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

/**
 * Resolve an address — id or path — to its structural path.
 *
 * Ids win over paths when both could match, because an id is the more specific
 * claim: it names one block, whereas a path names a position that some other
 * block may since have taken.
 */
export function pathOf(state: StoredState, address: string): number[] | null {
  if (isBlockId(address)) {
    const hit = walkBlocks(state).find((entry) => entry.address === address);
    return hit ? hit.path : null;
  }
  return parseAddress(address);
}
