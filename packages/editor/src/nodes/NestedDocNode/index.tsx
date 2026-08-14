/**
 * A document inside a document (docs/plans/haklex-reprise.md §6.1).
 *
 * One nested editor, rendered as a titled card the author opens a dialog to
 * edit. Everything interesting about it is a consequence of two decisions:
 *
 * ### It is block-level, and that is the whole point
 *
 * `isInline()` returns `false`, so a nested doc is a direct child of the root
 * (or of a layout column, a details body, a table cell) and stays one across a
 * load. `StickyNode` is an inline decorator, which means Lexical wraps a
 * root-level sticky in a paragraph and `StickyPlugin` does the same on insert —
 * and `paragraph` is not an addressable container and must not become one (§2.4
 * gives the reason for images; it holds verbatim here). So a sticky's blocks are
 * unreachable by address no matter what `content-bridge/containers.ts` does.
 * A nested doc's are `b7.1`, `b7.2`, exactly like a layout column's, and
 * `__tests__/nestedDoc.test.ts` pins that placement through a real load rather
 * than trusting this comment.
 *
 * ### Its children live at `doc.root.children`
 *
 * `exportJSON` writes `doc: this.__doc.getEditorState().toJSON()` — a
 * `SerializedEditorState`, which is `{ root }`, rather than the
 * `SerializedEditor` (`{ editorState: { root } }`) that `StickyNode` and
 * `CanvasNode` write by calling `editor.toJSON()`. `SerializedEditor` is a
 * one-member wrapper carrying nothing we store, and the shallower spelling is
 * the one the plan's `childrenAt("doc", "root")` sketch declares. The arm in
 * `content-bridge/containers.ts` and this method are the two halves of that
 * single fact and must be changed together.
 *
 * ### What may not go inside it
 *
 * The nested editor runs on `nestedEditorConfig`, which does not register
 * `sticky`, `canvas`, `kanban`, `attachment`, `page-break` — or `nested-doc`
 * itself, which would recurse without bound on render and serialization. The
 * block IR can author a kanban and an attachment, so that exclusion is a live
 * data-loss hazard rather than a theoretical one, and it is refused *at the
 * bridge* (`containers.ts`'s `findUnregisterable`) before a write is ever
 * stored. `importJSON` below still swallows a parse failure the way `StickyNode`
 * does, so nothing here would say a word if that guard were removed.
 */
import type {
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  NodeKey,
  SerializedEditorState,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import { $getRoot, createEditor, DecoratorNode, isHTMLElement } from "lexical";
import { $generateHtmlFromNodes } from "@lexical/html";
import { JSX } from "react";
import { nestedEditorConfig } from "../nestedConfig";
import NestedDocComponent from "./NestedDocComponent";
import { NESTED_DOC_TYPE } from "./utils";

/**
 * Re-exported so callers reach the class and its type string from one path.
 * It is *declared* in `./utils` — see the note there on the import cycle a
 * decorator's component closes. `scripts/check-codecs.mjs` resolves either
 * spelling, so `getType()` may keep returning the constant.
 */
export { NESTED_DOC_TYPE };

export interface NestedDocPayload {
  title?: string;
  open?: boolean;
  /** A previously serialized interior — a reopened document, or a paste. */
  doc?: SerializedEditorState;
}

export type SerializedNestedDocNode = Spread<
  {
    title: string;
    /** Whether the card shows a preview of its contents or only its title. */
    open: boolean;
    doc: SerializedEditorState;
  },
  SerializedLexicalNode
>;

export class NestedDocNode extends DecoratorNode<JSX.Element> {
  __title: string;
  __open: boolean;
  __doc: LexicalEditor;

  static getType(): string {
    return NESTED_DOC_TYPE;
  }

  static clone(node: NestedDocNode): NestedDocNode {
    return new NestedDocNode(
      node.__title,
      node.__open,
      node.__doc,
      node.__key,
    );
  }

  static importJSON(serializedNode: SerializedNestedDocNode): NestedDocNode {
    const { title, open, doc } = serializedNode;
    return $createNestedDocNode({ title, open, doc }).updateFromJSON(
      serializedNode,
    );
  }

  /** No HTML shape to recognise on paste; `exportDOM` is a one-way render. */
  static importDOM(): null {
    return null;
  }

  constructor(
    title: string = "",
    open: boolean = true,
    doc?: LexicalEditor,
    key?: NodeKey,
  ) {
    super(key);
    this.__title = title;
    this.__open = open;
    this.__doc = doc ?? createEditor(nestedEditorConfig);
  }

  exportJSON(): SerializedNestedDocNode {
    return {
      ...super.exportJSON(),
      title: this.__title,
      open: this.__open,
      // `SerializedEditorState`, not `SerializedEditor` — see the header, and
      // `NESTED_CHILDREN` in `src/lib/content-bridge/containers.ts`.
      doc: this.__doc.getEditorState().toJSON(),
      type: NESTED_DOC_TYPE,
      version: 1,
    };
  }

  createDOM(_config: EditorConfig, editor: LexicalEditor): HTMLElement {
    // `NestedEditor` reads `_parentEditor` on its first render to dispatch the
    // document-dirty command, so it has to be set before the card mounts.
    this.__doc._parentEditor = editor;
    const dom = document.createElement("div");
    dom.className = "nested-doc";
    return dom;
  }

  updateDOM(): false {
    return false;
  }

  /**
   * The interior rendered flat, for `/view`, print and export.
   *
   * A reader gets the whole document; only the editing surface collapses. The
   * `data-open` attribute carries the author's choice anyway, so a future
   * stylesheet could honour it without a serialization change.
   */
  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const { element } = super.exportDOM(editor);
    if (element && isHTMLElement(element)) {
      element.setAttribute("data-open", String(this.__open));
      // An inner wrapper, so `theme.css` can give the reader's card its chrome
      // without also painting a second border around the React card that
      // `decorate()` puts inside the same `.nested-doc` element while editing.
      const card = document.createElement("div");
      card.className = "nested-doc-card";
      if (this.__title) {
        const title = document.createElement("h4");
        title.className = "nested-doc-title";
        title.textContent = this.__title;
        card.appendChild(title);
      }
      const body = document.createElement("div");
      body.className = "nested-doc-body";
      this.__doc.getEditorState().read(() => {
        body.innerHTML = $generateHtmlFromNodes(this.__doc);
      });
      card.appendChild(body);
      element.appendChild(card);
    }
    return { element };
  }

  /**
   * Title and interior both, so the host document's text content — which is
   * what search and the word count read — does not stop at the card's edge.
   */
  getTextContent(): string {
    const body = this.__doc
      .getEditorState()
      .read(() => $getRoot().getTextContent());
    return [this.__title, body].filter(Boolean).join("\n");
  }

  /**
   * **The constraint the whole phase rests on.** An inline decorator gets
   * wrapped in a paragraph, and a paragraph is not addressable — see the header.
   */
  isInline(): false {
    return false;
  }

  getTitle(): string {
    return this.getLatest().__title;
  }

  setTitle(title: string): this {
    const self = this.getWritable();
    self.__title = title;
    return self;
  }

  getOpen(): boolean {
    return this.getLatest().__open;
  }

  setOpen(open: boolean): this {
    const self = this.getWritable();
    self.__open = open;
    return self;
  }

  toggleOpen(): this {
    return this.setOpen(!this.getOpen());
  }

  getDoc(): LexicalEditor {
    return this.getLatest().__doc;
  }

  decorate(): JSX.Element {
    return (
      <NestedDocComponent
        doc={this.__doc}
        nodeKey={this.getKey()}
        open={this.__open}
        title={this.__title}
      />
    );
  }
}

/**
 * No `$isNestedDocNode` here, unlike every other node module. The one caller
 * that needs to narrow is `NestedDocComponent`, and importing the class to do
 * it would close a cycle between the node and its component — so the narrowing
 * lives in `./utils` as `$asNestedDocNode`, structurally, the way
 * `CanvasNode/utils.ts` does it. One narrowing helper, not two.
 */
export function $createNestedDocNode(
  payload?: NestedDocPayload,
): NestedDocNode {
  const node = new NestedDocNode(payload?.title ?? "", payload?.open ?? true);
  if (payload?.doc) {
    const nested = node.__doc;
    try {
      const editorState = nested.parseEditorState(payload.doc);
      if (!editorState.isEmpty()) nested.setEditorState(editorState);
    } catch (error) {
      // Swallowed rather than thrown, for the reason `StickyNode` swallows it:
      // one unparseable interior must not take the whole document down. It
      // *should* be unreachable — the only way to get a node the nested config
      // cannot register in here is a write, and `content-bridge/containers.ts`
      // refuses those. If this ever fires, that guard is what to look at.
      console.error("NestedDocNode: could not parse the nested document", error);
    }
  }
  return node;
}
