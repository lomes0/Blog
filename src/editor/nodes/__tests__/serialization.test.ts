/**
 * That a stored node survives a load unchanged.
 *
 * `importJSON` is the *only* parse path — `$parseSerializedNodeImpl` calls it
 * and nothing afterwards restores anything the implementation forgot. So a
 * hand-rolled `importJSON` that never calls `updateFromJSON` silently drops
 * every base field: `format`, `indent` and `direction` on an element, and node
 * state (`$`) on anything.
 *
 * That was live. `details-container`, `details-summary`, `details-content`,
 * `layout-container` and `layout-item` all lost their alignment and indent on
 * every single load — measured, then fixed by routing each `importJSON`
 * through `updateFromJSON`.
 *
 * This spec covers the classes that import without a DOM. The `.tsx` node
 * modules cannot be parsed in this environment, so the *static* half of the
 * guarantee — that every node class spreads `super.exportJSON()` and delegates
 * in `importJSON` — is enforced across all of them by
 * `scripts/check-node-serialization.mjs` (`npm run check:nodes`).
 */
import { createHeadlessEditor } from "@lexical/headless";
import {
  $getState,
  $getRoot,
  createState,
  type Klass,
  type LexicalNode,
  type LexicalNodeReplacement,
} from "lexical";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeHighlightNode } from "@lexical/code";
import { LayoutContainerNode, LayoutItemNode } from "@/editor/nodes/LayoutNode";
import {
  DetailsContainerNode,
  DetailsContentNode,
  DetailsSummaryNode,
} from "@/editor/nodes/DetailsNode";

const blockId = createState("blockId", {
  parse: (v: unknown) => (typeof v === "string" ? v : ""),
});

const NODES = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  CodeHighlightNode,
  LayoutContainerNode,
  LayoutItemNode,
  DetailsContainerNode,
  DetailsContentNode,
  DetailsSummaryNode,
] as (Klass<LexicalNode> | LexicalNodeReplacement)[];

const newEditor = () =>
  createHeadlessEditor({
    namespace: "serialization",
    nodes: NODES,
    onError: (e) => {
      throw e;
    },
  });

const text = (value: string) => ({
  type: "text",
  version: 1,
  text: value,
  detail: 0,
  format: 0,
  mode: "normal",
  style: "",
});

/** An element carrying non-default chrome and a node-state stamp. */
const el = (
  type: string,
  extra: Record<string, unknown>,
  children: unknown[],
) => ({
  type,
  version: 1,
  direction: "ltr",
  format: "center",
  indent: 2,
  $: { blockId: `id_${type}` },
  ...extra,
  children,
});

const STATE = {
  root: {
    type: "root",
    version: 1,
    direction: null,
    format: "",
    indent: 0,
    children: [
      el("details-container", { open: true, editable: true }, [
        el("details-summary", { editable: true }, [text("Sum")]),
        el("details-content", {}, [el("paragraph", {}, [text("body")])]),
      ]),
      el("layout-container", { templateColumns: "1fr 1fr" }, [
        el("layout-item", {}, [el("paragraph", {}, [text("col")])]),
      ]),
    ],
  },
};

/** Round-trip the stored state through a real editor and flatten the result. */
function roundTrip(): Record<string, Record<string, unknown>> {
  const editor = newEditor();
  editor.setEditorState(editor.parseEditorState(JSON.stringify(STATE)));
  const out = editor.getEditorState().toJSON();

  const byType: Record<string, Record<string, unknown>> = {};
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (typeof n.type === "string" && !(n.type in byType)) byType[n.type] = n;
    if (Array.isArray(n.children)) n.children.forEach(walk);
  };
  walk(out.root);
  return byType;
}

const ELEMENTS = [
  "details-container",
  "details-summary",
  "details-content",
  "layout-container",
  "layout-item",
];

describe("custom element nodes survive a load", () => {
  const after = roundTrip();

  it.each(ELEMENTS)("%s keeps its alignment, indent and direction", (type) => {
    expect(after[type]).toMatchObject({
      format: "center",
      indent: 2,
      direction: "ltr",
    });
  });

  it.each(ELEMENTS)("%s keeps its node state", (type) => {
    expect(after[type].$).toEqual({ blockId: `id_${type}` });
  });

  it("keeps the fields the class models itself", () => {
    expect(after["details-container"]).toMatchObject({ open: true, editable: true });
    expect(after["layout-container"]).toMatchObject({ templateColumns: "1fr 1fr" });
  });
});

describe("node state is readable back through the state API", () => {
  it("is not merely present in JSON but attached to the node", () => {
    const editor = newEditor();
    editor.setEditorState(editor.parseEditorState(JSON.stringify(STATE)));
    const ids: string[] = [];
    editor.getEditorState().read(() => {
      const collect = (node: LexicalNode) => {
        const id = $getState(node, blockId);
        if (id) ids.push(id);
        const anyNode = node as unknown as { getChildren?: () => LexicalNode[] };
        anyNode.getChildren?.().forEach(collect);
      };
      $getRoot().getChildren().forEach(collect);
    });
    expect(ids).toEqual(
      expect.arrayContaining(ELEMENTS.map((type) => `id_${type}`)),
    );
  });
});
