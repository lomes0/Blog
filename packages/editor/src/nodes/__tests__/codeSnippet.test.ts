/**
 * `CodeSnippetNode`, through a real editor over the real registry
 * (docs/plans/archive/haklex-reprise.md §6.2, and §10.3's rule that a node spec which
 * never builds an editor is not testing registration).
 *
 * Four claims are load-bearing and none of them is visible by reading the
 * class:
 *
 *   - **Its files are ordinary `code` nodes in `children`.** That is what lets
 *     the bridge address them with the default accessor and no new codec —
 *     `src/lib/content-bridge/__tests__/codeSnippet.test.ts` is the other half
 *     of this claim, and it would pass against a fixture the node class does
 *     not actually produce. This asserts the shape the class *writes*.
 *   - **It stays block-level across a load.** An element node cannot be wrapped
 *     in a paragraph the way an inline decorator is (§2.4), but the phase is
 *     worth nothing if that is not true, so it is asserted rather than
 *     reasoned about.
 *   - **A file's name survives.** `filename` is on `CodeNode`, and reaches
 *     storage only because our subclass owns the `code` type through
 *     `config.tsx`'s `{ replace: CodeNode }` entry. Upstream's class drops it.
 *   - **Phase 2 highlights a file inside a snippet.** No new path was added for
 *     it; `registerCodeHighlighting` transforms `code` nodes wherever they sit.
 *     Asserted with phase 2's own rule attached: no colour in `style`.
 */
import { createHeadlessEditor } from "@lexical/headless";
import { registerCodeHighlighting } from "@lexical/code";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $insertNodes,
  type LexicalEditor,
} from "lexical";
import { editorConfig } from "@/editor/config";
import { nestedEditorConfig } from "@/editor/nodes/nestedConfig";
import { $createCodeNode } from "@/editor/nodes/CodeNode";
import {
  $createCodeSnippetNode,
  CODE_SNIPPET_TYPE,
  CodeSnippetNode,
} from "@/editor/nodes/CodeSnippetNode";
import { registerCodeSnippetGuard } from "@/editor/nodes/CodeSnippetNode/guard";
import {
  createShikiTokenizer,
  preloadCodeLanguage,
} from "@/editor/plugins/CodePlugin/shikiTokenizer";

type Json = Record<string, unknown>;

const newEditor = (): LexicalEditor =>
  createHeadlessEditor({
    namespace: editorConfig.namespace,
    nodes: editorConfig.nodes,
    theme: editorConfig.theme,
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

const file = (filename: string, language: string, source: string) => ({
  type: "code",
  version: 1,
  language,
  filename,
  direction: null,
  format: "",
  indent: 0,
  children: [text(source)],
});

/** A stored document whose second block is a snippet carrying every field. */
const STATE = {
  root: {
    type: "root",
    version: 1,
    direction: null,
    format: "",
    indent: 0,
    children: [
      paragraph("Before the snippet."),
      {
        type: CODE_SNIPPET_TYPE,
        version: 1,
        active: 1,
        direction: null,
        format: "",
        indent: 0,
        $: { blockId: "id_code_snippet" },
        children: [
          file("index.ts", "typescript", "export const x = 1;"),
          file("main.py", "python", "x = 1"),
        ],
      },
      paragraph("After the snippet."),
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

const filesOf = (node: Json): Json[] => (node.children ?? []) as Json[];

const textOf = (node: Json): string =>
  ((node.children ?? []) as Json[])
    .map((child) => String(child.text ?? ""))
    .join("");

describe("a stored code snippet survives a load", () => {
  it("stays a direct child of the root — it is not wrapped in a paragraph", () => {
    expect(rootChildren(roundTrip(STATE)).map((node) => node.type)).toEqual([
      "paragraph",
      CODE_SNIPPET_TYPE,
      "paragraph",
    ]);
  });

  it("keeps its files as `code` nodes in `children`", () => {
    // The bridge's whole claim in one assertion: nothing about where these
    // children live is unusual, so nothing in `containers.ts` has to know.
    const snippet = rootChildren(roundTrip(STATE))[1];
    expect(filesOf(snippet).map((node) => node.type)).toEqual(["code", "code"]);
    expect(filesOf(snippet).map(textOf)).toEqual([
      "export const x = 1;",
      "x = 1",
    ]);
  });

  it("keeps each file's name and language", () => {
    const snippet = rootChildren(roundTrip(STATE))[1];
    expect(filesOf(snippet).map((node) => node.filename)).toEqual([
      "index.ts",
      "main.py",
    ]);
    expect(filesOf(snippet).map((node) => node.language)).toEqual([
      "typescript",
      "python",
    ]);
  });

  it("keeps the open tab and its node state", () => {
    const snippet = rootChildren(roundTrip(STATE))[1];
    expect(snippet.active).toBe(1);
    expect(snippet.$).toEqual({ blockId: "id_code_snippet" });
  });

  it("leaves the blocks around it alone", () => {
    const children = rootChildren(roundTrip(STATE));
    expect([textOf(children[0]), textOf(children[2])]).toEqual([
      "Before the snippet.",
      "After the snippet.",
    ]);
  });

  it("clamps an open tab that names a file which is no longer there", () => {
    const editor = newEditor();
    editor.setEditorState(
      editor.parseEditorState(
        JSON.stringify({
          root: {
            ...STATE.root,
            children: [{
              ...STATE.root.children[1],
              active: 7,
              children: [file("only.ts", "typescript", "x")],
            }],
          },
        }),
      ),
    );
    editor.getEditorState().read(() => {
      const snippet = $getRoot().getFirstChild();
      expect(snippet).toBeInstanceOf(CodeSnippetNode);
      expect((snippet as CodeSnippetNode).getActiveIndex()).toBe(0);
    });
    // Clamped on read, not repaired on load: the stored value is still 7, so a
    // file inserted later re-opens the tab the author had chosen.
    const stored = rootChildren(
      editor.getEditorState().toJSON() as unknown as Json,
    )[0];
    expect(stored.active).toBe(7);
  });
});

describe("inserting one", () => {
  /** What `CodeSnippetPlugin`'s command does, minus the command plumbing. */
  const insert = (): Json => {
    const editor = newEditor();
    editor.update(
      () => {
        const first = $createParagraphNode();
        first.append($createTextNode("hi"));
        $getRoot().append(first);
        first.selectEnd();
        const snippet = $createCodeSnippetNode();
        const only = $createCodeNode("plain");
        only.setFilename("file1");
        snippet.append(only);
        $insertNodes([snippet]);
      },
      { discrete: true },
    );
    return editor.getEditorState().toJSON() as unknown as Json;
  };

  it("lands as a block of its own, not inside the paragraph", () => {
    const children = rootChildren(insert());
    const found = children.filter((node) => node.type === CODE_SNIPPET_TYPE);
    expect(found).toHaveLength(1);
    // Nothing anywhere below the top level — which is what a
    // `$wrapNodeInElement` like StickyPlugin's would produce.
    expect(JSON.stringify(children.filter((n) => n.type === "paragraph")))
      .not.toContain(CODE_SNIPPET_TYPE);
  });

  it("starts on its first file", () => {
    const found = rootChildren(insert()).find((n) =>
      n.type === CODE_SNIPPET_TYPE
    )!;
    expect(found.active).toBe(0);
    expect(filesOf(found).map((node) => node.filename)).toEqual(["file1"]);
  });
});

/**
 * The invariant, and the ordinary keystroke that breaks it.
 *
 * `CodeNode.collapseAtStart` — Backspace at the head of the first line —
 * replaces the code block with a paragraph *in place*, which inside a snippet
 * means a paragraph as a child of the snippet. The transform moves it out; the
 * author's text is not the snippet's to delete.
 */
describe("the files-only guard", () => {
  const withGuard = () => {
    const editor = newEditor();
    registerCodeSnippetGuard(editor);
    return editor;
  };

  it("moves a stray block out, directly after the snippet", () => {
    const editor = withGuard();
    editor.update(
      () => {
        const snippet = $createCodeSnippetNode();
        const only = $createCodeNode("plain");
        only.append($createTextNode("kept"));
        const stray = $createParagraphNode();
        stray.append($createTextNode("typed by accident"));
        snippet.append(only, stray);
        $getRoot().append(snippet);
      },
      { discrete: true },
    );

    const out = editor.getEditorState().toJSON() as unknown as Json;
    expect(rootChildren(out).map((node) => node.type)).toEqual([
      CODE_SNIPPET_TYPE,
      "paragraph",
    ]);
    expect(filesOf(rootChildren(out)[0]).map((node) => node.type)).toEqual([
      "code",
    ]);
    expect(textOf(rootChildren(out)[1])).toBe("typed by accident");
  });

  it("keeps several strays in the order they were in", () => {
    const editor = withGuard();
    editor.update(
      () => {
        const snippet = $createCodeSnippetNode();
        const only = $createCodeNode("plain");
        snippet.append(only);
        for (const value of ["one", "two", "three"]) {
          const stray = $createParagraphNode();
          stray.append($createTextNode(value));
          snippet.append(stray);
        }
        $getRoot().append(snippet);
      },
      { discrete: true },
    );

    const out = editor.getEditorState().toJSON() as unknown as Json;
    expect(rootChildren(out).slice(1).map(textOf)).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  it("removes a snippet left holding nothing", () => {
    const editor = withGuard();
    editor.update(
      () => {
        const snippet = $createCodeSnippetNode();
        const stray = $createParagraphNode();
        stray.append($createTextNode("all that is left"));
        snippet.append(stray);
        $getRoot().append(snippet);
      },
      { discrete: true },
    );

    const out = editor.getEditorState().toJSON() as unknown as Json;
    expect(rootChildren(out).map((node) => node.type)).toEqual(["paragraph"]);
  });

  it("leaves a snippet of files alone", () => {
    const editor = withGuard();
    editor.setEditorState(editor.parseEditorState(JSON.stringify(STATE)));
    const out = editor.getEditorState().toJSON() as unknown as Json;
    expect(filesOf(rootChildren(out)[1])).toHaveLength(2);
  });
});

/**
 * Phase 2, inside a snippet. Nothing was added to make this work — which is
 * exactly why it needs asserting, because "nothing was added" and "nothing
 * happens" look identical from the outside.
 */
describe("a snippet's files highlight through the Shiki tokenizer", () => {
  beforeAll(async () => {
    await expect(preloadCodeLanguage("typescript")).resolves.toBe(true);
  });

  const highlightNodes = (editor: LexicalEditor): Json[] => {
    const found: Json[] = [];
    const walk = (node: Json) => {
      if (node.type === "code-highlight") found.push(node);
      for (const child of (node.children ?? []) as Json[]) walk(child);
    };
    walk((editor.getEditorState().toJSON() as unknown as Json).root as Json);
    return found;
  };

  const highlighted = () => {
    const editor = newEditor();
    const dispose = registerCodeHighlighting(
      editor,
      createShikiTokenizer(editor),
    );
    editor.update(
      () => {
        const snippet = $createCodeSnippetNode();
        const only = $createCodeNode("typescript");
        only.setFilename("index.ts");
        only.append(
          $createTextNode('export const greeting: string = "hi";'),
        );
        snippet.append(only);
        $getRoot().clear().append(snippet);
      },
      { discrete: true },
    );
    return { editor, dispose };
  };

  it("tokenizes the file, and writes no colour into it", () => {
    const { editor, dispose } = highlighted();
    try {
      const nodes = highlightNodes(editor);
      // Paired with the style assertion on purpose: without it, a snippet
      // nobody highlighted would pass the line below perfectly.
      expect(nodes.length).toBeGreaterThan(5);
      expect(nodes.map((node) => node.highlightType)).toContain("keyword");
      for (const node of nodes) expect(node.style ?? "").toBe("");
    } finally {
      dispose();
    }
  });

  it("keeps the file's source and its name through the pass", () => {
    const { editor, dispose } = highlighted();
    try {
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe(
          'export const greeting: string = "hi";',
        );
      });
      const out = editor.getEditorState().toJSON() as unknown as Json;
      expect(filesOf(rootChildren(out)[0])[0].filename).toBe("index.ts");
    } finally {
      dispose();
    }
  });
});

describe("registration", () => {
  it("is registered on the document editor", () => {
    expect(newEditor().hasNodes([CodeSnippetNode])).toBe(true);
  });

  it("is not registered on the nested editor's node set", () => {
    // Not a recursion guard — a snippet holds code blocks. The nested config
    // registers upstream's `CodeNode`, which writes no `filename`, so a snippet
    // in a sticky note would lose every tab label on its first load. The bridge
    // refuses the write instead; `content-bridge/__tests__/nestedDoc.test.ts`
    // pins that this absence and `NESTED_EDITOR_REFUSES` agree.
    expect(nestedEditorConfig.nodes).not.toContain(CodeSnippetNode);
    const nested = createHeadlessEditor({
      namespace: nestedEditorConfig.namespace,
      nodes: nestedEditorConfig.nodes,
      onError: (error) => {
        throw error;
      },
    });
    expect(nested.hasNodes([CodeSnippetNode])).toBe(false);
  });
});
