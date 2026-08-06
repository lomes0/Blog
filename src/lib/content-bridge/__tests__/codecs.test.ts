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
import { stateHash } from "@/lib/content-bridge/stateHash";
import type {
  SerializedNode,
  StoredState,
  WritableBlock,
} from "@/lib/content-bridge/types";

const kids = (node: SerializedNode): SerializedNode[] =>
  (node.children as SerializedNode[]) ?? [];

/** Build -> read -> build again. The second node must equal the first. */
const rebuilds = (block: WritableBlock) => {
  const node = blockToNode(block);
  const readBack = nodeToBlock(node);
  expect(readBack.type).not.toBe("opaque");
  expect(blockToNode(readBack as WritableBlock, node)).toEqual(node);
  return { node, readBack };
};

describe("divider", () => {
  it("round-trips", () => {
    const { node, readBack } = rebuilds({ type: "divider" });
    expect(node.type).toBe("horizontalrule");
    expect(readBack).toEqual({ type: "divider" });
  });

  it("carries through fields a future node version might add", () => {
    const previous: SerializedNode = { type: "horizontalrule", version: 1, style: "thick" };
    expect(blockToNode({ type: "divider" }, previous).style).toBe("thick");
  });
});

describe("attachment", () => {
  it("round-trips every field", () => {
    const block: WritableBlock = {
      type: "attachment",
      url: "/api/attachments/abc",
      filename: "report.pdf",
      mimetype: "application/pdf",
      size: 4096,
      expanded: true,
    };
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
  const tasks = [
    {
      id: "t1",
      name: "Draft",
      description: "the opening",
      stage: 0,
      priority: "high" as const,
      tags: ["writing"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
    {
      id: "t2",
      name: "Ship",
      stage: 2,
      priority: "low" as const,
      tags: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];

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
    const previous: SerializedNode = { type: "kanban", version: 1, style: "width: 80%", tasks: [] };
    expect(blockToNode({ type: "kanban", tasks }, previous).style).toBe("width: 80%");
  });
});

describe("layout", () => {
  const block: WritableBlock = {
    type: "layout",
    templateColumns: "2fr 1fr",
    columns: [
      [{ type: "paragraph", text: "left" }],
      [{ type: "paragraph", text: "right" }, { type: "divider" }],
    ],
  };

  it("builds a container of columns", () => {
    const node = blockToNode(block);
    expect(node.type).toBe("layout-container");
    expect(node.templateColumns).toBe("2fr 1fr");
    expect(kids(node).map((c) => c.type)).toEqual(["layout-item", "layout-item"]);
    expect(kids(kids(node)[1]).map((c) => c.type)).toEqual(["paragraph", "horizontalrule"]);
  });

  it("reads back as attributes only — the columns are addressed in their own right", () => {
    expect(nodeToBlock(blockToNode(block))).toEqual({
      type: "layout",
      templateColumns: "2fr 1fr",
    });
  });

  it("keeps the existing columns when a replace omits them", () => {
    const previous = blockToNode(block);
    const next = blockToNode({ type: "layout", templateColumns: "1fr 1fr 1fr" }, previous);
    expect(next.templateColumns).toBe("1fr 1fr 1fr");
    expect(JSON.stringify(next.children)).toBe(JSON.stringify(previous.children));
  });

  it("refuses a new layout with no columns, rather than making an empty one", () => {
    expect(() => blockToNode({ type: "layout", templateColumns: "1fr 1fr" })).toThrow(
      /needs `columns`/,
    );
  });
});

describe("details", () => {
  const block: WritableBlock = {
    type: "details",
    summary: "Full **diff**",
    open: false,
    body: [{ type: "code", language: "diff", code: "- a\n+ b" }],
  };

  it("builds a summary and a content wrapper", () => {
    const node = blockToNode(block);
    expect(node.type).toBe("details-container");
    expect(node.open).toBe(false);
    expect(kids(node).map((c) => c.type)).toEqual(["details-summary", "details-content"]);
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
    expect(nodeToBlock(kids(next)[0])).toMatchObject({ type: "summary", text: "Renamed" });
    expect(JSON.stringify(content)).toBe(JSON.stringify(kids(previous)[1]));
  });

  it("refuses a new details block with no body", () => {
    expect(() => blockToNode({ type: "details", summary: "x" })).toThrow(/needs `body`/);
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

describe("authoring a whole document from blocks", () => {
  it("composes what \"publish this session as an article\" needs", () => {
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
