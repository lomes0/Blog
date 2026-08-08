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
  $getRoot,
  $getState,
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
import { TABLE_NODES } from "@/editor/nodes/TableNode";
import { $createTableNodeWithDimensions } from "@lexical/table";

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
    expect(after["details-container"]).toMatchObject({
      open: true,
      editable: true,
    });
    expect(after["layout-container"]).toMatchObject({
      templateColumns: "1fr 1fr",
    });
  });
});

/**
 * The table registry, exercised the way the app actually uses it.
 *
 * This is the half the four `importJSON` tests it replaces could not see. They
 * called `importJSON` directly, so `LexicalNode`'s constructor guard —
 * `errorOnTypeKlassMismatch`, which fires on *every* construction and compares
 * the registered `klass` for a type against the class being constructed — never
 * ran against a live editor. They passed green while inserting a table threw:
 *
 *     Create node: Type table in node TableNode does not match registered node
 *     LegacyTableNode with the same type
 *
 * `@lexical/table` builds its nodes as `$applyNodeReplacement(new TableNode())`
 * — the `new` first, replacement second — so the guard fires before replacement
 * can run. Nothing but upstream's own class may hold the `"table"` /
 * `"tablecell"` slots. Insert through upstream's own creator, over the same
 * registry array the two configs spread, and that is unmissable.
 */
describe("a table can be inserted through @lexical/table's own creators", () => {
  const insert = () => {
    const editor = createHeadlessEditor({
      namespace: "serialization-table-insert",
      nodes: TABLE_NODES,
      onError: (e) => {
        throw e;
      },
    });
    editor.update(
      () => {
        // Routes through $createTableNode, $createTableRowNode and
        // $createTableCellNode — all three of upstream's
        // `$applyNodeReplacement(new …)` paths in one call.
        $getRoot().append($createTableNodeWithDimensions(2, 2, true));
      },
      { discrete: true },
    );
    const out = editor.getEditorState().toJSON() as unknown as {
      root: { children: Record<string, unknown>[] };
    };
    const table = out.root.children[0];
    const row = (table.children as Record<string, unknown>[])[0];
    const cell = (row.children as Record<string, unknown>[])[0];
    return { table, row, cell };
  };

  it("does not throw", () => {
    expect(insert).not.toThrow();
  });

  it("produces our subclasses, not upstream's", () => {
    const { table, row, cell } = insert();
    expect(table.type).toBe("blog-table");
    expect(cell.type).toBe("blog-tablecell");
    // Never renamed — upstream both owns and serializes this one.
    expect(row.type).toBe("tablerow");
  });

  it("the fields our subclasses model arrive defaulted, not undefined", () => {
    const { table, cell } = insert();
    expect(table).toMatchObject({ style: "", id: "" });
    expect(cell).toMatchObject({ style: "" });
  });
});

/**
 * What now happens to JSON carrying the pre-rename `"table"` / `"tablecell"`
 * type strings — asserted rather than assumed, because it is a decision.
 *
 * There is no alias class and no load-time migration. `docs/plans/
 * legacy-idb-retirement.md` §10 established that this data does not exist: all
 * 58 stored revisions carrying those strings were rewritten, every other JSON
 * column counted zero, every browser profile on the only machine that has ever
 * run this app held zero guest documents, and a filesystem scan found no export
 * bundles. §10.4 deleted the aliases on that evidence; `9c5d1b31` reintroduced
 * them without it, and that is what broke insertion.
 *
 * So the residual behaviour is graceful degradation, not support: upstream's
 * class holds the slot, so such JSON *loads* — text and structure survive — but
 * comes back under the old type without the id/style our subclasses model. This
 * test exists to make that visible, and to make a third reintroduction of an
 * alias class a deliberate act rather than an obvious-looking fix.
 */
describe("pre-rename table JSON degrades rather than throwing", () => {
  const LEGACY_STATE = {
    root: {
      type: "root",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: [
        {
          type: "table",
          version: 1,
          direction: "ltr",
          format: "center",
          indent: 0,
          $: { blockId: "id_table" },
          children: [
            {
              type: "tablerow",
              version: 1,
              direction: null,
              format: "",
              indent: 0,
              height: 33,
              children: [
                {
                  type: "tablecell",
                  version: 1,
                  direction: null,
                  format: "",
                  indent: 0,
                  headerState: 1,
                  colSpan: 1,
                  rowSpan: 1,
                  $: { blockId: "id_cell" },
                  children: [
                    {
                      type: "paragraph",
                      version: 1,
                      direction: null,
                      format: "",
                      indent: 0,
                      children: [text("cell")],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };

  const loadLegacy = () => {
    const editor = createHeadlessEditor({
      namespace: "serialization-legacy-table",
      nodes: TABLE_NODES,
      onError: (e) => {
        throw e;
      },
    });
    editor.setEditorState(editor.parseEditorState(JSON.stringify(LEGACY_STATE)));
    const out = editor.getEditorState().toJSON() as unknown as {
      root: { children: Record<string, unknown>[] };
    };
    const table = out.root.children[0];
    const row = (table.children as Record<string, unknown>[])[0];
    const cell = (row.children as Record<string, unknown>[])[0];
    return { table, cell };
  };

  it("loads without throwing", () => {
    expect(loadLegacy).not.toThrow();
  });

  it("stays on the old type strings — it is not upgraded", () => {
    const { table, cell } = loadLegacy();
    expect(table.type).toBe("table");
    expect(cell.type).toBe("tablecell");
  });

  it("keeps its content, chrome and node state", () => {
    const { table, cell } = loadLegacy();
    expect(table).toMatchObject({ format: "center", direction: "ltr" });
    expect(table.$).toEqual({ blockId: "id_table" });
    expect(cell.$).toEqual({ blockId: "id_cell" });
    expect(cell).toMatchObject({ headerState: 1 });
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
        const anyNode = node as unknown as {
          getChildren?: () => LexicalNode[];
        };
        anyNode.getChildren?.().forEach(collect);
      };
      $getRoot().getChildren().forEach(collect);
    });
    expect(ids).toEqual(
      expect.arrayContaining(ELEMENTS.map((type) => `id_${type}`)),
    );
  });
});
