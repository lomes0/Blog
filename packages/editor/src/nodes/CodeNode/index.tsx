import { CodeNode as LexicalCodeNode, SerializedCodeNode } from "@lexical/code";
import type {
  DOMExportOutput,
  EditorConfig,
  ElementDOMSlot,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  Spread,
} from "lexical";
import { setDOMUnmanaged } from "lexical";
import {
  buildActiveLine,
  buildCardBody,
  buildCardFooter,
  buildCardHeader,
  CAN_COLLAPSE_CLASS,
  CARD_BODY_CLASS,
  CARD_HEAD_CLASS,
  HAS_FOOT_CLASS,
  HAS_HEAD_CLASS,
  setCardFilename,
  suppressesCardChrome,
} from "./card";
import { lineCountExceedsCollapseThreshold } from "./collapse";

/**
 * Extended SerializedCodeNode with width property.
 *
 * Must be a `type` (via `Spread`), not an `interface`. Lexical's
 * `KlassConstructor` requires `static importJSON` to accept
 * `SerializedLexicalNode & Record<string, unknown>`, and an interface — unlike
 * a type alias — gets no implicit index signature, so it is not assignable to
 * `Record<string, unknown>`. Declared as an interface this fails to satisfy
 * `KlassConstructor` and takes the `config.tsx` replacement entry down with it.
 */
export type SerializedCodeNodeWithWidth = Spread<{
  width?: string; // e.g., "80%", "600px", "100%"
  wrap?: boolean; // word-wrap (soft wrap) toggle
  filename?: string; // the tab label when this block is a file in a snippet
}, SerializedCodeNode>;

/**
 * Custom CodeNode that renders robust line numbers for exported (view-mode)
 * HTML.
 *
 * In the editor, `@lexical/code`'s `registerCodeHighlighting` keeps a
 * `data-gutter` attribute (e.g. "1\n2\n3") in sync on the <code> element, and a
 * single absolutely-positioned `::before` renders all line numbers from it.
 * That attribute is a runtime-only concern, so exported static HTML never has
 * it. Here we compute and inject the same `data-gutter` attribute during
 * export so view mode gets identical, gap-free line numbers that also handle
 * empty lines and auto-size with the digit count.
 *
 * Also supports dynamic width adjustment via the __width property.
 *
 * Since docs/plans/archive/code-block-card.md the block also **is** its own
 * chrome: the language chip, filename, copy, word-wrap and collapse controls
 * are children of this element rather than a layer floating over it, on both
 * surfaces. See `card.ts` for the DOM contract and why the two overlays it
 * replaced could go.
 */
export class CodeNode extends LexicalCodeNode {
  __width?: string;
  __wrap?: boolean;
  /**
   * The file's name, when this block is one file of a `CodeSnippetNode`
   * (docs/plans/archive/haklex-reprise.md §6.2). Undefined everywhere else, and
   * it serializes only when set.
   *
   * **On the file rather than on the snippet, deliberately.** The alternative
   * is an array of names on the wrapper, indexed by child position — and the
   * things that reorder a snippet's children are `move_block` and
   * `delete_block` in `src/lib/content-bridge/ops.ts`, which splice the
   * children array and have never heard of this node. A parallel array would
   * come out of the first agent reorder attached to the wrong files, silently.
   * A name carried by the node it names cannot drift from it.
   */
  __filename?: string;
  static getType(): string {
    return "code";
  }

  static clone(node: CodeNode): CodeNode {
    const clonedNode = new CodeNode(node.__language, node.__key);
    clonedNode.__width = node.__width;
    clonedNode.__wrap = node.__wrap;
    clonedNode.__filename = node.__filename;
    return clonedNode;
  }

  constructor(language?: string | null | undefined, key?: NodeKey) {
    super(language, key);
  }

  /**
   * Get the width of the code block.
   */
  getWidth(): string | undefined {
    const self = this.getLatest();
    return self.__width;
  }

  /**
   * Set the width of the code block.
   * @param width - Width value (e.g., "80%", "600px", "100%")
   */
  setWidth(width: string | undefined): void {
    const self = this.getWritable();
    self.__width = width;
  }

  /**
   * Get whether the code block uses word-wrap (soft wrap).
   */
  getWrap(): boolean {
    const self = this.getLatest();
    return self.__wrap ?? false;
  }

  /**
   * Set whether the code block uses word-wrap (soft wrap).
   */
  setWrap(wrap: boolean): void {
    const self = this.getWritable();
    self.__wrap = wrap;
  }

  /**
   * Get the file name this block carries as a snippet file, if any.
   */
  getFilename(): string | undefined {
    return this.getLatest().__filename;
  }

  /**
   * Set (or, with an empty string, clear) the file name.
   */
  setFilename(filename: string | undefined): void {
    const self = this.getWritable();
    self.__filename = filename || undefined;
  }

  /** Attributes the block carries on both surfaces, editor and reader alike. */
  private applyBlockAttrs(element: HTMLElement): void {
    if (this.__width) {
      element.style.width = this.__width;
    }
    if (this.__wrap) {
      element.classList.add("code-wrap");
    }
    // The name only; inside a snippet the caption element around it is
    // assembled by `CodeSnippetNode.exportDOM`, which is the one that can wrap
    // this element without replacing it with its own ancestor. The card header
    // reads the same value for a standalone block.
    if (this.__filename) {
      element.setAttribute("data-filename", this.__filename);
    }
  }

  /** Whether this block is long enough to be worth a collapse control. */
  private canCollapse(): boolean {
    const text = this.getTextContent();
    return lineCountExceedsCollapseThreshold(
      text.length === 0 ? 1 : text.split("\n").length,
    );
  }

  /**
   * The card, in the editor (docs/plans/archive/code-block-card.md §2).
   *
   * `super.createDOM` still returns the `<code>` element, so it is still what
   * `editor.getElementByKey` hands back and still what `@lexical/code`'s
   * `updateCodeGutter` writes `data-gutter` onto — the card is that element
   * with children, not a wrapper around it. Wrapping would have moved the key
   * onto a `<div>` and silently broken the line-number gutter, whose `::before`
   * can only read an attribute of its own element.
   *
   * The header, footer and caret wash sit outside the slot {@link getDOMSlot}
   * points at, which is what keeps reconciliation off them, and are marked
   * `setDOMUnmanaged` so the mutation observer does not evict them as unknown
   * children of an editable node.
   */
  createDOM(config: EditorConfig): HTMLElement {
    const element = super.createDOM(config);
    this.applyBlockAttrs(element);

    const chromeless = suppressesCardChrome(this.getParent()?.getType());
    if (!chromeless) {
      const header = buildCardHeader({
        language: this.getLanguage() ?? undefined,
        filename: this.__filename,
        interactive: true,
      });
      element.classList.add(HAS_HEAD_CLASS);
      element.append(header);
      setDOMUnmanaged(header, { captureSelection: true });
    }

    element.append(buildCardBody());

    if (!chromeless) {
      if (this.canCollapse()) element.classList.add(CAN_COLLAPSE_CLASS);
      const activeLine = buildActiveLine();
      element.append(activeLine);
      setDOMUnmanaged(activeLine);
      const footer = buildCardFooter();
      element.classList.add(HAS_FOOT_CLASS);
      element.append(footer);
      setDOMUnmanaged(footer, { captureSelection: true });
    }

    return element;
  }

  /**
   * Children reconcile into the card's body, never into the card.
   *
   * The same two calls `CodeSnippetNode` makes, and for the same reason:
   * without this the reconciler would splice text and line breaks in beside the
   * header and count it as a child of the code block.
   */
  getDOMSlot(element: HTMLElement): ElementDOMSlot<HTMLElement> {
    const body = element.querySelector<HTMLElement>(
      `:scope > .${CARD_BODY_CLASS}`,
    );
    return super.getDOMSlot(element).withElement(body ?? element);
  }

  /**
   * Override updateDOM to update width styling when it changes.
   */
  updateDOM(
    prevNode: this,
    dom: HTMLElement,
    config: EditorConfig,
  ): boolean {
    const isUpdated = super.updateDOM(prevNode, dom, config);

    // Update width if it changed
    if (prevNode.__width !== this.__width) {
      if (this.__width) {
        dom.style.width = this.__width;
      } else {
        dom.style.width = "";
      }
    }

    // Update word-wrap class if it changed
    if (prevNode.__wrap !== this.__wrap) {
      dom.classList.toggle("code-wrap", !!this.__wrap);
    }

    // Update the snippet file name if it changed
    if (prevNode.__filename !== this.__filename) {
      if (this.__filename) {
        dom.setAttribute("data-filename", this.__filename);
      } else {
        dom.removeAttribute("data-filename");
      }
      const header = dom.querySelector<HTMLElement>(
        `:scope > .${CARD_HEAD_CLASS}`,
      );
      // Patched rather than rebuilt: the header holds the element
      // `CodeActionMenuPlugin` portals the language `Select` into, and
      // replacing it would blink the dropdown out on every keystroke of a
      // rename.
      if (header) setCardFilename(header, this.__filename);
    }

    // A block moved into or out of a snippet or a layout column changes who
    // draws its heading (see `suppressesCardChrome`). Rare, and the moved node
    // is written to when it is reparented, so this reconciles rather than
    // waiting for a remount.
    const chromeless = suppressesCardChrome(this.getParent()?.getType());
    if (chromeless === dom.classList.contains(HAS_HEAD_CLASS)) {
      return true;
    }

    return isUpdated;
  }

  /**
   * Build the line-number gutter string (e.g. "1\n2\n3") for an exported code
   * element by counting its direct line-break children. Mirrors the attribute
   * maintained by `registerCodeHighlighting` in the editor.
   *
   * Must run **before** the children move into the card's body, which is why
   * `exportDOM` calls it first: after the move they are no longer `:scope > br`.
   */
  private buildGutterAttr(element: HTMLElement): string {
    const lineBreaks = element.querySelectorAll(":scope > br").length;
    const lineCount = lineBreaks + 1;
    let gutter = "1";
    for (let i = 2; i <= lineCount; i++) {
      gutter += "\n" + i;
    }
    return gutter;
  }

  /**
   * The same card, for `/view`, print and the export bundles (§4.2).
   *
   * `after` rather than `append`, because the gutter has to be counted while
   * the children are still direct children — and because a card is built by
   * putting things *inside* the element, which `after` can do and which the
   * "cannot replace a node with its own ancestor" problem in
   * `CodeSnippetNode.exportDOM` does not apply to.
   *
   * The reader's header is static HTML: no `Select`, no word-wrap toggle, and
   * copy and collapse work only because something delegates over
   * `data-code-action` (`actions.ts`). Whether it carries a collapse control at
   * all is decided here, from the line count, because the reader has no
   * `ResizeObserver` and needs none — neither `__wrap` nor `__width` can change
   * after export.
   */
  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const output = super.exportDOM(editor);

    return {
      ...output,
      after: (element) => {
        if (element instanceof HTMLElement) {
          const gutter = this.buildGutterAttr(element);
          const body = buildCardBody();
          body.append(...Array.from(element.childNodes));

          if (!suppressesCardChrome(this.getParent()?.getType())) {
            element.classList.add(HAS_HEAD_CLASS);
            if (lineCountExceedsCollapseThreshold(gutter.split("\n").length)) {
              element.classList.add(CAN_COLLAPSE_CLASS);
            }
            element.append(buildCardHeader({
              language: this.getLanguage() ?? undefined,
              filename: this.__filename,
              interactive: false,
            }));
          }
          element.append(body);

          // Inject line numbers for static (view-mode) rendering.
          element.setAttribute("data-gutter", gutter);
          this.applyBlockAttrs(element);

          return element;
        }
        // Call parent's after callback if it exists
        if (output.after) {
          return output.after(element);
        }
        return element as HTMLElement | Text | null | undefined;
      },
    };
  }

  /**
   * Import from serialized JSON.
   */
  static importJSON(serializedNode: SerializedCodeNodeWithWidth): CodeNode {
    const node = $createCodeNode(serializedNode.language)
      .updateFromJSON(serializedNode);

    // Restore width if present
    if (serializedNode.width) {
      node.setWidth(serializedNode.width);
    }

    // Restore word-wrap if present
    if (serializedNode.wrap) {
      node.setWrap(serializedNode.wrap);
    }

    // Restore the snippet file name if present
    if (serializedNode.filename) {
      node.setFilename(serializedNode.filename);
    }

    return node;
  }

  /**
   * Export to serialized JSON.
   */
  exportJSON(): SerializedCodeNodeWithWidth {
    return {
      ...super.exportJSON(),
      width: this.__width,
      wrap: this.__wrap,
      filename: this.__filename,
    };
  }

  // No `static importDOM` override. Upstream `CodeNode` declares its DOM
  // conversions inside `$config()` rather than as a static method since 0.44,
  // and Lexical only installs that config onto a class which does NOT own a
  // static `importDOM` (`getStaticNodeConfig`). Declaring one here — even a
  // passthrough to `LexicalCodeNode.importDOM()`, which no longer exists —
  // would suppress the inherited `$config()` conversions and silently break
  // pasting <pre>/<code>/GitHub code tables.
}

/**
 * Helper function to create a CodeNode instance.
 */
export function $createCodeNode(
  language?: string | null | undefined,
): CodeNode {
  return new CodeNode(language);
}

/**
 * Type guard to check if a node is a CodeNode.
 */
export function $isCodeNode(
  node: LexicalNode | null | undefined,
): node is CodeNode {
  return node instanceof CodeNode;
}
