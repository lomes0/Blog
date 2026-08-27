import {
  UNWRAPPED_BLOCK_TYPES,
  unwrapBlockDecorators,
} from "../blockDecorators";

/**
 * The migration half of docs/plans/nested-editor-support.md §3.
 *
 * Two things can go wrong here and only one of them is loud. The loud one is
 * failing to unwrap: an agent still cannot address a canvas, which is visible
 * the moment anyone tries. The quiet one is unwrapping something it should not
 * — a paragraph holding a decorator *and* the author's prose, where removing
 * the wrapper drops the prose out of the document with nothing failing. Most of
 * what follows is about the second.
 */

const para = (...children: unknown[]) => ({
  type: "paragraph",
  format: "",
  indent: 0,
  version: 1,
  children,
});

const text = (t: string) => ({ type: "text", text: t, version: 1 });

const canvas = (notes: unknown[] = []) => ({
  type: "canvas",
  id: "c1",
  height: 480,
  notes,
  version: 1,
});

const image = (src = "/api/blob/abc") => ({ type: "image", src, version: 1 });

const state = (...children: unknown[]) => ({
  root: { type: "root", format: "", indent: 0, version: 1, children },
});

describe("unwrapBlockDecorators", () => {
  it("replaces a sole-child wrapper with the node itself", () => {
    const doc = state(para(canvas()), para(text("after")));
    const result = unwrapBlockDecorators(doc);

    expect(result).toEqual({ unwrapped: 1, shared: 0 });
    expect(doc.root.children[0]).toMatchObject({ type: "canvas" });
    expect(doc.root.children[1]).toMatchObject({ type: "paragraph" });
  });

  it("keeps the node's position among its siblings", () => {
    const doc = state(
      para(text("one")),
      para(image()),
      para(text("three")),
    );
    unwrapBlockDecorators(doc);

    expect((doc.root.children as { type: string }[]).map((c) => c.type)).toEqual([
      "paragraph",
      "image",
      "paragraph",
    ]);
  });

  it("leaves a paragraph that holds prose alongside the node", () => {
    const doc = state(para(text("see "), image(), text(" above")));
    const result = unwrapBlockDecorators(doc);

    expect(result).toEqual({ unwrapped: 0, shared: 1 });
    expect(doc.root.children[0]).toMatchObject({ type: "paragraph" });
    // The count is the point: this is the case §2 measured zero of, and a
    // migration that started reporting them would be reporting news.
    expect((doc.root.children[0] as { children: unknown[] }).children).toHaveLength(3);
  });

  it("leaves the genuinely inline types wrapped", () => {
    // Measured across every stored revision: `math` and `graph` only ever
    // appear sharing a line, which is what being inline is for.
    const doc = state(para({ type: "math", value: "x^2", version: 1 }));
    const result = unwrapBlockDecorators(doc);

    expect(result).toEqual({ unwrapped: 0, shared: 0 });
    expect(doc.root.children[0]).toMatchObject({ type: "paragraph" });
  });

  it("reaches a wrapper inside a nested editor", () => {
    // A canvas note keeps its blocks under its own editor's root, four keys
    // down. The descent is generic precisely so a container nobody listed still
    // gets migrated.
    const note = {
      id: "n1",
      x: 0,
      y: 0,
      editor: {
        editorState: {
          root: { type: "root", version: 1, children: [para(image())] },
        },
      },
    };
    const doc = state(canvas([note]));
    const result = unwrapBlockDecorators(doc);

    expect(result.unwrapped).toBe(1);
    expect(note.editor.editorState.root.children[0]).toMatchObject({
      type: "image",
    });
  });

  it("is idempotent", () => {
    const doc = state(para(canvas()));
    unwrapBlockDecorators(doc);
    const second = unwrapBlockDecorators(doc);

    expect(second).toEqual({ unwrapped: 0, shared: 0 });
  });

  it("touches nothing in a document that has none", () => {
    const doc = state(para(text("plain")), {
      type: "heading",
      tag: "h1",
      version: 1,
      children: [text("title")],
    });
    const before = JSON.stringify(doc);
    const result = unwrapBlockDecorators(doc);

    expect(result).toEqual({ unwrapped: 0, shared: 0 });
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("names exactly the three types the plan converted", () => {
    // The editor transform imports this same set. A type added here without
    // `isInline(): false` on its node class would be unwrapped in stored JSON
    // and re-wrapped by the next insert.
    expect([...UNWRAPPED_BLOCK_TYPES].sort()).toEqual([
      "canvas",
      "image",
      "sticky",
    ]);
  });
});
