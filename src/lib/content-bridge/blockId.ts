/**
 * Persistent block ids (plan §4.2, phase 5).
 *
 * Addressing is structural by default: `b4.2` is the second child of the fourth
 * block, derived per read and certified by `stateHash`. That is enough for the
 * terminal, where a read and a write are seconds apart. It is thinner in the
 * app, where the document being edited is usually the one on screen — a single
 * keystroke between the agent's read and the user's accept changes the hash and
 * the whole batch is refused.
 *
 * A persistent id fixes that: it survives insertions, deletions and moves
 * elsewhere in the document, so an address stays meaningful even when the tree
 * has shifted underneath it.
 *
 * ### Why there is no backfill
 *
 * Rev 1 proposed stamping every stored revision up front, which is a migration
 * over live data for a benefit nobody had measured. Ids here are **opportunistic**
 * instead:
 *
 *   - a block that has an id is addressed by it;
 *   - a block that does not is addressed by its path, exactly as before;
 *   - writing a document stamps the blocks it contains, so a document becomes
 *     fully addressed the first time an agent touches it.
 *
 * Nothing has to be migrated, nothing breaks if a document is never stamped,
 * and the two schemes coexist inside a single document. The cost of being wrong
 * about this is zero, which is the property the earlier design lacked.
 *
 * Ids ride in Lexical's `NodeState` under the reserved `$` key, which
 * serializes through `exportJSON`/`updateFromJSON` for *every* node class —
 * including Lexical's own, which this app cannot subclass. That only holds
 * because every node class delegates properly; `npm run check:nodes` is what
 * keeps it true.
 */
import { createState } from "lexical";
import type { SerializedNode } from "./types";

/**
 * The default must be a value no real id can equal: Lexical omits default
 * values from exported JSON, so `""` is what "unstamped" has to look like.
 */
export const blockIdState = createState("blockId", {
  parse: (value: unknown) => (typeof value === "string" ? value : ""),
});

/** The key Lexical reserves for node state in serialized JSON. */
const STATE_KEY = "$";

const ID_PREFIX = "blk_";

/** Read a node's persistent id straight from serialized JSON, or "" if unstamped. */
export function readBlockId(node: SerializedNode): string {
  const state = node[STATE_KEY];
  if (!state || typeof state !== "object") return "";
  const id = (state as Record<string, unknown>).blockId;
  return typeof id === "string" ? id : "";
}

/** True for something shaped like an id rather than a structural path. */
export const isBlockId = (address: string): boolean =>
  address.startsWith(ID_PREFIX);

let counter = 0;

/**
 * Mint an id.
 *
 * Short and readable because it is spent on context in every outline. It only
 * has to be unique within one document, so a random suffix plus a counter is
 * ample — and the counter keeps ids distinct within a single stamping pass even
 * if the random source repeats.
 */
export function mintBlockId(): string {
  counter = (counter + 1) % 0xffff;
  const random = Math.floor(Math.random() * 0xffffff).toString(36);
  return `${ID_PREFIX}${random}${counter.toString(36)}`;
}

/** Write an id onto a serialized node, preserving any other node state. */
export function writeBlockId(node: SerializedNode, id: string): void {
  const existing =
    node[STATE_KEY] && typeof node[STATE_KEY] === "object"
      ? (node[STATE_KEY] as Record<string, unknown>)
      : {};
  node[STATE_KEY] = { ...existing, blockId: id };
}
