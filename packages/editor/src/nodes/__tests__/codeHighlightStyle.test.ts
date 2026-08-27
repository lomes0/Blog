/**
 * That live syntax highlighting never writes a colour into stored JSON.
 *
 * This spec is the whole reason `docs/plans/archive/haklex-adoption.md` §10.7
 * cut live Shiki, reopened as `docs/plans/archive/haklex-reprise.md` §4.4. The cut was
 * against `@lexical/code-shiki`, whose `$tokenize` calls
 * `node.setStyle(stringifyTokenStyle(...))`; `CodeHighlightNode` extends
 * `TextNode`, and `TextNode.__style` **serializes**. One theme's hex literals
 * therefore end up in the revision, where dark mode renders light-theme colours
 * and every checker stays green — `check:theme` reads stylesheets, not rows in
 * Postgres.
 *
 * So the assertion is exact and boring: after a real highlight pass, every
 * `code-highlight` node in the serialized state has an empty `style`. It is
 * paired with the assertion that the pass *happened* — a spec that only checks
 * for the absence of something passes perfectly on a code block nobody
 * highlighted, which is §10.3's failure shape verbatim.
 *
 * **The editor is real, over the real registry**, per §10.3: the table-alias
 * bug shipped green because its specs called `importJSON` directly and never
 * constructed through a live editor, so `errorOnTypeKlassMismatch` never ran.
 * `editorConfig.nodes` here is the same list `Editor.tsx` mounts — including
 * the `{ replace: CodeNode }` entry that makes a runtime-created code block our
 * subclass rather than upstream's.
 */

import { createHeadlessEditor } from "@lexical/headless";
import { $createCodeNode, registerCodeHighlighting } from "@lexical/code";
import {
  $createTextNode,
  $getRoot,
  type LexicalEditor,
  type SerializedLexicalNode,
} from "lexical";
import { editorConfig } from "@/editor/config";
import {
  createShikiTokenizer,
  preloadCodeLanguage,
} from "@/editor/plugins/CodePlugin/shikiTokenizer";

interface SerializedMaybeText extends SerializedLexicalNode {
  text?: string;
  style?: string;
  highlightType?: string;
  children?: SerializedMaybeText[];
}

function newEditor(): { editor: LexicalEditor; dispose: () => void } {
  const editor = createHeadlessEditor({
    namespace: editorConfig.namespace,
    nodes: editorConfig.nodes,
    theme: editorConfig.theme,
    onError: (error: Error) => {
      throw error;
    },
  });
  const dispose = registerCodeHighlighting(
    editor,
    createShikiTokenizer(editor),
  );
  return { editor, dispose };
}

/** Put a code block in the document and let the highlight transform run. */
function insertCode(editor: LexicalEditor, language: string, source: string) {
  editor.update(
    () => {
      const code = $createCodeNode(language);
      code.append($createTextNode(source));
      $getRoot().clear().append(code);
    },
    { discrete: true },
  );
}

/** Every `code-highlight` node in the serialized state, in document order. */
function highlightNodes(editor: LexicalEditor): SerializedMaybeText[] {
  const found: SerializedMaybeText[] = [];
  const walk = (node: SerializedMaybeText) => {
    if (node.type === "code-highlight") found.push(node);
    for (const child of node.children ?? []) walk(child);
  };
  walk(editor.getEditorState().toJSON().root as unknown as SerializedMaybeText);
  return found;
}

const TS_SOURCE = [
  "// a note",
  'export const greeting: string = "hi";',
  "function add(a: number, b: number) {",
  "\treturn a + b; // sum",
  "}",
].join("\n");

describe("Shiki highlighting over the real node registry", () => {
  beforeAll(async () => {
    // `tokenize` is synchronous by contract, so the first call for any language
    // is necessarily a miss. The editor answers that with a re-highlight one
    // frame later; a spec answers it by waiting here.
    await expect(preloadCodeLanguage("typescript")).resolves.toBe(true);
  });

  it("writes no style onto any highlight node", () => {
    const { editor, dispose } = newEditor();
    try {
      insertCode(editor, "typescript", TS_SOURCE);
      const nodes = highlightNodes(editor);
      // Without this the assertion below is vacuous — which is exactly how the
      // table bug in §10.3 stayed green.
      expect(nodes.length).toBeGreaterThan(20);
      for (const node of nodes) {
        expect(node.style ?? "").toBe("");
      }
    } finally {
      dispose();
    }
  });

  it("carries the colour as a highlightType instead", () => {
    const { editor, dispose } = newEditor();
    try {
      insertCode(editor, "typescript", TS_SOURCE);
      const byText = new Map(
        highlightNodes(editor).map((node) => [node.text, node.highlightType]),
      );
      // A representative token per `--tok-*` family, so a table regression that
      // collapses everything onto one type fails here rather than looking fine.
      expect(byText.get("export")).toBe("keyword");
      expect(byText.get("const")).toBe("keyword");
      expect(byText.get("string")).toBe("builtin");
      expect(byText.get("add")).toBe("function");
      expect(byText.get("a")).toBe("variable");
      expect(byText.get("+")).toBe("operator");
      expect(byText.get(";")).toBe("punctuation");
      expect(byText.get(" a note")).toBe("comment");
      expect(byText.get("hi")).toBe("string");
    } finally {
      dispose();
    }
  });

  it("keeps the source byte-identical through a highlight pass", () => {
    // Newlines and tabs leave the tokenizer as separate nodes, so a round-trip
    // is the only thing that proves none of them was dropped or doubled.
    const { editor, dispose } = newEditor();
    try {
      insertCode(editor, "typescript", TS_SOURCE);
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe(TS_SOURCE);
      });
    } finally {
      dispose();
    }
  });

  it("leaves a language with no grammar as plain text", () => {
    const { editor, dispose } = newEditor();
    try {
      // `plain` is in the code block's own dropdown and Shiki has no grammar
      // for it. The nodes still exist — the block is still a code block — they
      // just carry no type.
      insertCode(editor, "plain", "hello world\nsecond line");
      const nodes = highlightNodes(editor);
      expect(nodes.length).toBeGreaterThan(0);
      for (const node of nodes) {
        expect(node.highlightType).toBeUndefined();
        expect(node.style ?? "").toBe("");
      }
    } finally {
      dispose();
    }
  });

  it("re-highlights once a lazily loaded grammar arrives", async () => {
    // The §4.2 contract: a language outside the preloaded set costs one frame
    // of plain code, then the tokenizer dirties the node and the transform runs
    // again. `rust` is in the dropdown and deliberately not preloaded, so this
    // is the real path and not a simulation of it.
    const { editor, dispose } = newEditor();
    try {
      insertCode(editor, "rust", 'fn main() { let x = "hi"; }');
      expect(
        highlightNodes(editor).every((n) => n.highlightType === undefined),
      ).toBe(true);

      await vi.waitFor(() => {
        const types = highlightNodes(editor).map((n) => n.highlightType);
        expect(types).toContain("keyword");
      });

      for (const node of highlightNodes(editor)) {
        expect(node.style ?? "").toBe("");
      }
    } finally {
      dispose();
    }
  });
});
