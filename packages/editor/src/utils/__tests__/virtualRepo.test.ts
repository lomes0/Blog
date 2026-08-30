/**
 * The Copilot's view of the library (phase 4 of
 * docs/plans/archive/claude-code-lexical.md).
 *
 * The behaviour worth pinning is that search now returns a *block address*
 * rather than a line number. Under the Markdown transport a hit came back as
 * "line 14", which no other tool could accept — so the agent had to re-read the
 * whole body to act on it. A hit now carries something `read_blocks` and
 * `apply_ops` take directly.
 */
import type { Post } from "@/types";
import {
  listDocuments,
  normalizeDocId,
  resolveDocId,
  searchDocuments,
} from "@/editor/utils/virtualRepo";
import type { SerializedEditorState } from "lexical";

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

const doc = (
  id: string,
  title: string,
  children?: unknown[],
): Post =>
  ({
    id,
    title,
    seriesId: null,
    ...(children
      ? {
        data: {
          root: {
            type: "root",
            version: 1,
            direction: null,
            format: "",
            indent: 0,
            children,
          },
        } as unknown as SerializedEditorState,
      }
      : {}),
  }) as Post;

const docs: Post[] = [
  doc("d1", "Gradient descent", [
    {
      type: "heading",
      tag: "h1",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: [text("Gradient descent")],
    },
    paragraph("The usual derivation starts from the gradient."),
    {
      type: "kanban",
      version: 1,
      style: "",
      tasks: [{
        id: "t",
        name: "Rewrite the intro",
        stage: 0,
        priority: "high",
        tags: [],
        createdAt: "a",
        updatedAt: "b",
      }],
    },
  ]),
  doc("d2", "Notes about gradients", [paragraph("Nothing relevant here.")]),
  // Cloud-only: metadata is known, the body is not loaded client-side.
  doc("d3", "Gradient appendix"),
];

describe("listDocuments", () => {
  it("says which bodies are actually loaded client-side", () => {
    expect(listDocuments(docs)).toEqual([
      { id: "d1", title: "Gradient descent", seriesId: null, hasContent: true },
      {
        id: "d2",
        title: "Notes about gradients",
        seriesId: null,
        hasContent: true,
      },
      {
        id: "d3",
        title: "Gradient appendix",
        seriesId: null,
        hasContent: false,
      },
    ]);
  });
});

describe("searchDocuments", () => {
  it("returns a block address a later tool can act on", () => {
    const hits = searchDocuments(docs, "usual derivation");
    expect(hits).toEqual([
      {
        id: "d1",
        title: "Gradient descent",
        blockId: "b2",
        kind: "paragraph",
        text: "The usual derivation starts from the gradient.",
      },
    ]);
  });

  it("finds text inside a block type the agent cannot rewrite", () => {
    // A kanban card's text was invisible under the Markdown transport: the
    // whole board collapsed to an opaque token.
    const hits = searchDocuments(docs, "Rewrite the intro");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: "d1", blockId: "b3", kind: "kanban" });
  });

  it("surfaces a document by title even when its body is not local", () => {
    const hits = searchDocuments(docs, "appendix");
    expect(hits).toEqual([
      {
        id: "d3",
        title: "Gradient appendix",
        blockId: "",
        kind: "title",
        text: "Gradient appendix",
      },
    ]);
  });

  it("caps a broad query so it cannot flood the context window", () => {
    expect(searchDocuments(docs, "e", 2)).toHaveLength(2);
  });

  it("ignores an empty query rather than matching everything", () => {
    expect(searchDocuments(docs, "   ")).toEqual([]);
  });
});

describe("document references", () => {
  it("accepts a bare id and the legacy <id>.md path alike", () => {
    expect(normalizeDocId("d1")).toBe("d1");
    expect(normalizeDocId("d1.md")).toBe("d1");
    expect(resolveDocId(docs, "d1.md")).toBe("d1");
    expect(resolveDocId(docs, "d1")).toBe("d1");
    expect(resolveDocId(docs, "nope")).toBeNull();
  });
});
