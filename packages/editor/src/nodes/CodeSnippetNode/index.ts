/**
 * A multi-file code snippet (docs/plans/archive/haklex-reprise.md §6.2).
 *
 * An `ElementNode` whose children are ordinary `code` nodes, one per file, with
 * a tab strip choosing which one is on screen. Everything that matters about it
 * follows from that one sentence:
 *
 * ### The files are real Lexical children, which is the whole point
 *
 * Not a serialized blob, not a nested editor, not a parallel array — the actual
 * `children` array. So `code-snippet` joins `BLOCK_CONTAINERS` with the
 * **default** accessor in `src/lib/content-bridge/containers.ts` and needs no
 * `NESTED_CHILDREN` arm at all: a file is `b7.1`, and the `code` codec that
 * already existed reads and writes it with nothing new. That claim is not
 * assumed, it is asserted — `src/lib/content-bridge/__tests__/codeSnippet.test.ts`
 * pins that the seam's default path is what serves this node.
 *
 * It also means phase 2's tokenizer highlights each file with no new path:
 * `registerCodeHighlighting` transforms every `code` node in the document, and
 * a file inside a snippet is one. `__tests__/codeSnippet.test.ts` asserts the
 * `code-highlight` children arrive, with empty `style`, inside a snippet too.
 *
 * ### The filename lives on the file, not on the snippet
 *
 * `CodeNode.__filename`, beside the `__width` and `__wrap` it already carries.
 * The alternative — an array of names on the wrapper, indexed by child
 * position — desynchronises the first time anything reorders or deletes a
 * child, and the things that reorder children are `move_block` and
 * `delete_block` in `content-bridge/ops.ts`, which splice the array and know
 * nothing about this node. A name carried by the node it names cannot drift.
 *
 * `active` is an index on the wrapper, and is the exception that proves it: the
 * worst a stale one can do is open the snippet on a different tab, so it is
 * clamped on read rather than maintained. A filename attached to the wrong file
 * would be a lie about the content.
 *
 * ### It is block-level, like the nested doc and for the same reason
 *
 * `ElementNode` is a block by construction — there is no inline decorator to
 * get wrapped in a paragraph, which is the trap §2.4 records and which puts a
 * sticky note's blocks beyond every address. `__tests__/codeSnippet.test.ts`
 * asserts the placement through a real load anyway, because the phase is worth
 * nothing if that is not true.
 */
import type {
  DOMExportOutput,
  ElementDOMSlot,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedElementNode,
  Spread,
} from "lexical";
import { ElementNode, setDOMUnmanaged } from "lexical";
import {
  CODE_SNIPPET_TYPE,
  SNIPPET_CLASS,
  SNIPPET_FILE_CLASS,
  SNIPPET_FILENAME_CLASS,
  SNIPPET_FILES_CLASS,
  SNIPPET_TABS_CLASS,
} from "./utils";

/** Re-exported so the type string reads off the class's own module. */
export { CODE_SNIPPET_TYPE } from "./utils";

export type SerializedCodeSnippetNode = Spread<
  {
    /** Which file the tab strip opens on, 0-based. Clamped, never trusted. */
    active: number;
  },
  SerializedElementNode
>;

export class CodeSnippetNode extends ElementNode {
  __active: number;

  static getType(): string {
    return CODE_SNIPPET_TYPE;
  }

  static clone(node: CodeSnippetNode): CodeSnippetNode {
    return new CodeSnippetNode(node.__active, node.__key);
  }

  static importJSON(json: SerializedCodeSnippetNode): CodeSnippetNode {
    return $createCodeSnippetNode(json.active).updateFromJSON(json);
  }

  /**
   * No HTML shape to recognise on paste.
   *
   * A `<div class="code-snippet">` in pasted HTML would have to be
   * reconstructed file by file, and the files themselves already convert:
   * `@lexical/code`'s own `<pre>` conversion turns each into a code block, so
   * a pasted snippet degrades into its files rather than into nothing.
   */
  static importDOM(): null {
    return null;
  }

  constructor(active: number = 0, key?: NodeKey) {
    super(key);
    this.__active = active;
  }

  exportJSON(): SerializedCodeSnippetNode {
    return {
      ...super.exportJSON(),
      active: this.__active,
      type: CODE_SNIPPET_TYPE,
      version: 1,
    };
  }

  createDOM(): HTMLElement {
    const dom = document.createElement("div");
    dom.className = SNIPPET_CLASS;
    dom.setAttribute("data-active", String(this.getActiveIndex() + 1));

    // The strip is React, portaled in by `CodeSnippetPlugin` — the same
    // mechanism a decorator's `decorate()` output reaches the DOM by, done by
    // hand because an element node has no `decorate()`. It is not editable
    // content and must never be reconciled, hence the flags here and the slot
    // below.
    //
    // `setDOMUnmanaged` is the one that keeps the strip alive, and
    // `contentEditable` is no substitute for it: the mutation observer walks up
    // from a mutation's target looking for the nearest *managed* node, and
    // without the marker that walk runs straight past this host to the
    // snippet's keyed element — at which point React's freshly portalled tabs
    // are foreign DOM under a managed node and get evicted
    // (`LexicalMutations.ts`, `parentDOM.removeChild(addedDOM)`). React is not
    // told, so its next update or unmount removes a child that is no longer
    // there and throws `NotFoundError: The node to be removed is not a child of
    // this node`, which the editor's error boundary catches as a whole-pane
    // failure. `captureSelection` for the reason `CodeNode`'s header passes it:
    // the strip holds a focusable `Select` that owns its own caret.
    const tabs = document.createElement("div");
    tabs.className = SNIPPET_TABS_CLASS;
    tabs.contentEditable = "false";
    setDOMUnmanaged(tabs, { captureSelection: true });

    const files = document.createElement("div");
    files.className = SNIPPET_FILES_CLASS;

    dom.append(tabs, files);
    return dom;
  }

  /**
   * Children reconcile into the files element, never into the wrapper.
   *
   * Without this the reconciler would splice code blocks in beside the tab
   * strip and count it as a child — the strip would be treated as node DOM,
   * and the first insert would put a file before it.
   */
  getDOMSlot(element: HTMLElement): ElementDOMSlot<HTMLElement> {
    const files = element.querySelector<HTMLElement>(
      `:scope > .${SNIPPET_FILES_CLASS}`,
    );
    return super.getDOMSlot(element).withElement(files ?? element);
  }

  updateDOM(_prevNode: this, dom: HTMLElement): boolean {
    // Set unconditionally rather than diffed: `getActiveIndex` is clamped
    // against the child count, so it can change when only the children did.
    dom.setAttribute("data-active", String(this.getActiveIndex() + 1));
    return false;
  }

  /**
   * The reader gets **every** file, each captioned with its name.
   *
   * Tabs are an editing affordance and exported HTML has no JavaScript to run
   * them; hiding four files behind a strip that cannot be clicked would publish
   * three of them as nothing at all. Same call `NestedDocNode.exportDOM` makes
   * for a collapsed card: only the editing surface collapses.
   *
   * The caption is assembled here rather than in `CodeNode.exportDOM`, because
   * that one cannot wrap its own element — by the time its `after` callback
   * runs, the element is already in the tree and moving it into a wrapper it
   * then returns would ask the DOM to replace a node with its own ancestor.
   * `CodeNode` writes `data-filename`; this reads it.
   */
  exportDOM(_editor: LexicalEditor): DOMExportOutput {
    const element = document.createElement("div");
    element.className = SNIPPET_CLASS;
    element.setAttribute("data-active", String(this.getActiveIndex() + 1));
    return {
      element,
      append: (child) => {
        if (child instanceof DocumentFragment) captionFiles(child);
        element.append(child);
      },
    };
  }

  /** A snippet with no files is furniture around nothing; Lexical drops it. */
  canBeEmpty(): false {
    return false;
  }

  canIndent(): false {
    return false;
  }

  /** The open file, clamped — a stored index outlives the file it pointed at. */
  getActiveIndex(): number {
    const self = this.getLatest();
    const last = self.getChildrenSize() - 1;
    if (last < 0) return 0;
    return Math.min(Math.max(self.__active, 0), last);
  }

  setActiveIndex(index: number): this {
    const self = this.getWritable();
    self.__active = Math.max(0, Math.trunc(index));
    return self;
  }
}

/** Wrap each exported file in a figure carrying its filename. */
function captionFiles(fragment: DocumentFragment): void {
  for (const child of Array.from(fragment.children)) {
    const name = child.getAttribute("data-filename");
    const file = document.createElement("div");
    file.className = SNIPPET_FILE_CLASS;
    // Swap first, then adopt: `replaceWith` needs the child still in the
    // fragment, and appending it afterwards moves it into the wrapper.
    child.replaceWith(file);
    if (name) {
      const label = document.createElement("div");
      label.className = SNIPPET_FILENAME_CLASS;
      label.textContent = name;
      file.append(label);
    }
    file.append(child);
  }
}

export function $createCodeSnippetNode(active: number = 0): CodeSnippetNode {
  return new CodeSnippetNode(active);
}

export function $isCodeSnippetNode(
  node: LexicalNode | null | undefined,
): node is CodeSnippetNode {
  return node instanceof CodeSnippetNode;
}
