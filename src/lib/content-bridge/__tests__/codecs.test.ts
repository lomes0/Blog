/**
 * Per-codec round-trips — the obligation §4.6.1 attaches to graduating a type.
 *
 * The hazard is that a clean IR silently drops what it does not model, so each
 * codec is exercised against a node carrying every optional field populated,
 * and asserted to give it back. Without this, "graduate a codec" is a way to
 * introduce data loss one type at a time.
 *
 * Phase 3 graduated the types the real corpus actually contains — divider
 * (1785 occurrences), layout (247) and attachment (164) — plus details and
 * kanban, which have none but are what "publish this session as an article"
 * and "turn these notes into a board" need in order to author anything.
 */
import { blockToNode, nodeToBlock } from "@/lib/content-bridge/blocks";
import { applyOps, stateFromBlocks } from "@/lib/content-bridge/ops";
import { outline } from "@/lib/content-bridge/outline";
import { blockSchema } from "@/lib/content-bridge/schema";
import { stateHash } from "@/lib/content-bridge/stateHash";
import type {
  SerializedNode,
  StoredState,
  WritableBlock,
} from "@/lib/content-bridge/types";

const kids = (node: SerializedNode): SerializedNode[] =>
  (node.children as SerializedNode[]) ?? [];

/**
 * The zod mirror must accept whatever the codec is fed.
 *
 * `schema.ts` is what the agents are handed; the codec is what runs. A field
 * one of them knows about and the other does not is invisible until an agent's
 * write is refused for naming a field the codec would have round-tripped
 * perfectly well — which is exactly how `attachment.expanded` came to work over
 * stdio and not in the browser (ai-surface-consolidation.md §2.1). Asserted on
 * the issue list rather than on `success` so a failure names the field.
 */
const accepted = (block: WritableBlock): void => {
  const result = blockSchema.safeParse(block);
  expect(result.success ? null : result.error.issues).toBeNull();
};

/** Build -> read -> build again. The second node must equal the first. */
const rebuilds = (block: WritableBlock) => {
  accepted(block);
  const node = blockToNode(block);
  const readBack = nodeToBlock(node);
  expect(readBack.type).not.toBe("opaque");
  expect(blockToNode(readBack as WritableBlock, node)).toEqual(node);
  return { node, readBack };
};

/**
 * One fully-populated block per authorable type.
 *
 * A `Record` keyed on `WritableBlock["type"]` rather than a list, so that
 * adding a type to the IR does not compile until it has a fixture here — which
 * is where both obligations a graduated codec carries are checked: it
 * round-trips (§4.6.1), and the zod mirror has an arm for it. Miss the second
 * and the type is authorable in this file and nowhere an agent can reach.
 */
const FIXTURES = {
  paragraph: { type: "paragraph", text: "a **bold** word" },
  heading: { type: "heading", level: 3, text: "What we built" },
  quote: { type: "quote", text: "as they say" },
  code: { type: "code", language: "ts", code: "const x = 1;" },
  list: {
    type: "list",
    listType: "bullet",
    items: [
      {
        text: "outer **one**",
        sublist: {
          listType: "number",
          items: [
            { text: "inner a" },
            {
              text: "inner b",
              sublist: {
                listType: "check",
                items: [{ text: "deep", checked: true }],
              },
            },
          ],
        },
      },
      { text: "outer two" },
    ],
  },
  divider: { type: "divider" },
  layout: {
    type: "layout",
    templateColumns: "2fr 1fr",
    columns: [
      [{ type: "paragraph", text: "left" }],
      [{ type: "paragraph", text: "right" }, { type: "divider" }],
    ],
  },
  details: {
    type: "details",
    summary: "Full **diff**",
    open: false,
    body: [{ type: "code", language: "diff", code: "- a\n+ b" }],
  },
  "nested-doc": {
    type: "nested-doc",
    // Plain text, deliberately: a title is a `title` attribute on the node, not
    // an inline run, so it is stored and read back verbatim.
    title: "Working notes",
    open: false,
    body: [
      { type: "heading", level: 2, text: "Scratch" },
      { type: "paragraph", text: "one" },
    ],
  },
  summary: { type: "summary", text: "Full **diff**" },
  kanban: {
    type: "kanban",
    tasks: [
      {
        id: "t1",
        name: "Draft",
        description: "the opening",
        stage: 0,
        priority: "high",
        tags: ["writing"],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "t2",
        name: "Ship",
        stage: 2,
        priority: "low",
        tags: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  },
  attachment: {
    type: "attachment",
    url: "/api/attachments/abc",
    filename: "report.pdf",
    mimetype: "application/pdf",
    size: 4096,
    expanded: true,
  },
  table: {
    type: "table",
    rowCount: 0,
    columnCount: 0,
    headerRow: true,
    rows: [
      ["Name", "Count"],
      ["apples", { text: "**3**", colSpan: 2 }],
    ],
  },
  cell: {
    type: "cell",
    text: "a **bold** cell",
    header: "both",
    colSpan: 2,
    rowSpan: 3,
  },
  // `satisfies` rather than an annotation: the Record is what makes a missing
  // type a compile error, and the literal types are what let the per-type
  // describes below read their own fixture back out of this table instead of
  // restating it.
} satisfies Record<WritableBlock["type"], WritableBlock>;

describe("the zod mirror and the codecs describe the same block model", () => {
  it.each(Object.entries(FIXTURES))(
    "accepts and builds a fully-populated %s",
    (_type, block) => {
      accepted(block);
      expect(() => blockToNode(block)).not.toThrow();
    },
  );

  it("has one arm per authorable type and no others", () => {
    const arms = blockSchema.options.map(
      (option) => option.shape.type.value as string,
    );
    expect(arms.slice().sort()).toEqual(Object.keys(FIXTURES).sort());
  });
});

describe("divider", () => {
  it("round-trips", () => {
    const { node, readBack } = rebuilds({ type: "divider" });
    expect(node.type).toBe("horizontalrule");
    expect(readBack).toEqual({ type: "divider" });
  });

  it("carries through fields a future node version might add", () => {
    const previous: SerializedNode = {
      type: "horizontalrule",
      version: 1,
      style: "thick",
    };
    expect(blockToNode({ type: "divider" }, previous).style).toBe("thick");
  });
});

describe("attachment", () => {
  it("round-trips every field", () => {
    const block = FIXTURES.attachment;
    const { node, readBack } = rebuilds(block);
    expect(node.type).toBe("attachment");
    expect(readBack).toMatchObject(block);
  });

  it("defaults the fields the app requires but a caller need not supply", () => {
    const node = blockToNode({
      type: "attachment",
      url: "/x",
      filename: "x.txt",
    });
    expect(node).toMatchObject({ expanded: false, editing: false, size: 0 });
  });
});

describe("kanban", () => {
  const { tasks } = FIXTURES.kanban;

  it("round-trips tasks, ids and timestamps included", () => {
    const { node, readBack } = rebuilds({ type: "kanban", tasks });
    expect(node.type).toBe("kanban");
    expect(readBack).toEqual({ type: "kanban", tasks });
  });

  it("mints ids and timestamps for a board authored from prose", () => {
    const node = blockToNode({
      type: "kanban",
      tasks: [{ name: "Write it up", stage: 0, priority: "medium" }],
    });
    const [task] = node.tasks as Array<Record<string, unknown>>;
    expect(task.id).toBeTruthy();
    expect(String(task.createdAt)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(task.tags).toEqual([]);
  });

  it("keeps the board's styling across a rewrite", () => {
    const previous: SerializedNode = {
      type: "kanban",
      version: 1,
      style: "width: 80%",
      tasks: [],
    };
    expect(blockToNode({ type: "kanban", tasks }, previous).style).toBe(
      "width: 80%",
    );
  });
});

describe("layout", () => {
  const block = FIXTURES.layout;

  it("builds a container of columns", () => {
    const node = blockToNode(block);
    expect(node.type).toBe("layout-container");
    expect(node.templateColumns).toBe("2fr 1fr");
    expect(kids(node).map((c) => c.type)).toEqual([
      "layout-item",
      "layout-item",
    ]);
    expect(kids(kids(node)[1]).map((c) => c.type)).toEqual([
      "paragraph",
      "horizontalrule",
    ]);
  });

  it("reads back as attributes only — the columns are addressed in their own right", () => {
    expect(nodeToBlock(blockToNode(block))).toEqual({
      type: "layout",
      templateColumns: "2fr 1fr",
    });
  });

  it("keeps the existing columns when a replace omits them", () => {
    const previous = blockToNode(block);
    const next = blockToNode(
      { type: "layout", templateColumns: "1fr 1fr 1fr" },
      previous,
    );
    expect(next.templateColumns).toBe("1fr 1fr 1fr");
    expect(JSON.stringify(next.children)).toBe(
      JSON.stringify(previous.children),
    );
  });

  it("refuses a new layout with no columns, rather than making an empty one", () => {
    expect(() => blockToNode({ type: "layout", templateColumns: "1fr 1fr" }))
      .toThrow(
        /needs `columns`/,
      );
  });
});

describe("details", () => {
  const block = FIXTURES.details;

  it("builds a summary and a content wrapper", () => {
    const node = blockToNode(block);
    expect(node.type).toBe("details-container");
    expect(node.open).toBe(false);
    expect(kids(node).map((c) => c.type)).toEqual([
      "details-summary",
      "details-content",
    ]);
    expect(kids(kids(node)[1]).map((c) => c.type)).toEqual(["code"]);
  });

  it("reads the summary back through the inline codec", () => {
    expect(nodeToBlock(blockToNode(block))).toEqual({
      type: "details",
      summary: "Full **diff**",
      open: false,
    });
  });

  it("keeps the body when a replace omits it", () => {
    const previous = blockToNode(block);
    const next = blockToNode({ type: "details", summary: "Renamed" }, previous);
    const content = kids(next)[1];
    expect(nodeToBlock(kids(next)[0])).toMatchObject({
      type: "summary",
      text: "Renamed",
    });
    expect(JSON.stringify(content)).toBe(JSON.stringify(kids(previous)[1]));
  });

  it("refuses a new details block with no body", () => {
    expect(() => blockToNode({ type: "details", summary: "x" })).toThrow(
      /needs `body`/,
    );
  });

  it("lets the summary be retitled in place through set_text", () => {
    const state: StoredState = stateFromBlocks([block]);
    // Address it by its path even though it is stamped — both spellings work,
    // so a caller holding an address from an older read is never stranded.
    const result = applyOps(state, stateHash(state), [
      { op: "set_text", id: "b1.1", text: "Shorter title" },
    ]);
    const summary = kids(kids(result.state.root)[0])[0];
    expect(nodeToBlock(summary)).toMatchObject({ text: "Shorter title" });
  });
});

/**
 * The wrapper codec only — the interior is reached through the container seam
 * and has no codec of its own (docs/plans/haklex-reprise.md §6.1). What this
 * has to prove is that the two halves of the *shape* decision agree: the codec
 * writes the interior where `containers.ts` reads it, and where
 * `NestedDocNode.exportJSON` writes it. `nestedDoc.test.ts` pins the third
 * corner of that triangle, through a real editor.
 */
describe("nested doc", () => {
  const block = FIXTURES["nested-doc"];

  it("builds a serialized editor state at `doc`, with no `editorState` level", () => {
    const node = blockToNode(block);
    expect(node.type).toBe("nested-doc");
    expect(node.title).toBe("Working notes");
    expect(node.open).toBe(false);
    // The whole of the shape decision, asserted rather than described. An
    // `editorState` key here would mean the codec and the container arm had
    // drifted, and every address inside would resolve to nothing.
    expect(Object.keys(node.doc as object)).toEqual(["root"]);
    const root = (node.doc as { root: SerializedNode }).root;
    expect(kids(root).map((child) => child.type)).toEqual([
      "heading",
      "paragraph",
    ]);
  });

  it("reads back as the wrapper alone — the interior is addressed in its own right", () => {
    expect(nodeToBlock(blockToNode(block))).toEqual({
      type: "nested-doc",
      title: "Working notes",
      open: false,
    });
  });

  it("round-trips", () => {
    const { readBack } = rebuilds(block);
    expect(readBack).toMatchObject({ type: "nested-doc", open: false });
  });

  it("keeps the interior when a replace omits the body", () => {
    const previous = blockToNode(block);
    const next = blockToNode(
      { type: "nested-doc", title: "Renamed" },
      previous,
    );
    expect(next.title).toBe("Renamed");
    expect(JSON.stringify(next.doc)).toBe(JSON.stringify(previous.doc));
  });

  it("refuses a new nested doc with no body", () => {
    expect(() => blockToNode({ type: "nested-doc", title: "x" })).toThrow(
      /needs `body`/,
    );
  });

  it("defaults to open, and carries a previous choice through a replace", () => {
    expect(
      blockToNode({
        type: "nested-doc",
        title: "x",
        body: [{ type: "paragraph", text: "y" }],
      }).open,
    ).toBe(true);
    const closed = blockToNode(block);
    expect(blockToNode({ type: "nested-doc", title: "x" }, closed).open)
      .toBe(false);
  });

  /**
   * `create_post` never goes near an op, so the refusal cannot live only in
   * `ops.ts` — see `nestedDoc.test.ts` for the same guard on the write path.
   */
  it("refuses a body holding a node the nested editor cannot register", () => {
    expect(() =>
      blockToNode({
        type: "nested-doc",
        title: "x",
        body: [
          { type: "kanban", tasks: [{ name: "T", stage: 0, priority: "low" }] },
        ],
      })
    ).toThrow(/kanban block cannot go inside a nested-doc/);
  });

  it("refuses one nested inside another, at any depth", () => {
    expect(() =>
      blockToNode({
        type: "nested-doc",
        title: "outer",
        body: [
          {
            type: "details",
            summary: "s",
            body: [
              {
                type: "nested-doc",
                title: "inner",
                body: [{ type: "paragraph", text: "boom" }],
              },
            ],
          },
        ],
      })
    ).toThrow(/nested-doc block cannot go inside a nested-doc/);
  });
});

describe("authoring a whole document from blocks", () => {
  it('composes what "publish this session as an article" needs', () => {
    const state = stateFromBlocks([
      { type: "heading", level: 1, text: "What we built" },
      { type: "paragraph", text: "The short version, with a [link](/x)." },
      { type: "divider" },
      {
        type: "details",
        summary: "Full diff",
        body: [{ type: "code", language: "ts", code: "const x = 1;" }],
      },
      {
        type: "kanban",
        tasks: [{ name: "Follow-up", stage: 0, priority: "medium" }],
      },
    ]);

    // A document authored from blocks is stamped from birth, so every address
    // is a persistent id rather than a structural path.
    const blocks = outline(state).blocks;
    expect(blocks.map((b) => b.kind)).toEqual([
      "heading[1]",
      "paragraph",
      "divider",
      "details",
      "summary",
      "details-content",
      "code[ts]",
      "kanban",
    ]);
    expect(blocks.every((b) => b.id.startsWith("blk_"))).toBe(true);
    expect(new Set(blocks.map((b) => b.id)).size).toBe(blocks.length);
  });
});

describe("table", () => {
  const block = FIXTURES.table;

  const rowsOf = (node: SerializedNode) => kids(node).map((row) => kids(row));

  it("builds rows of cells, each holding a paragraph", () => {
    const node = blockToNode(block);
    expect(node.type).toBe("blog-table");
    const rows = rowsOf(node);
    expect(rows.map((r) => r.length)).toEqual([2, 2]);
    expect(rows[0][0].type).toBe("blog-tablecell");
    expect(kids(rows[0][0]).map((c) => c.type)).toEqual(["paragraph"]);
  });

  it("applies headerRow to the first row only", () => {
    const rows = rowsOf(blockToNode(block));
    expect(rows[0].map((c) => c.headerState)).toEqual([1, 1]);
    expect(rows[1].map((c) => c.headerState)).toEqual([0, 0]);
  });

  it("reads back as a shape — the cells are addressed in their own right", () => {
    expect(nodeToBlock(blockToNode(block))).toEqual({
      type: "table",
      rowCount: 2,
      columnCount: 2,
    });
  });

  it("keeps the grid when a replace omits rows", () => {
    const previous = blockToNode(block);
    const next = blockToNode(
      { type: "table", rowCount: 0, columnCount: 0 },
      previous,
    );
    expect(JSON.stringify(next.children)).toBe(
      JSON.stringify(previous.children),
    );
  });

  it("refuses a new table with no rows", () => {
    expect(() => blockToNode({ type: "table", rowCount: 0, columnCount: 0 }))
      .toThrow(/needs `rows`/);
  });
});

describe("table cell", () => {
  const cellOf = (node: SerializedNode) => kids(kids(node)[0])[0];

  it("round-trips its text, inline formatting included", () => {
    const table = blockToNode({
      type: "table",
      rowCount: 0,
      columnCount: 0,
      rows: [[{ text: "a **bold** cell", header: "column", rowSpan: 2 }]],
    });
    const read = nodeToBlock(cellOf(table));
    expect(read).toEqual({
      type: "cell",
      text: "a **bold** cell",
      header: "column",
      rowSpan: 2,
    });
    // …and rebuilding from what was read gives the same node back.
    expect(blockToNode(read as WritableBlock, cellOf(table))).toEqual(
      cellOf(table),
    );
  });

  it("carries through styling the IR does not model", () => {
    const previous: SerializedNode = {
      type: "blog-tablecell",
      version: 1,
      headerState: 0,
      colSpan: 1,
      rowSpan: 1,
      backgroundColor: "#eee",
      style: "text-align: right",
      children: [],
    };
    const next = blockToNode({ type: "cell", text: "x" }, previous);
    expect(next).toMatchObject({
      backgroundColor: "#eee",
      style: "text-align: right",
    });
  });

  it("goes read-only rather than flatten a cell holding several blocks", () => {
    // 2.6% of stored cells hold more than one block; setting their text would
    // collapse the rest away.
    const cell: SerializedNode = {
      type: "blog-tablecell",
      version: 1,
      headerState: 0,
      children: [
        { type: "paragraph", version: 1, children: [] },
        { type: "paragraph", version: 1, children: [] },
      ],
    };
    expect(nodeToBlock(cell)).toMatchObject({
      type: "cell",
      readonlyText: true,
    });
  });
});

describe("nested lists", () => {
  const nested = FIXTURES.list;

  it("round-trips three levels of nesting", () => {
    const { readBack } = rebuilds(nested);
    expect(readBack).toEqual(nested);
  });

  it("derives indent from nesting depth, so the two cannot disagree", () => {
    // Across every stored list here, indent is exactly depth - 1. Making it
    // derived removes the possibility of an item whose indent contradicts
    // where it actually sits.
    const node = blockToNode(nested);
    const indentAt = (n: SerializedNode, depth: number): number[] =>
      kids(n)
        .filter((item) => item.type === "listitem")
        .flatMap((item) => [
          item.indent as number,
          ...kids(item)
            .filter((c) => c.type === "list")
            .flatMap((sub) => indentAt(sub, depth + 1)),
        ]);
    expect(indentAt(node, 0)).toEqual([0, 1, 1, 2, 0]);
  });

  it("keeps each level's own list type", () => {
    const node = blockToNode(nested);
    const outer = kids(node)[0];
    const middle = kids(outer).find((c) => c.type === "list")!;
    const inner = kids(kids(middle)[1]).find((c) => c.type === "list")!;
    expect([node.listType, middle.listType, inner.listType]).toEqual([
      "bullet",
      "number",
      "check",
    ]);
    expect([node.tag, middle.tag, inner.tag]).toEqual(["ul", "ol", "ul"]);
  });

  it("nests a list built from an item with no text of its own", () => {
    // The overwhelmingly common stored shape: a wrapper item holding only a
    // nested list.
    const block: WritableBlock = {
      type: "list",
      listType: "bullet",
      items: [{
        text: "",
        sublist: { listType: "bullet", items: [{ text: "only" }] },
      }],
    };
    expect(nodeToBlock(blockToNode(block))).toEqual(block);
  });

  it("goes read-only on a shape it could not put back", () => {
    const twoSublists: SerializedNode = {
      type: "list",
      version: 1,
      listType: "bullet",
      children: [
        {
          type: "listitem",
          version: 1,
          children: [
            { type: "list", version: 1, listType: "bullet", children: [] },
            { type: "list", version: 1, listType: "bullet", children: [] },
          ],
        },
      ],
    };
    expect(nodeToBlock(twoSublists)).toMatchObject({
      type: "list",
      readonlyText: true,
    });
  });

  it("goes read-only when content follows the nested list", () => {
    const trailing: SerializedNode = {
      type: "list",
      version: 1,
      listType: "bullet",
      children: [
        {
          type: "listitem",
          version: 1,
          children: [
            { type: "list", version: 1, listType: "bullet", children: [] },
            {
              type: "text",
              version: 1,
              text: "after",
              detail: 0,
              format: 0,
              mode: "normal",
              style: "",
            },
          ],
        },
      ],
    };
    expect(nodeToBlock(trailing)).toMatchObject({
      type: "list",
      readonlyText: true,
    });
  });
});
