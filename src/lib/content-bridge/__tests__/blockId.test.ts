/**
 * Persistent block ids (plan §4.2, phase 5).
 *
 * The point of an id is that it survives the tree shifting underneath it. A
 * structural path does not: insert a paragraph at the top and every address
 * below it means a different block. Over MCP that barely matters — a read and a
 * write are seconds apart, and the `stateHash` catches the difference. In the
 * app it matters a lot, because the document being edited is usually the one on
 * screen.
 *
 * The two properties that make this safe to adopt gradually are asserted here:
 * stamping touches only what a batch wrote, and both spellings keep resolving.
 */
import { applyOps, stateFromBlocks } from "@/lib/content-bridge/ops";
import { outline, readBlocks } from "@/lib/content-bridge/outline";
import { stateHash } from "@/lib/content-bridge/stateHash";
import { readBlockId } from "@/lib/content-bridge/blockId";
import type { SerializedNode, StoredState } from "@/lib/content-bridge/types";
import { makeState, snapshot } from "./fixture";

const at = (state: StoredState, index: number): SerializedNode =>
  (state.root.children as SerializedNode[])[index];

const apply = (state: StoredState, ops: Parameters<typeof applyOps>[2]) =>
  applyOps(state, stateHash(state), ops);

describe("stamping", () => {
  it("stamps only the blocks a batch touched", () => {
    const state = makeState();
    const result = apply(state, [{ op: "set_text", id: "b2", text: "edited" }]);

    expect(readBlockId(at(result.state, 1))).toMatch(/^blk_/);
    // Everything else is untouched, so nothing else gains an id.
    for (const index of [0, 2, 3, 4, 5, 6]) {
      expect(readBlockId(at(result.state, index))).toBe("");
    }
  });

  it("leaves an untouched rich block byte-identical, ids and all", () => {
    // Stamping the whole document would have broken this, and would also have
    // buried a one-paragraph edit inside a 200-block diff.
    const state = makeState();
    const before = snapshot(at(state, 2));
    const result = apply(state, [{ op: "set_text", id: "b2", text: "edited" }]);
    expect(snapshot(at(result.state, 2))).toBe(before);
  });

  it("does not stamp on a read", () => {
    // A read that stamped would change the document's hash as a side effect of
    // being observed, and so refuse the very next write.
    const state = makeState();
    const before = snapshot(state);
    outline(state);
    readBlocks(state, ["b1", "b2", "b3"]);
    expect(snapshot(state)).toBe(before);
  });

  it("stamps a document authored from blocks, from birth", () => {
    const state = stateFromBlocks([
      { type: "heading", level: 1, text: "Title" },
      { type: "paragraph", text: "Body" },
    ]);
    expect(outline(state).blocks.every((b) => b.id.startsWith("blk_"))).toBe(true);
  });

  it("mints ids that are unique within a document", () => {
    const state = stateFromBlocks(
      Array.from({ length: 50 }, (_, i) => ({
        type: "paragraph" as const,
        text: `para ${i}`,
      })),
    );
    const ids = outline(state).blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("an id survives what a path does not", () => {
  it("keeps naming the same block after the tree shifts above it", () => {
    const state = makeState();

    // Edit b2, which stamps it.
    const first = apply(state, [{ op: "set_text", id: "b2", text: "the intro" }]);
    const id = readBlockId(at(first.state, 1));
    expect(id).toMatch(/^blk_/);

    // Now insert two blocks above it. Its path is no longer b2.
    const second = applyOps(first.state, first.stateHash, [
      {
        op: "insert_blocks",
        before: "b1",
        blocks: [
          { type: "paragraph", text: "one" },
          { type: "paragraph", text: "two" },
        ],
      },
    ]);
    expect(readBlockId(at(second.state, 3))).toBe(id);

    // The id still resolves; the old path now points at something else.
    const byId = readBlocks(second.state, [id]);
    expect(byId.blocks[0]).toMatchObject({ text: "the intro" });
    const byPath = readBlocks(second.state, ["b2"]);
    expect(byPath.blocks[0]).toMatchObject({ text: "two" });

    // And a write addressed by the id lands on the right block.
    const third = applyOps(second.state, second.stateHash, [
      { op: "set_text", id, text: "rewritten by id" },
    ]);
    expect(at(third.state, 3)).toMatchObject({ type: "paragraph" });
    expect(readBlocks(third.state, [id]).blocks[0]).toMatchObject({
      text: "rewritten by id",
    });
  });

  it("still accepts the structural path for a block that has been stamped", () => {
    // A caller holding an address from a read taken before the block was
    // stamped must not be stranded by it acquiring an id.
    const state = makeState();
    const first = apply(state, [{ op: "set_text", id: "b2", text: "one" }]);
    expect(() =>
      applyOps(first.state, first.stateHash, [
        { op: "set_text", id: "b2", text: "two" },
      ]),
    ).not.toThrow();
    expect(readBlocks(first.state, ["b2"]).blocks).toHaveLength(1);
  });

  it("reports an id that names nothing, rather than guessing", () => {
    const state = makeState();
    expect(() =>
      apply(state, [{ op: "set_text", id: "blk_nosuchblock", text: "x" }]),
    ).toThrow(/no block at "blk_nosuchblock"/);
    expect(readBlocks(state, ["blk_nosuchblock"]).missing).toEqual([
      "blk_nosuchblock",
    ]);
  });
});
