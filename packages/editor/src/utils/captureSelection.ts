/**
 * The user's selection, in the addresses the agent tools already speak.
 *
 * docs/plans/haklex-adoption.md §7.3. Their `captureSelection.ts` marks the
 * selected blocks `selected="true"` in the serialization the model is pushed
 * and, for a text range, injects the exact text plus anchor/focus `blockId`
 * and offset. Ours does the same job against *our* addressing, which is the
 * same mechanism (§2.3) with one difference that matters:
 *
 * ### Ids are opportunistic here
 *
 * A block only carries a `blk_…` id once an agent write has touched it
 * (`stampBlockIds` in `content-bridge/ops.ts` stamps what a batch touched, and
 * nothing else). An untouched block has no id at all — so capturing one would
 * hand the model an empty string, or a dangling `blockId` that resolves to
 * nothing. This falls back to the block's **structural address** (`b4`,
 * `b4.2`), which `locate`/`pathOf` accept exactly as they accept an id, and
 * which is what an outline of that same document would have shown.
 *
 * The fallback is derived the way `walkBlocks` derives it, and must stay that
 * way: same container allowlist, same 1-based numbering, same "id wins over
 * path" rule. A structural address is only meaningful against the state that
 * minted it, which is the one real limit — see `captureSelection` below.
 */
import {
  $getSelection,
  $getState,
  $isElementNode,
  $isRangeSelection,
  $isRootNode,
  type BaseSelection,
  type LexicalEditor,
  type LexicalNode,
  type PointType,
} from "lexical";
import {
  BLOCK_CONTAINERS,
  blockIdState,
  formatAddress,
} from "@/lib/content-bridge";
import {
  type CapturedSelection,
  MAX_SELECTION_BLOCKS,
  MAX_SELECTION_TEXT,
  type SelectionPoint,
} from "@/lib/ai/selection";

export type { CapturedSelection, SelectionPoint };

/** What `ElementNode.getTextContent()` puts between two non-inline children. */
const BLOCK_JOIN = 2; // "\n\n"

/**
 * True when this node's children get addresses of their own — the live-node
 * spelling of `address.ts`'s `isContainer`.
 */
const isContainer = (node: LexicalNode): boolean =>
  $isElementNode(node) && node.getChildrenSize() > 0 &&
  BLOCK_CONTAINERS.has(node.getType());

interface LocatedBlock {
  node: LexicalNode;
  /** 0-based structural path from the root, as `walkBlocks` mints it. */
  path: number[];
}

/**
 * The deepest block that has an address of its own containing `node`.
 *
 * Descends only through containers, exactly as `walkBlocks` does — so a
 * paragraph inside a table *cell* reports the cell (a cell is a leaf that
 * carries its own text), while a paragraph inside a layout column reports the
 * paragraph. Anything under an unrecognised container collapses to that
 * container, which is the addressing the tools would give it anyway.
 */
function locateBlock(node: LexicalNode): LocatedBlock | null {
  // Root-child first, node last.
  const chain: LexicalNode[] = [];
  for (
    let current: LexicalNode | null = node;
    current !== null && !$isRootNode(current);
    current = current.getParent()
  ) {
    chain.unshift(current);
  }
  if (chain.length === 0) return null;

  const path: number[] = [];
  let found: LexicalNode | null = null;
  for (let depth = 0; depth < chain.length; depth++) {
    // Root is always a container; below it, this level is only addressable if
    // its parent's children are.
    if (depth > 0 && !isContainer(chain[depth - 1])) break;
    path.push(chain[depth].getIndexWithinParent());
    found = chain[depth];
  }
  return found ? { node: found, path } : null;
}

/** A stamped block is named by its id; an unstamped one by its path. */
const addressOf = ({ node, path }: LocatedBlock): string =>
  $getState(node, blockIdState) || formatAddress(path);

/** The `"\n\n"` `getTextContent()` adds after this child, if any. */
const joinAfter = (child: LexicalNode, index: number, count: number): number =>
  $isElementNode(child) && index !== count - 1 && !child.isInline()
    ? BLOCK_JOIN
    : 0;

/** Text before a point *within the node the point names*. */
function pointOffsetWithin(node: LexicalNode, point: PointType): number {
  if (point.type === "text") return point.offset;
  if (!$isElementNode(node)) return 0;
  // An element point's offset is a child index, not a character index.
  const children = node.getChildren();
  let offset = 0;
  for (let i = 0; i < Math.min(point.offset, children.length); i++) {
    offset += children[i].getTextContentSize() +
      joinAfter(children[i], i, children.length);
  }
  return offset;
}

/**
 * Character offset of `point` within `block.getTextContent()`.
 *
 * Walks the subtree accumulating text sizes rather than asking Lexical for a
 * selection's length, so the arithmetic matches `getTextContent()` — including
 * the blank line it inserts between non-inline children, which is what keeps
 * an offset inside the third list item honest.
 */
function offsetWithin(block: LexicalNode, point: PointType): number {
  const targetKey = point.getNode().getKey();
  let offset = 0;

  const walk = (node: LexicalNode): boolean => {
    if (node.getKey() === targetKey) {
      offset += pointOffsetWithin(node, point);
      return true;
    }
    if ($isElementNode(node)) {
      const children = node.getChildren();
      for (let i = 0; i < children.length; i++) {
        if (walk(children[i])) return true;
        offset += joinAfter(children[i], i, children.length);
      }
      return false;
    }
    offset += node.getTextContentSize();
    return false;
  };

  // A point outside the block cannot happen for a point we located the block
  // from; 0 is the honest answer if it ever does.
  return walk(block) ? offset : 0;
}

/** One end of a range, as an address plus an offset inside it. */
function capturePoint(point: PointType): SelectionPoint | null {
  const node = point.getNode();

  // A point on the root names a *gap between* blocks. Snap it to the block on
  // the side it fell, at that block's near edge.
  if ($isRootNode(node)) {
    const children = node.getChildren();
    if (children.length === 0) return null;
    const index = Math.min(point.offset, children.length - 1);
    const located = locateBlock(children[index]);
    if (!located) return null;
    return {
      id: addressOf(located),
      offset: point.offset > index ? located.node.getTextContentSize() : 0,
    };
  }

  const located = locateBlock(node);
  if (!located) return null;
  return { id: addressOf(located), offset: offsetWithin(located.node, point) };
}

/** Every addressable block the selection touches, in document order. */
function blocksOf(selection: BaseSelection): {
  ids: string[];
  truncated: boolean;
} {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const node of selection.getNodes()) {
    const located = locateBlock(node);
    if (!located) continue;
    const address = addressOf(located);
    if (seen.has(address)) continue;
    seen.add(address);
    ids.push(address);
  }
  const truncated = ids.length > MAX_SELECTION_BLOCKS;
  return {
    ids: truncated ? ids.slice(0, MAX_SELECTION_BLOCKS) : ids,
    truncated,
  };
}

/**
 * Capture the selection held by the active editor state.
 *
 * Must run inside a read (or an update). A collapsed caret is `null` rather
 * than an empty range: a caret is where the user is, not what they mean, and
 * saying so would only invite the model to "edit the selection".
 */
export function $captureSelection(): CapturedSelection | null {
  const selection = $getSelection();
  if (selection === null) return null;

  if ($isRangeSelection(selection)) {
    if (selection.isCollapsed()) return null;
    const anchor = capturePoint(selection.anchor);
    const focus = capturePoint(selection.focus);
    if (!anchor || !focus) return null;
    const text = selection.getTextContent();
    const clipped = text.length > MAX_SELECTION_TEXT;
    const { ids, truncated } = blocksOf(selection);
    return {
      kind: "text",
      text: clipped ? text.slice(0, MAX_SELECTION_TEXT) : text,
      anchor,
      focus,
      ids,
      ...(clipped || truncated ? { truncated: true } : {}),
    };
  }

  // Node and table selections alike: whole blocks, no range inside one.
  const { ids, truncated } = blocksOf(selection);
  if (ids.length === 0) return null;
  return { kind: "blocks", ids, ...(truncated ? { truncated: true } : {}) };
}

/**
 * The same, from outside a read — what both callers actually use.
 *
 * **The addresses are only as good as the state the model reads.** A `blk_…`
 * id survives anything; a `b4` fallback names a position in *this* editor's
 * tree, and the Copilot's readers prefer a pending proposal over the live
 * editor when one exists (see `copilotAgentExecutors`). If a proposal has
 * inserted or removed blocks above the selection, an unstamped fallback can
 * therefore point one block off. That is the price of not stamping on read —
 * a read that stamped would change `stateHash` and refuse the next write — and
 * it is why the prompt tells the model to `read_blocks` before editing rather
 * than to trust the address blind.
 */
export function captureSelection(
  editor: LexicalEditor | null | undefined,
): CapturedSelection | null {
  if (!editor) return null;
  return editor.read(() => $captureSelection());
}
