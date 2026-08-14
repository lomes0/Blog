/**
 * Where a container keeps its children (docs/plans/haklex-reprise.md §3).
 *
 * `address.ts`, `blocks.ts` and `ops.ts` each used to answer this with the same
 * two lines — `Array.isArray(node.children) ? node.children : []` — which
 * quietly encoded an assumption none of them meant to make: that a container's
 * children are always at `children`. They are not. A sticky note's body is a
 * whole nested editor, serialized at `editor.editorState.root.children`
 * (`StickyNode/index.tsx:92`), and a nested doc will put its own at
 * `doc.root.children`.
 *
 * Owning that here is what lets a nested editor become addressable **without a
 * second addressing dimension** (§3.2). A sticky's blocks are `b7.1` and `b7.2`
 * exactly as a layout column's are, because from this module's point of view a
 * nested editor is a children array at an unusual key and nothing more. The
 * cost that `claude-code-backlog.md` §4 deferred on — "every op has to know
 * which document it is operating on" — is a *live editor* cost, and the bridge
 * never touches one (§2.2).
 *
 * ### The array has to be the live one
 *
 * `ops.ts` splices what it is handed — `delete_block` at `:325`, `move_block`
 * at `:336`. An arm that maps, filters or synthesizes therefore breaks writes
 * while leaving every read correct: the splice lands on a discarded copy and
 * the next read reports the old content, with nothing failing anywhere. That is
 * the single most likely way this seam rots (§10, second bullet), so
 * `__tests__/containers.test.ts` asserts array *identity* rather than equality.
 */
import type { SerializedNode } from "./types";

/**
 * The two halves of one container's children — reading them, and creating them.
 *
 * They are an arm rather than a bare accessor because `ensureChildrenOf` has to
 * be able to mint the path, and an arm whose halves disagree about where the
 * array lives fails silently in the same direction as a copied array: the write
 * lands somewhere nothing renders. `childrenAt` below mints both from one path
 * declaration so they cannot drift.
 */
interface ContainerArm {
  /** The live array, or undefined when this node does not have one. */
  read(node: SerializedNode): SerializedNode[] | undefined;
  /** The same array, creating it and any missing object on the way. */
  ensure(node: SerializedNode): SerializedNode[];
}

/** An untyped object on the path to a children array — a nested editor state. */
type Bag = Record<string, unknown>;

const isBag = (value: unknown): value is Bag =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * An arm for children held at `…path.children` rather than at `children`.
 *
 * The path is the whole declaration: read walks it and stops at the first gap,
 * ensure walks it and fills the gaps. Adding a container type is therefore one
 * line, and it is not possible to add one that reads from a different place
 * than it writes to.
 */
function childrenAt(...path: readonly string[]): ContainerArm {
  const owner = (node: SerializedNode): Bag | undefined => {
    let current: Bag = node;
    for (const key of path) {
      const next = current[key];
      if (!isBag(next)) return undefined;
      current = next;
    }
    return current;
  };

  return {
    read(node) {
      const holder = owner(node);
      return holder && Array.isArray(holder.children)
        ? holder.children as SerializedNode[]
        : undefined;
    },
    ensure(node) {
      let holder: Bag = node;
      for (const key of path) {
        if (!isBag(holder[key])) holder[key] = {};
        holder = holder[key] as Bag;
      }
      if (!Array.isArray(holder.children)) holder.children = [];
      return holder.children as SerializedNode[];
    },
  };
}

/**
 * Container types whose children are somewhere other than `children`.
 *
 * A `Map` rather than an object literal, for the same reason `BLOCK_CONTAINERS`
 * is a `Set`: the key is a `type` string read straight out of stored JSON, and
 * an object lookup would let `"constructor"` or `"toString"` resolve to
 * something off `Object.prototype`.
 *
 * One entry today. `nested-doc` joins it in phase 4 with `childrenAt("doc",
 * "root")`; canvas is phase 7 and needs an arm written by hand rather than a
 * path, because its notes are frames with no `type` of their own — which is
 * also what `typeOf` is here for.
 */
const NESTED_CHILDREN: ReadonlyMap<string, ContainerArm> = new Map([
  // `StickyNode.exportJSON` writes `editor: this.__editor.toJSON()`, and a
  // `SerializedEditor` is `{ editorState: { root } }` — so a note's blocks sit
  // under that nested editor's own root, three keys down.
  ["sticky", childrenAt("editor", "editorState", "root")],
]);

/**
 * A node's children — the live array, and never a copy.
 *
 * Returns a fresh empty array when the node has none, and **must not create
 * one**. A leaf like a kanban node has no `children` at all, and giving it an
 * empty one — even harmlessly, even only in passing while walking the tree —
 * means it no longer serializes identically, which is the one property the
 * bridge exists to hold. The ops spec caught exactly that.
 */
export function childrenOf(node: SerializedNode): SerializedNode[] {
  const arm = NESTED_CHILDREN.get(node.type);
  if (arm) return arm.read(node) ?? [];
  return Array.isArray(node.children) ? node.children : [];
}

/**
 * The children array of a node about to receive one, created if absent.
 *
 * Only ever called where something is genuinely being appended, which is the
 * one place a node may gain a children array it did not have.
 */
export function ensureChildrenOf(node: SerializedNode): SerializedNode[] {
  const arm = NESTED_CHILDREN.get(node.type);
  if (arm) return arm.ensure(node);
  if (!Array.isArray(node.children)) node.children = [];
  return node.children;
}

/**
 * A child's effective type — `node.type` for everything that exists today.
 *
 * The parameter is here, unread, on purpose. A canvas serializes its notes as
 * frames carrying no `type` of their own (`CanvasNode/index.tsx:98`), so
 * reaching them needs the *parent* to say what its children are — a synthesized
 * `canvas-note`. Asking the question here now means phase 7 adds an arm to this
 * function rather than threading a new argument through `address.ts`,
 * `blocks.ts` and `outline.ts` after the fact.
 */
export function typeOf(
  node: SerializedNode,
  _parent?: SerializedNode,
): string {
  return node.type;
}
