/**
 * Reading (plan §4.4) and the addressing it hands out (§4.2).
 *
 * The thing worth asserting is the difference from the Markdown transport this
 * replaces: a block with no codec is *listed*, not omitted. Under Markdown a
 * kanban board simply vanished from what the agent saw, with nothing to say it
 * had been there.
 */
import { formatAddress, parseAddress, walkBlocks } from "@/lib/content-bridge/address";
import { describeNode, nodeToBlock } from "@/lib/content-bridge/blocks";
import { formatOutline, outline, readAll, readBlocks } from "@/lib/content-bridge/outline";
import { stateHash } from "@/lib/content-bridge/stateHash";
import { stateFromBlocks } from "@/lib/content-bridge/ops";
import type { SerializedNode } from "@/lib/content-bridge/types";
import { makeState, paragraph } from "./fixture";

describe("addresses", () => {
  it("round-trip between path and address", () => {
    expect(formatAddress([0])).toBe("b1");
    expect(formatAddress([3, 1])).toBe("b4.2");
    expect(parseAddress("b4.2")).toEqual([3, 1]);
    expect(parseAddress("b1")).toEqual([0]);
  });

  it("rejects malformed addresses rather than guessing", () => {
    for (const bad of ["", "b", "b0", "4", "b1.", "b-1", "bx", "b1..2"]) {
      expect(parseAddress(bad)).toBeNull();
    }
  });

  it("numbers in document order, descending only into containers", () => {
    const addresses = walkBlocks(makeState()).map((entry) => entry.address);
    expect(addresses).toEqual([
      "b1", // heading
      "b2", // paragraph
      "b3", // kanban
      "b4", // layout-container
      "b4.1", //   layout-item
      "b4.1.1", //     paragraph
      "b4.2", //   layout-item
      "b4.2.1", //     graph
      "b5", // code
      "b6", // list
      "b7", // pagebreak
    ]);
  });

  it("treats an unrecognised container as one block rather than descending", () => {
    // The allowlist is the point: a node type nobody has taught the bridge
    // about stays whole and addressable instead of having its children handed
    // out as though the codecs understood them.
    const state = makeState();
    state.root.children = [
      { type: "some-future-node", version: 1, children: [paragraph("inside")] },
    ];
    expect(walkBlocks(state).map((e) => e.address)).toEqual(["b1"]);
  });
});

describe("outline", () => {
  it("lists every block, including those with no codec", () => {
    const result = outline(makeState());
    expect(result.blocks.map((b) => `${b.id} ${b.kind}`)).toEqual([
      "b1 heading[1]",
      "b2 paragraph",
      "b3 kanban",
      "b4 layout",
      "b4.1 layout-item",
      "b4.1.1 paragraph",
      "b4.2 layout-item",
      "b4.2.1 graph",
      "b5 code[ts]",
      "b6 list[bullet]",
      "b7 pagebreak",
    ]);
  });

  it("previews graduated block types by their own shape", () => {
    const byId = new Map(outline(makeState()).blocks.map((b) => [b.id, b]));
    expect(byId.get("b3")?.preview).toBe("2 lanes · 3 cards");
    expect(byId.get("b4")?.preview).toBe("1fr 1fr");
  });

  it("still describes blocks with no codec by shape", () => {
    const byId = new Map(outline(makeState()).blocks.map((b) => [b.id, b]));
    expect(byId.get("b4.2.1")?.preview).toBe("geogebra · f(x)=x^2");
    expect(byId.get("b7")?.preview).toBe("page break");
  });

  it("separates what can be replaced from what set_text accepts", () => {
    // Conflating these advertised a kanban as editable and then refused the
    // edit: it has no single text field, but replace_block works fine.
    const byId = new Map(outline(makeState()).blocks.map((b) => [b.id, b]));
    expect(byId.get("b2")).toMatchObject({ editable: true, textEditable: true });
    expect(byId.get("b5")).toMatchObject({ editable: true, textEditable: true });
    expect(byId.get("b3")).toMatchObject({ editable: true, textEditable: false });
    expect(byId.get("b4")).toMatchObject({ editable: true, textEditable: false });
    // A graph has no codec at all — neither op will touch it.
    expect(byId.get("b4.2.1")).toMatchObject({ editable: false, textEditable: false });
  });

  it("keeps its columns separated even for a wide address or kind", () => {
    // Both have overrun their column before: a persistent id is wider than a
    // path, and "details-content" is wider than the kind column.
    const state = stateFromBlocks([
      { type: "details", summary: "S", body: [{ type: "paragraph", text: "x" }] },
    ]);
    for (const line of formatOutline(outline(state)).split("\n")) {
      expect(line).toMatch(/^\S+\s+\S/);
      expect(line).not.toMatch(/blk_\w*[a-z]+\[/);
    }
  });

  it("marks each refusal distinctly in the rendered outline", () => {
    const rendered = formatOutline(outline(makeState()));
    expect(rendered).toMatch(/b3\s+kanban.*\[replace only\]/);
    expect(rendered).toMatch(/b4\.2\.1\s+graph.*\[read-only\]/);
    expect(rendered).not.toMatch(/b2\s+paragraph.*\[/);
  });

  it("previews prose and sizes it, without carrying the body", () => {
    const entry = outline(makeState()).blocks[1];
    expect(entry.preview).toBe("The usual derivation starts from the gradient.");
    expect(entry.chars).toBe(46);

    const long = makeState();
    (long.root.children as SerializedNode[])[1] = paragraph("word ".repeat(60));
    const truncated = outline(long).blocks[1];
    expect(truncated.preview.endsWith("…")).toBe(true);
    expect(truncated.preview.length).toBeLessThan(90);
    expect(truncated.chars).toBe(300);
  });

  it("carries the hash a write will be checked against", () => {
    const state = makeState();
    expect(outline(state).stateHash).toBe(stateHash(state));
  });
});

describe("readBlocks", () => {
  it("returns full content only for what was asked for", () => {
    const result = readBlocks(makeState(), ["b2", "b6"]);
    expect(result.blocks).toEqual([
      { id: "b2", type: "paragraph", text: "The usual derivation starts from the gradient." },
      {
        id: "b6",
        type: "list",
        listType: "bullet",
        items: [
          { text: "first" },
          { text: "second" },
        ],
      },
    ]);
  });

  it("names addresses that matched nothing instead of quietly returning fewer", () => {
    const result = readBlocks(makeState(), ["b2", "b99"]);
    expect(result.blocks).toHaveLength(1);
    expect(result.missing).toEqual(["b99"]);
  });

  it("reads a block with no codec as a descriptor rather than refusing", () => {
    expect(readBlocks(makeState(), ["b4.2.1"]).blocks[0]).toEqual({
      id: "b4.2.1",
      type: "opaque",
      nodeType: "graph",
      summary: "geogebra · f(x)=x^2",
    });
  });
});

describe("readAll", () => {
  it("nests children under their container", () => {
    const result = readAll(makeState());
    expect(result.blocks.map((b) => b.id)).toEqual([
      "b1", "b2", "b3", "b4", "b5", "b6", "b7",
    ]);
    const layout = result.blocks.find((b) => b.id === "b4");
    expect(layout?.children?.map((c) => c.id)).toEqual(["b4.1", "b4.2"]);
    const column = layout?.children?.[1];
    expect(column?.children?.map((c) => c.id)).toEqual(["b4.2.1"]);
  });
});

describe("codecs", () => {
  it("reads a list whose item nests another list", () => {
    const state = makeState();
    const list = (state.root.children as SerializedNode[])[5];
    (list.children as SerializedNode[])[0].children = [
      {
        type: "text", version: 1, text: "outer", detail: 0,
        format: 0, mode: "normal", style: "",
      },
      {
        type: "list", version: 1, listType: "number", children: [
          {
            type: "listitem", version: 1, value: 1, indent: 1,
            children: [{
              type: "text", version: 1, text: "inner", detail: 0,
              format: 0, mode: "normal", style: "",
            }],
          },
        ],
      },
    ];
    expect(nodeToBlock(list)).toEqual({
      type: "list",
      listType: "bullet",
      items: [
        { text: "outer", sublist: { listType: "number", items: [{ text: "inner" }] } },
        { text: "second" },
      ],
    });
  });

  it("falls back to the node type for a block it has never seen", () => {
    expect(describeNode({ type: "some-future-node", version: 1 })).toBe(
      "some-future-node",
    );
  });

  it("describes an inline node it cannot spell, rather than reading as empty", () => {
    // Found against real content: a paragraph wrapping a canvas came back with
    // an empty preview, so the outline said a block was there and read-only
    // without saying what it was.
    const state = makeState();
    (state.root.children as SerializedNode[])[1] = {
      type: "paragraph",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: [{ type: "canvas", version: 1, id: "c1", height: 300, notes: [{}, {}] }],
    };
    const block = nodeToBlock((state.root.children as SerializedNode[])[1]);
    expect(block).toMatchObject({
      type: "paragraph",
      text: "[2 notes]",
      readonlyText: true,
    });
    expect(outline(state).blocks[1]).toMatchObject({
      kind: "paragraph",
      preview: "[2 notes]",
      // Replaceable whole, but set_text would flatten the canvas away.
      editable: true,
      textEditable: false,
    });
  });
});

describe("stateHash", () => {
  it("ignores key order, so a reserialized state hashes the same", () => {
    const a = { root: { type: "root", version: 1, children: [] } };
    const b = { root: { children: [], version: 1, type: "root" } };
    expect(stateHash(a)).toBe(stateHash(b));
  });

  it("accepts the raw JSON string as well as the parsed object", () => {
    const state = makeState();
    expect(stateHash(JSON.stringify(state))).toBe(stateHash(state));
  });

  it("changes when any content changes", () => {
    const before = stateHash(makeState());
    const after = makeState();
    (after.root.children as SerializedNode[])[1] = paragraph("different");
    expect(stateHash(after)).not.toBe(before);
  });

  it("distinguishes values a looser hash would collide", () => {
    expect(stateHash({ root: { type: "root", v: 1 } })).not.toBe(
      stateHash({ root: { type: "root", v: "1" } }),
    );
    expect(stateHash({ root: { type: "root", a: "x", b: "" } })).not.toBe(
      stateHash({ root: { type: "root", a: "", b: "x" } }),
    );
  });
});
