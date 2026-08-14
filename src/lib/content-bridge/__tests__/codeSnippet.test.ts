/**
 * A code snippet through the bridge (docs/plans/haklex-reprise.md §6.2).
 *
 * The other two consumers of the container seam needed an arm in
 * `containers.ts` — a sticky's blocks are three keys down, a nested doc's are
 * two. This one needs **none**, and that claim is what this file exists to
 * check rather than assume. Its files are ordinary `code` nodes in the ordinary
 * `children` array, so:
 *
 *   - the *default* accessor serves them, and hands back the live array;
 *   - the `code` codec that has existed since phase 1 reads and writes each
 *     file, with no codec for the interior and no `code-snippet` entry on
 *     `OPAQUE_ALLOWLIST`;
 *   - one line in `BLOCK_CONTAINERS` is the whole of the addressing change.
 *
 * If any of that were false, §6.2 would have misread how `code` nodes nest and
 * the phase would be a different, larger shape. So the first describe is the
 * one that matters most, even though it looks like it is testing nothing.
 */
import { createHeadlessEditor } from "@lexical/headless";
import { editorConfig } from "@/editor/config";
import {
  childrenOf,
  ensureChildrenOf,
  onlyChildTypeOf,
  refusedTypesOf,
} from "@/lib/content-bridge/containers";
import { BLOCK_CONTAINERS, locate } from "@/lib/content-bridge/address";
import { applyOps, stateFromBlocks, type Op } from "@/lib/content-bridge/ops";
import { outline, readBlocks } from "@/lib/content-bridge/outline";
import { stateHash } from "@/lib/content-bridge/stateHash";
import type {
  SerializedNode,
  StoredState,
  WritableBlock,
} from "@/lib/content-bridge/types";
import { makeCodeSnippetState, snapshot } from "./fixture";

const at = (state: StoredState, index: number): SerializedNode =>
  (state.root.children as SerializedNode[])[index];

/** The snippet, wherever a move left it. */
function snippet(state: StoredState): SerializedNode {
  const find = (node: SerializedNode): SerializedNode | undefined => {
    if (node.type === "code-snippet") return node;
    for (const child of (node.children ?? []) as SerializedNode[]) {
      const hit = find(child);
      if (hit) return hit;
    }
    return undefined;
  };
  const found = find(state.root);
  if (!found) throw new Error("no code snippet in this state");
  return found;
}

const files = (state: StoredState): SerializedNode[] =>
  childrenOf(snippet(state));

const sourceOf = (node: SerializedNode): string =>
  ((node.children ?? []) as SerializedNode[])
    .map((child) => String(child.text ?? ""))
    .join("");

const apply = (state: StoredState, ops: Op[]) =>
  applyOps(state, stateHash(state), ops);

const paragraph = (text: string): WritableBlock => ({ type: "paragraph", text });

describe("the default accessor is what serves a snippet", () => {
  it("hands back the live children array, not a copy of it", () => {
    // The property every write depends on: `ops.ts` splices what `childrenOf`
    // returns. An arm that mapped or filtered would break writes while leaving
    // every read correct — see `containers.ts`.
    const node = snippet(makeCodeSnippetState());
    expect(childrenOf(node)).toBe(node.children);
    expect(ensureChildrenOf(node)).toBe(node.children);
  });

  it("does not invent a children array for a snippet that has none", () => {
    const bare: SerializedNode = { type: "code-snippet", version: 1 };
    expect(childrenOf(bare)).toEqual([]);
    expect(bare).not.toHaveProperty("children");
  });

  it("is a block container, and refuses nothing on registration grounds", () => {
    expect(BLOCK_CONTAINERS.has("code-snippet")).toBe(true);
    // Unlike a sticky or a nested doc: a snippet is not a nested editor, so
    // there is no node set it could fail to register.
    expect(refusedTypesOf("code-snippet").size).toBe(0);
    // What it does constrain is the *kind* of child, which is a different table.
    expect(onlyChildTypeOf("code-snippet")).toBe("code");
  });
});

describe("addressing reaches each file", () => {
  it("numbers the files as children of the snippet", () => {
    expect(
      outline(makeCodeSnippetState()).blocks.map((b) => [b.id, b.kind]),
    ).toEqual([
      ["b1", "paragraph"],
      ["b2", "code-snippet"],
      ["b2.1", "code[ts]"],
      ["b2.2", "code[python]"],
      ["b3", "paragraph"],
    ]);
  });

  it("previews the snippet by its tabs and each file by its name", () => {
    const entries = outline(makeCodeSnippetState()).blocks;
    expect(entries[1].preview).toBe("2 files · index.ts, main.py");
    expect(entries[2].preview).toBe("index.ts · 1 line");
  });

  it("reads a file with the codec that already existed", () => {
    const read = readBlocks(makeCodeSnippetState(), ["b2.1", "b2.2"]);
    expect(read.missing).toEqual([]);
    expect(read.blocks[0]).toEqual({
      id: "b2.1",
      type: "code",
      language: "ts",
      code: "export const x = 1;",
      filename: "index.ts",
    });
  });

  it("locates a file by address", () => {
    const state = makeCodeSnippetState();
    const found = locate(state, "b2.2");
    expect(found?.node.filename).toBe("main.py");
    expect(found?.parent).toBe(snippet(state));
  });
});

describe("editing a file inside a snippet", () => {
  it("sets one file's text and leaves everything else byte-identical", () => {
    const state = makeCodeSnippetState();
    const before = { first: snapshot(at(state, 0)), last: snapshot(at(state, 2)) };
    const result = apply(state, [
      { op: "set_text", id: "b2.1", text: "export const x = 2;" },
    ]);
    expect(sourceOf(files(result.state)[0])).toBe("export const x = 2;");
    expect(sourceOf(files(result.state)[1])).toBe("x = 1");
    expect(snapshot(at(result.state, 0))).toBe(before.first);
    expect(snapshot(at(result.state, 2))).toBe(before.last);
  });

  it("keeps the edited file's name — the `code` codec never sees it", () => {
    const result = apply(makeCodeSnippetState(), [
      { op: "set_text", id: "b2.1", text: "// rewritten" },
    ]);
    expect(files(result.state).map((file) => file.filename)).toEqual([
      "index.ts",
      "main.py",
    ]);
  });

  it("inserts a file", () => {
    const result = apply(makeCodeSnippetState(), [
      {
        op: "insert_blocks",
        after: "b2.1",
        blocks: [{
          type: "code",
          language: "sh",
          code: "npm run build",
          filename: "build.sh",
        }],
      },
    ]);
    expect(files(result.state).map((file) => file.filename)).toEqual([
      "index.ts",
      "build.sh",
      "main.py",
    ]);
  });

  it("appends a file to the snippet by naming the container", () => {
    const result = apply(makeCodeSnippetState(), [
      {
        op: "insert_blocks",
        appendTo: "b2",
        blocks: [{ type: "code", language: "json", code: "{}", filename: "tsconfig.json" }],
      },
    ]);
    expect(files(result.state)).toHaveLength(3);
    expect(files(result.state)[2].filename).toBe("tsconfig.json");
  });

  it("replaces a file whole, name and language and all", () => {
    const result = apply(makeCodeSnippetState(), [
      {
        op: "replace_block",
        id: "b2.2",
        block: {
          type: "code",
          language: "go",
          code: "package main",
          filename: "main.go",
        },
      },
    ]);
    expect(files(result.state)[1]).toMatchObject({
      language: "go",
      filename: "main.go",
    });
  });

  it("moves a file within the snippet, carrying its name with it", () => {
    // The reason the name is on the file and not in an array on the wrapper: an
    // index-keyed array would still say `["index.ts", "main.py"]` here.
    const result = apply(makeCodeSnippetState(), [
      { op: "move_block", id: "b2.2", before: "b2.1" },
    ]);
    expect(files(result.state).map((file) => file.filename)).toEqual([
      "main.py",
      "index.ts",
    ]);
    expect(files(result.state).map(sourceOf)).toEqual([
      "x = 1",
      "export const x = 1;",
    ]);
  });

  it("moves a file out into the document, where it is an ordinary block", () => {
    const result = apply(makeCodeSnippetState(), [
      { op: "move_block", id: "b2.1", after: "b3" },
    ]);
    expect(files(result.state)).toHaveLength(1);
    expect(at(result.state, 3)).toMatchObject({
      type: "code",
      filename: "index.ts",
    });
  });

  it("deletes a file", () => {
    const state = makeCodeSnippetState();
    const last = snapshot(at(state, 2));
    const result = apply(state, [{ op: "delete_block", id: "b2.1" }]);
    expect(files(result.state).map((file) => file.filename)).toEqual([
      "main.py",
    ]);
    expect(snapshot(at(result.state, 2))).toBe(last);
  });

  it("deletes the snippet whole", () => {
    const result = apply(makeCodeSnippetState(), [
      { op: "delete_block", id: "b2" },
    ]);
    expect((result.state.root.children as SerializedNode[]).map((n) => n.type))
      .toEqual(["paragraph", "paragraph"]);
  });

  it("leaves a snippet nobody named byte-identical", () => {
    const state = makeCodeSnippetState();
    const before = snapshot(snippet(state));
    const result = apply(state, [
      { op: "set_text", id: "b1", text: "Something else entirely." },
    ]);
    expect(snapshot(snippet(result.state))).toBe(before);
  });
});

describe("the freshness guard sees inside a snippet", () => {
  it("changes when only a file changed", () => {
    const before = stateHash(makeCodeSnippetState());
    const after = apply(makeCodeSnippetState(), [
      { op: "set_text", id: "b2.1", text: "different" },
    ]);
    expect(after.stateHash).not.toBe(before);
    expect(after.stateHash).toBe(stateHash(after.state));
  });
});

/**
 * A snippet holds files. Everything else is refused at the write, because the
 * alternative is not an error — it is the editor's own transform
 * (`nodes/CodeSnippetNode/guard.ts`) moving the block out of the snippet on
 * some later load, in an editing session nobody connects to this write.
 */
describe("a write that would put something other than a file in one", () => {
  const refuse = (ops: Op[]) => () => apply(makeCodeSnippetState(), ops);

  it("refuses an inserted paragraph", () => {
    expect(refuse([{ op: "insert_blocks", appendTo: "b2", blocks: [paragraph("no")] }]))
      .toThrow(/code-snippet holds code blocks only.*is a paragraph/);
  });

  it("refuses one inserted between two files", () => {
    expect(refuse([{ op: "insert_blocks", before: "b2.2", blocks: [paragraph("no")] }]))
      .toThrow(/code-snippet holds code blocks only/);
  });

  it("refuses a replace that swaps a file for something else", () => {
    expect(refuse([{ op: "replace_block", id: "b2.1", block: paragraph("no") }]))
      .toThrow(/code-snippet holds code blocks only/);
  });

  it("refuses a move that carries a paragraph in from the document", () => {
    expect(refuse([{ op: "move_block", id: "b1", appendTo: "b2" }]))
      .toThrow(/code-snippet holds code blocks only/);
  });

  it("allows a code block moved in from the document", () => {
    const withCode = apply(makeCodeSnippetState(), [
      {
        op: "insert_blocks",
        after: "b3",
        blocks: [{ type: "code", language: "sql", code: "select 1", filename: "q.sql" }],
      },
    ]).state;
    const moved = applyOps(withCode, stateHash(withCode), [
      { op: "move_block", id: "b4", appendTo: "b2" },
    ]);
    expect(files(moved.state).map((file) => file.filename)).toEqual([
      "index.ts",
      "main.py",
      "q.sql",
    ]);
  });

  it("refuses the whole batch — nothing is half-written", () => {
    const state = makeCodeSnippetState();
    const before = snapshot(state);
    expect(() =>
      applyOps(state, stateHash(state), [
        { op: "set_text", id: "b1", text: "this would have been fine" },
        { op: "insert_blocks", appendTo: "b2", blocks: [paragraph("no")] },
      ])
    ).toThrow();
    expect(snapshot(state)).toBe(before);
  });

  it("refuses it in a document authored whole, where no op is involved", () => {
    expect(() =>
      stateFromBlocks([
        {
          type: "code-snippet",
          files: [{ type: "paragraph", text: "no" }] as never,
        },
      ])
    ).toThrow(/holds code blocks only/);
  });

  it("still allows a paragraph everywhere else", () => {
    const result = apply(makeCodeSnippetState(), [
      { op: "insert_blocks", after: "b2", blocks: [paragraph("fine")] },
    ]);
    expect(at(result.state, 2)).toMatchObject({ type: "paragraph" });
  });
});

/**
 * An agent's edit comes back through a real load, over the registry the app
 * itself mounts — the §10.3 rule that a spec which never builds an editor is
 * not testing registration. `importJSON` is reached through the registry, not
 * called directly, and `errorOnTypeKlassMismatch` only runs on that path.
 */
describe("an edited snippet survives a load", () => {
  const roundTrip = (state: StoredState): StoredState => {
    const editor = createHeadlessEditor({
      namespace: editorConfig.namespace,
      nodes: editorConfig.nodes,
      onError: (error) => {
        throw error;
      },
    });
    editor.setEditorState(editor.parseEditorState(JSON.stringify(state)));
    return editor.getEditorState().toJSON() as unknown as StoredState;
  };

  const edited = () =>
    apply(makeCodeSnippetState(), [
      { op: "delete_block", id: "b2.1" },
      {
        op: "insert_blocks",
        appendTo: "b2",
        blocks: [{
          type: "code",
          language: "rust",
          code: "fn main() {}",
          filename: "main.rs",
        }],
      },
    ]).state;

  it("carries the insert and the delete through importJSON", () => {
    const loaded = roundTrip(edited());
    expect(files(loaded).map((file) => file.filename)).toEqual([
      "main.py",
      "main.rs",
    ]);
    expect(files(loaded).map(sourceOf)).toEqual(["x = 1", "fn main() {}"]);
  });

  it("keeps the addresses, so the next batch can name the same files", () => {
    const loaded = roundTrip(edited());
    expect(outline(loaded).blocks.map((entry) => [entry.depth, entry.kind]))
      .toEqual([
        [0, "paragraph"],
        [0, "code-snippet"],
        [1, "code[python]"],
        [1, "code[rust]"],
        [0, "paragraph"],
      ]);
    expect(readBlocks(loaded, ["b2.2"]).blocks[0]).toMatchObject({
      type: "code",
      filename: "main.rs",
    });
  });

  it("stamps the files it touched, and leaves the others alone", () => {
    const loaded = roundTrip(edited());
    const stamped = files(loaded).map((file) =>
      (file.$ as Record<string, unknown> | undefined)?.blockId
    );
    expect(stamped[1]).toMatch(/^blk_/);
    expect([sourceOf(at(loaded, 0)), sourceOf(at(loaded, 2))]).toEqual([
      "Before the snippet.",
      "After the snippet.",
    ]);
  });
});
