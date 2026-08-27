/**
 * Where a container keeps its children
 * (docs/plans/archive/haklex-reprise.md §3).
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
  // Not a recursion risk — a snippet holds code blocks. It is absent from the
  // nested config because that config registers *upstream's* `CodeNode`, whose
  // `exportJSON` writes no `filename`: a snippet in a sticky note would come
  // back from its first load with every tab unnamed. See the note in
  // `packages/editor/src/nodes/nestedConfig.tsx`.
  "code-snippet",
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
 * The type a canvas note reports, since the stored frame carries none.
 *
 * Synthesized rather than stored: adding a `type` to the frames would change
 * what every existing canvas serializes to, and the bridge's one hard promise
 * is that a block nobody named comes out byte-identical.
 */
export const CANVAS_NOTE_TYPE = "canvas-note";

/** A container that is not a nested editor and so refuses nothing. */
const NO_REFUSALS: ReadonlySet<string> = new Set<string>();

/**
 * A canvas note's blocks, at the same path a sticky's are.
 *
 * The two are the same object — a `SerializedEditor` — reached through a
 * different key, which is why the arm is `childrenAt` rather than anything
 * hand-written.
 */
const CANVAS_NOTE_ARM = childrenAt(
  NESTED_EDITOR_REFUSES,
  "editor",
  "editorState",
  "root",
);

/**
 * True when `node` is a canvas note rather than a Lexical node.
 *
 * Recognised **by its own shape**, not by its parent: a note is the one thing
 * in stored content with no `type` of its own carrying a whole serialized
 * editor. Asking the node settles what `typeOf`'s unused `parent` argument was
 * reserved for — threading a parent through every `childrenOf` call in
 * `address.ts`, `blocks.ts`, `ops.ts` and `proposalDiff.ts` would have made a
 * missed call site *lose canvas notes silently* rather than fail
 * (docs/plans/nested-editor-support.md §5), and there are thirty of them.
 *
 * A `sticky` holds the same `editor` key and is not caught by this, because it
 * has a `type` and the table below answers first.
 */
function isCanvasNote(node: SerializedNode): boolean {
  return typeof node.type !== "string" && isBag(node.editor);
}

/**
 * Container types whose children are somewhere other than `children`.
 *
 * A `Map` rather than an object literal, for the same reason `BLOCK_CONTAINERS`
 * is a `Set`: the key is a `type` string read straight out of stored JSON, and
 * an object lookup would let `"constructor"` or `"toString"` resolve to
 * something off `Object.prototype`.
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
  // A canvas's children are its **notes**, which are frames rather than nodes:
  // `CanvasNode.exportJSON` writes `notes: [{...frame, editor}]`. So this arm
  // is the one whose elements are not `SerializedNode`, and the cast is the
  // honest spelling of that — `typeOf` gives each frame a type and
  // `CANVAS_NOTE_ARM` reaches its blocks.
  //
  // `notes` is returned live, never mapped, for the reason at the head of this
  // file: `ops.ts` splices what it is handed, and a copy would leave every read
  // correct while writes landed nowhere.
  ["canvas", {
    refuses: NO_REFUSALS,
    read: (node) =>
      Array.isArray(node.notes) ? node.notes as SerializedNode[] : undefined,
    ensure: (node) => {
      if (!Array.isArray(node.notes)) node.notes = [];
      return node.notes as SerializedNode[];
    },
  }],
  [CANVAS_NOTE_TYPE, CANVAS_NOTE_ARM],
]);

/**
 * An image caption's blocks, and the same array created if absent.
 *
 * Deliberately **not** an entry in `NESTED_CHILDREN`: a caption is a *field* of
 * the image block, not a container of addressable ones
 * (docs/plans/archive/haklex-reprise.md §2.4, restated in
 * docs/plans/nested-editor-support.md §4). An image is one block with a
 * `caption` string; descending into it instead would give two addresses for one
 * piece of content, which is the same reason a table cell is a leaf.
 *
 * The path still lives here, because this file is where "where does this node
 * keep that content" is answered, and a second spelling of it in `blocks.ts`
 * is how a read and a write end up disagreeing.
 */
const IMAGE_CAPTION_ARM = childrenAt(
  NESTED_EDITOR_REFUSES,
  "caption",
  "editorState",
  "root",
);

/** The blocks of an image's caption; empty when it has none. */
export const captionChildrenOf = (node: SerializedNode): SerializedNode[] =>
  IMAGE_CAPTION_ARM.read(node) ?? [];

/** The same array, minting the caption's editor state if the image has none. */
export const ensureCaptionChildren = (node: SerializedNode): SerializedNode[] =>
  IMAGE_CAPTION_ARM.ensure(node);

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
  const arm = NESTED_CHILDREN.get(typeOf(node));
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
  const arm = NESTED_CHILDREN.get(typeOf(node));
  if (arm) return arm.ensure(node);
  if (!Array.isArray(node.children)) node.children = [];
  return node.children;
}

/**
 * A child's effective type — `node.type`, except for a canvas note.
 *
 * **Every switch on a node's type in the bridge goes through this**, or a note
 * arrives as `undefined` and falls through to whatever the default arm is. That
 * is `address.ts`'s `isContainer`, `blocks.ts`'s two switches, and the
 * container chain `ops.ts` builds for its refusal check.
 *
 * The `parent` argument this used to take is gone: `isCanvasNote` answers from
 * the node alone, which is what kept thirty `childrenOf` call sites from having
 * to learn where they were (docs/plans/nested-editor-support.md §4).
 */
export function typeOf(node: SerializedNode): string {
  return isCanvasNote(node) ? CANVAS_NOTE_TYPE : node.type;
}

/**
 * Containers that hold exactly one kind of child.
 *
 * A different table from `NESTED_CHILDREN` and a different question: that one
 * asks *where* a container's children live, this one asks *what* they may be.
 * `code-snippet` is the first entry and needs no entry in the other — its files
 * are ordinary `code` nodes in the ordinary `children` array, which is the
 * whole design (docs/plans/archive/haklex-reprise.md §6.2).
 *
 * The cost of not refusing is small but real: the editor's own transform
 * (`nodes/CodeSnippetNode/guard.ts`) moves a stray out of the snippet on the
 * next load, so an agent's paragraph does not vanish — it silently *relocates*,
 * days later, in someone else's editing session. Refusing at the write is the
 * difference between an agent that fixes its batch and an author who finds a
 * paragraph that walked.
 */
const ONLY_CHILD_TYPE: ReadonlyMap<string, string> = new Map([
  ["code-snippet", "code"],
]);

/** The one child type a container accepts, or undefined if it takes anything. */
export const onlyChildTypeOf = (
  containerType: string,
): string | undefined => ONLY_CHILD_TYPE.get(containerType);

/**
 * The first of `nodes` that `container` cannot hold, or null when all may land.
 *
 * Shallow on purpose, unlike `findUnregisterable`: this is a rule about a
 * container's *own* children, not about everything beneath them. A `details`
 * inside a snippet is refused; a code block inside a details inside a paragraph
 * elsewhere is nobody's business here.
 */
export function findWrongChildType(
  container: string,
  nodes: readonly SerializedNode[],
): { container: string; nodeType: string; required: string } | null {
  const required = onlyChildTypeOf(container);
  if (!required) return null;
  for (const node of nodes) {
    if (node.type !== required) {
      return { container, nodeType: node.type, required };
    }
  }
  return null;
}

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
      if (refuses.has(typeOf(node))) return typeOf(node);
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
