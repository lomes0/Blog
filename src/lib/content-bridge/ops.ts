/**
 * Applying a batch of block operations (plan §4.7).
 *
 * Two properties matter here, and both come from the same place.
 *
 * **Losslessness.** Only the nodes an op names are touched. Every other
 * subtree is copied verbatim, so a kanban board nobody mentioned serializes
 * identically afterwards. The IR never has to be able to express it.
 *
 * **Snapshot addressing.** Every address in a batch resolves against the state
 * the batch was written against, not against the half-mutated tree. Claude
 * derives all of its addresses from one read, so `b5` has to keep meaning the
 * block that was `b5` in that read even if an earlier op in the same batch
 * deleted `b2`. That is why targets are resolved to node references up front
 * and positions recomputed at apply time, rather than re-walking paths.
 */
import type { Address, SerializedNode, StoredState, WritableBlock } from "./types";
import { blockToNode, isTextEditable, nodeToBlock } from "./blocks";
import { assertFresh, stateHash } from "./stateHash";
import { walkBlocks } from "./address";

export type InsertTarget = {
  /** Place the blocks after this one. */
  after?: Address;
  /** …or before it. */
  before?: Address;
  /** …or at the end of this container ("root" for the document itself). */
  appendTo?: Address | "root";
};

export type Op =
  | { op: "set_text"; id: Address; text: string }
  | { op: "replace_block"; id: Address; block: WritableBlock }
  | ({ op: "insert_blocks"; blocks: WritableBlock[] } & InsertTarget)
  | { op: "delete_block"; id: Address }
  | ({ op: "move_block"; id: Address } & InsertTarget);

/** A document with no content — what a post without a revision reads as. */
export const emptyState = (): StoredState => ({
  root: {
    type: "root",
    version: 1,
    direction: null,
    format: "",
    indent: 0,
    children: [],
  },
});

/** Build a whole document from blocks, for `create_post`. */
export function stateFromBlocks(blocks: readonly WritableBlock[]): StoredState {
  const state = emptyState();
  state.root.children = blocks.map((block) => blockToNode(block));
  return state;
}

export class OpError extends Error {
  constructor(message: string, readonly opIndex: number) {
    super(`op ${opIndex + 1}: ${message}`);
    this.name = "OpError";
  }
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * Read a node's children without touching it.
 *
 * This must not create the array when it is missing. A leaf like a kanban node
 * has no `children` at all, and giving it an empty one — even harmlessly, even
 * only in passing while walking the tree — means it no longer serializes
 * identically, which is the one property this module exists to hold. The ops
 * spec caught exactly that.
 */
const childrenOf = (node: SerializedNode): SerializedNode[] =>
  Array.isArray(node.children) ? (node.children as SerializedNode[]) : [];

/** The children array of a node about to receive one, created if absent. */
const mutableChildren = (node: SerializedNode): SerializedNode[] => {
  if (!Array.isArray(node.children)) node.children = [];
  return node.children as SerializedNode[];
};

interface Target {
  node: SerializedNode;
  parent: SerializedNode;
}

/** Resolve every address once, against the snapshot the caller read. */
function indexTargets(state: StoredState): Map<Address, Target> {
  const targets = new Map<Address, Target>();
  const parents = new Map<SerializedNode, SerializedNode>();

  const record = (parent: SerializedNode) => {
    for (const child of childrenOf(parent)) {
      parents.set(child, parent);
      record(child);
    }
  };
  record(state.root);

  for (const entry of walkBlocks(state)) {
    const parent = parents.get(entry.node);
    if (parent) targets.set(entry.address, { node: entry.node, parent });
  }
  return targets;
}

const positionOf = (target: Target): number =>
  childrenOf(target.parent).indexOf(target.node);

function requireTarget(
  targets: Map<Address, Target>,
  id: string,
  opIndex: number,
): Target {
  const target = targets.get(id);
  if (!target) throw new OpError(`no block at "${id}"`, opIndex);
  if (positionOf(target) === -1) {
    throw new OpError(`block "${id}" was removed earlier in this batch`, opIndex);
  }
  return target;
}

/** Where an insert or move should land: the container and the offset in it. */
function resolveInsertion(
  state: StoredState,
  targets: Map<Address, Target>,
  spec: InsertTarget,
  opIndex: number,
): { parent: SerializedNode; index: number } {
  if (spec.after !== undefined) {
    const target = requireTarget(targets, spec.after, opIndex);
    return { parent: target.parent, index: positionOf(target) + 1 };
  }
  if (spec.before !== undefined) {
    const target = requireTarget(targets, spec.before, opIndex);
    return { parent: target.parent, index: positionOf(target) };
  }
  const container =
    spec.appendTo === undefined || spec.appendTo === "root"
      ? state.root
      : requireTarget(targets, spec.appendTo, opIndex).node;
  // Only here, where something is genuinely about to be appended, may a node
  // gain a children array it did not have.
  return { parent: container, index: mutableChildren(container).length };
}

function build(
  blocks: readonly WritableBlock[],
  opIndex: number,
): SerializedNode[] {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw new OpError("no blocks given", opIndex);
  }
  return blocks.map((block) => {
    try {
      return blockToNode(block);
    } catch (error) {
      throw new OpError((error as Error).message, opIndex);
    }
  });
}

function applySetText(target: Target, text: string, opIndex: number): void {
  const block = nodeToBlock(target.node);

  if (block.type === "opaque") {
    throw new OpError(
      `block is a ${block.nodeType}, which has no codec — it can be moved or ` +
        `deleted, but not rewritten`,
      opIndex,
    );
  }
  if (block.type === "list") {
    throw new OpError(
      "a list's text lives in its items — use replace_block",
      opIndex,
    );
  }
  if (!isTextEditable(block)) {
    throw new OpError(
      "this block carries inline formatting the bridge cannot express, so " +
        "setting its text would flatten it — use replace_block to overwrite it " +
        "deliberately",
      opIndex,
    );
  }

  // Rebuild through the codec so carry-through (§4.6.1) applies: the node's
  // alignment, indent and any unmodelled fields survive the text change.
  const next =
    block.type === "code"
      ? blockToNode({ ...block, code: text }, target.node)
      : blockToNode({ ...block, text }, target.node);

  const position = positionOf(target);
  childrenOf(target.parent)[position] = next;
  target.node = next;
}

export interface ApplyResult {
  state: StoredState;
  stateHash: string;
  /** How many blocks the batch touched, for the caller's summary line. */
  changed: number;
}

/**
 * Apply a batch against a state, all or nothing.
 *
 * `expectedHash` is the token from the read that produced these addresses. A
 * mismatch means the document moved underneath them, so the batch is refused
 * rather than applied to the wrong blocks (plan §4.3).
 */
export function applyOps(
  state: StoredState,
  expectedHash: string,
  ops: readonly Op[],
): ApplyResult {
  assertFresh(state, expectedHash);
  if (!Array.isArray(ops) || ops.length === 0) {
    throw new Error("no operations given");
  }

  // Work on a copy so a failure part-way leaves the caller's state untouched.
  const working = clone(state);
  const targets = indexTargets(working);
  let changed = 0;

  ops.forEach((op, opIndex) => {
    switch (op.op) {
      case "set_text": {
        applySetText(requireTarget(targets, op.id, opIndex), op.text ?? "", opIndex);
        changed++;
        break;
      }
      case "replace_block": {
        const target = requireTarget(targets, op.id, opIndex);
        let next: SerializedNode;
        try {
          next = blockToNode(op.block, target.node);
        } catch (error) {
          throw new OpError((error as Error).message, opIndex);
        }
        childrenOf(target.parent)[positionOf(target)] = next;
        target.node = next;
        changed++;
        break;
      }
      case "insert_blocks": {
        const nodes = build(op.blocks, opIndex);
        const { parent, index } = resolveInsertion(working, targets, op, opIndex);
        mutableChildren(parent).splice(index, 0, ...nodes);
        changed += nodes.length;
        break;
      }
      case "delete_block": {
        const target = requireTarget(targets, op.id, opIndex);
        childrenOf(target.parent).splice(positionOf(target), 1);
        changed++;
        break;
      }
      case "move_block": {
        const target = requireTarget(targets, op.id, opIndex);
        const destination = resolveInsertion(working, targets, op, opIndex);
        if (containsNode(target.node, destination.parent)) {
          throw new OpError("a block cannot be moved inside itself", opIndex);
        }
        const from = positionOf(target);
        childrenOf(target.parent).splice(from, 1);
        // Removing from the same container shifts anything after it left by one.
        const to =
          destination.parent === target.parent && destination.index > from
            ? destination.index - 1
            : destination.index;
        mutableChildren(destination.parent).splice(to, 0, target.node);
        target.parent = destination.parent;
        changed++;
        break;
      }
      default: {
        const unknown = op as { op: string };
        throw new OpError(`unknown operation "${unknown.op}"`, opIndex);
      }
    }
  });

  return { state: working, stateHash: stateHash(working), changed };
}

/** True when `candidate` is `node` or lives somewhere beneath it. */
function containsNode(node: SerializedNode, candidate: SerializedNode): boolean {
  if (node === candidate) return true;
  return childrenOf(node).some((child) => containsNode(child, candidate));
}
