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
  /**
   * Node types this container's editor cannot register — see
   * `NESTED_EDITOR_REFUSES`. Empty for a container that is not a nested editor.
   */
  refuses: ReadonlySet<string>;
}

/**
 * What `packages/editor/src/nodes/nestedConfig.tsx` does not register, and
 * therefore what may not be written into a sticky note or a nested doc.
 *
 * ### Why this is a refusal and not a rendering quirk
 *
 * A nested editor is built from `nestedEditorConfig`, which excludes the
 * containers that own nested editors themselves — they would recurse without
 * bound — plus two types that mean nothing at that scale. `parseEditorState`
 * *throws* on an unregistered type, and both `StickyNode.importJSON` and
 * `$createNestedDocNode` swallow that into `console.error` and return an editor
 * holding its **default, empty** state. So the failure is not "the kanban did
 * not render": the entire nested document is gone, on the next load, after the
 * write reported success.
 *
 * The block IR can author two of these (`kanban`, `attachment`), and until
 * phase 4 nothing between `insert_blocks` and `parseEditorState` looked. Phase 1
 * measured the loss and pinned it as a test while it was still unreachable — a
 * sticky is wrapped in a paragraph and has no address at all. `nested-doc` is
 * block-level, which makes it reachable, so the guard lands with it.
 *
 * **Keep this in step with that config.** `src/lib/content-bridge/__tests__/
 * nestedDoc.test.ts` derives the difference between the document node set and
 * the nested one and asserts it is exactly this set, so a node registered in one
 * place and not the other turns red here rather than costing someone a document.
 */
const NESTED_EDITOR_REFUSES: ReadonlySet<string> = new Set([
  "sticky",
  "canvas",
  "kanban",
  "attachment",
  "page-break",
  "nested-doc",
]);

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
 *
 * `refuses` comes first and has no default, so adding an arm means *answering*
 * the question of what its editor cannot hold rather than inheriting silence —
 * and silence is the answer that loses documents.
 */
function childrenAt(
  refuses: ReadonlySet<string>,
  ...path: readonly string[]
): ContainerArm {
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
    refuses,
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
 * Two entries. Canvas is phase 7 and needs an arm written by hand rather than a
 * path, because its notes are frames with no `type` of their own — which is
 * also what `typeOf` is here for.
 */
const NESTED_CHILDREN: ReadonlyMap<string, ContainerArm> = new Map([
  // `StickyNode.exportJSON` writes `editor: this.__editor.toJSON()`, and a
  // `SerializedEditor` is `{ editorState: { root } }` — so a note's blocks sit
  // under that nested editor's own root, three keys down.
  ["sticky", childrenAt(NESTED_EDITOR_REFUSES, "editor", "editorState", "root")],
  // `NestedDocNode.exportJSON` writes the editor *state* rather than the editor
  // — `doc: this.__doc.getEditorState().toJSON()` — so there is no `editorState`
  // level and its blocks are two keys down. That is the shape §3.1 sketched, and
  // it is a decision the node class and this line make together: a
  // `SerializedEditor` wrapper would carry nothing we store. Change neither
  // alone.
  ["nested-doc", childrenAt(NESTED_EDITOR_REFUSES, "doc", "root")],
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

const NO_REFUSALS: ReadonlySet<string> = new Set<string>();

/** What a container refuses to hold — empty for everything but a nested editor. */
export const refusedTypesOf = (containerType: string): ReadonlySet<string> =>
  NESTED_CHILDREN.get(containerType)?.refuses ?? NO_REFUSALS;

/**
 * The first node in `nodes`, or anywhere beneath one, that no editor along
 * `containers` could register — or null when the write is safe.
 *
 * `containers` is the chain of node types from the document root down to and
 * including the destination's parent, so a block landing three levels inside a
 * nested doc is checked against that doc's editor just as a direct child is.
 * The whole subtree is walked, because the offending node is as likely to be a
 * kanban inside a `details` body as it is to be the block itself.
 *
 * Returning the pair rather than a boolean is what lets the caller say *which*
 * node and *which* container, which is the difference between an agent fixing
 * its batch and an agent retrying it verbatim.
 */
export function findUnregisterable(
  containers: readonly string[],
  nodes: readonly SerializedNode[],
): { container: string; nodeType: string } | null {
  for (const container of containers) {
    const refuses = refusedTypesOf(container);
    if (refuses.size === 0) continue;

    const search = (node: SerializedNode): string | null => {
      if (refuses.has(node.type)) return node.type;
      for (const child of childrenOf(node)) {
        const hit = search(child);
        if (hit) return hit;
      }
      return null;
    };

    for (const node of nodes) {
      const nodeType = search(node);
      if (nodeType) return { container, nodeType };
    }
  }
  return null;
}
