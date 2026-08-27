/**
 * `NestedDocNode`, through a real editor over the real registry
 * (docs/plans/archive/haklex-reprise.md §6.1, and §10.3's rule that a node spec which
 * never builds an editor is not testing registration).
 *
 * Two claims are load-bearing and neither is visible by reading the class:
 *
 *   - **It stays block-level across a load.** `StickyNode` is an inline
 *     decorator, so Lexical wraps a root-level one in a paragraph — which puts
 *     its contents beyond any address, because `paragraph` is not an
 *     addressable container and must not become one (§2.4). If a nested doc
 *     were wrapped the same way, the whole phase would buy nothing. So the
 *     placement is asserted after a round trip and after an insert, not
 *     inferred from `isInline()` returning false.
 *   - **Its interior serializes at `doc.root`.** No `editorState` level, unlike
 *     the sticky and the canvas, because `exportJSON` writes
 *     `getEditorState().toJSON()`. `src/lib/content-bridge/containers.ts`'s arm
 *     is the other half of that single decision, and the two are pinned against
 *     each other in `src/lib/content-bridge/__tests__/nestedDoc.test.ts`.
 */
import { createHeadlessEditor } from "@lexical/headless";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $insertNodes,
} from "lexical";
import { editorConfig } from "@/editor/config";
import { nestedEditorConfig } from "@/editor/nodes/nestedConfig";
import {
  $createNestedDocNode,
  NESTED_DOC_TYPE,
  NestedDocNode,
} from "@/editor/nodes/NestedDocNode";

type Json = Record<string, unknown>;

const newEditor = () =>
  createHeadlessEditor({
    namespace: editorConfig.namespace,
    nodes: editorConfig.nodes,
    onError: (error) => {
      throw error;
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

const paragraph = (value: string) => ({
  type: "paragraph",
  version: 1,
  direction: null,
  format: "",
  indent: 0,
  children: [text(value)],
});

/** A stored document whose second block is a nested doc carrying every field. */
const STATE = {
  root: {
    type: "root",
    version: 1,
    direction: null,
    format: "",
    indent: 0,
    children: [
      paragraph("Before the aside."),
      {
        type: NESTED_DOC_TYPE,
        version: 1,
        title: "Working notes",
        open: false,
        $: { blockId: "id_nested_doc" },
        doc: {
          root: {
            type: "root",
            version: 1,
            direction: null,
            format: "",
            indent: 0,
            children: [
              {
                type: "heading",
                tag: "h3",
                version: 1,
                direction: null,
                format: "",
                indent: 0,
                children: [text("Scratch")],
              },
              paragraph("aside one"),
            ],
          },
        },
      },
      paragraph("After the aside."),
    ],
  },
};

const roundTrip = (state: unknown): Json => {
  const editor = newEditor();
  editor.setEditorState(editor.parseEditorState(JSON.stringify(state)));
  return editor.getEditorState().toJSON() as unknown as Json;
};

const rootChildren = (out: Json): Json[] =>
  (out.root as { children: Json[] }).children;

const interior = (node: Json): Json[] =>
  ((node.doc as { root: { children: Json[] } }).root.children);

const textOf = (node: Json): string =>
  ((node.children ?? []) as Json[]).map((child) => String(child.text ?? ""))
    .join("");

describe("a stored nested doc survives a load", () => {
  it("stays a direct child of the root — it is not wrapped in a paragraph", () => {
    // The whole phase in one assertion. A sticky in this position comes back as
    // `["paragraph", "paragraph", "paragraph"]`; see the round-trip block in
    // src/lib/content-bridge/__tests__/containers.test.ts.
    expect(rootChildren(roundTrip(STATE)).map((node) => node.type)).toEqual([
      "paragraph",
      NESTED_DOC_TYPE,
      "paragraph",
    ]);
  });

  it("keeps its title, its open state and its node state", () => {
    const node = rootChildren(roundTrip(STATE))[1];
    expect(node).toMatchObject({ title: "Working notes", open: false });
    expect(node.$).toEqual({ blockId: "id_nested_doc" });
  });

  it("keeps the interior, block types and all", () => {
    const blocks = interior(rootChildren(roundTrip(STATE))[1]);
    expect(blocks.map((block) => block.type)).toEqual(["heading", "paragraph"]);
    expect(blocks.map(textOf)).toEqual(["Scratch", "aside one"]);
    expect(blocks[0].tag).toBe("h3");
  });

  it("writes the interior at `doc.root`, with no `editorState` level", () => {
    const node = rootChildren(roundTrip(STATE))[1];
    expect(Object.keys(node.doc as object)).toEqual(["root"]);
  });

  it("leaves the blocks around it alone", () => {
    const children = rootChildren(roundTrip(STATE));
    expect([textOf(children[0]), textOf(children[2])]).toEqual([
      "Before the aside.",
      "After the aside.",
    ]);
  });

  it("does not report an error — a swallowed parse failure would be silent", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      roundTrip(STATE);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });
});

describe("an empty nested doc", () => {
  it("round-trips as an empty interior rather than losing the block", () => {
    const empty = {
      root: {
        ...STATE.root,
        children: [{ type: NESTED_DOC_TYPE, version: 1, title: "", open: true, doc: { root: { type: "root", version: 1, direction: null, format: "", indent: 0, children: [] } } }],
      },
    };
    const node = rootChildren(roundTrip(empty))[0];
    expect(node.type).toBe(NESTED_DOC_TYPE);
    expect(interior(node)).toEqual([]);
  });
});

describe("inserting one", () => {
  /** What `NestedDocPlugin` does, minus the command plumbing. */
  const insert = () => {
    const editor = newEditor();
    editor.update(
      () => {
        const first = $createParagraphNode();
        first.append($createTextNode("hi"));
        $getRoot().append(first);
        first.selectEnd();
        $insertNodes([$createNestedDocNode({ title: "Fresh" })]);
      },
      { discrete: true },
    );
    return editor.getEditorState().toJSON() as unknown as Json;
  };

  it("lands as a block of its own, not inside the paragraph", () => {
    const children = rootChildren(insert());
    const found = children.filter((node) => node.type === NESTED_DOC_TYPE);
    expect(found).toHaveLength(1);
    expect(found[0].title).toBe("Fresh");
    // Nothing anywhere below the top level — which is what a `$wrapNodeInElement`
    // like StickyPlugin's would produce.
    expect(JSON.stringify(children.filter((n) => n.type === "paragraph")))
      .not.toContain(NESTED_DOC_TYPE);
  });

  it("starts open, with an empty interior", () => {
    const found = rootChildren(insert()).find((n) =>
      n.type === NESTED_DOC_TYPE
    )!;
    expect(found.open).toBe(true);
    expect(interior(found)).toEqual([]);
  });
});

describe("the recursion guard", () => {
  it("is not registered on the nested editor's own node set", () => {
    // A container that can hold itself recurses without bound on render and on
    // serialization. `nestedConfig.tsx` says so; this is the machine-checked
    // half of that sentence.
    expect(nestedEditorConfig.nodes).not.toContain(NestedDocNode);
    const nested = createHeadlessEditor({
      namespace: nestedEditorConfig.namespace,
      nodes: nestedEditorConfig.nodes,
      onError: (error) => {
        throw error;
      },
    });
    expect(nested.hasNodes([NestedDocNode])).toBe(false);
  });

  it("is registered on the document editor", () => {
    expect(newEditor().hasNodes([NestedDocNode])).toBe(true);
  });
});
