// @vitest-environment jsdom
/**
 * The code block card, as the reader actually receives it
 * (docs/plans/archive/code-block-card.md §4.1, §4.3, §6).
 *
 * **Through `exportDOM`, not by reading the component.** §6 asks for that
 * explicitly, and it is the difference between testing the rule and testing a
 * description of it: the header is a decision the *node* makes, because
 * `exportDOM` has to make the same one `createDOM` does and has no parent
 * selector to consult. So every assertion here comes out of
 * `$generateHtmlFromNodes` over a real editor on the real registry — including
 * `config.tsx`'s `{ replace: CodeNode }` entry, without which the class under
 * test is not the class that runs (the rule
 * docs/plans/archive/haklex-adoption.md §10.3 draws from the table-alias bug).
 *
 * The four claims:
 *
 *   - a standalone `code` exports a card header, and its body holds the code;
 *   - a `code` inside a `code-snippet` exports **none** — the tab strip is the
 *     header, and a second one under it would repeat the filename it just
 *     showed (§4.1). Same for a layout column, which has always been
 *     chrome-less;
 *   - collapsed-ness **does not serialize** (§4.3). Toggled through the real
 *     delegated listener, against the real exported markup, and the editor
 *     state is byte-identical afterwards;
 *   - the line-number gutter survives the children moving into the body, which
 *     is the one thing the restructure could have broken without any checker
 *     noticing — `data-gutter` is counted from `:scope > br`, and after the
 *     move they are not that any more.
 */
import "@vanilla-extract/css/disableRuntimeStyles";

/**
 * The one concession jsdom forces.
 *
 * `MathComponent.tsx` runs `window.MathfieldElement.soundsDirectory = null` at
 * module scope, guarded only by `typeof window !== "undefined"` — which is
 * false under `environment: "node"` (where `codeSnippet.test.ts` gets away with
 * importing the same config) and true here. `applyFigureLayout.test.ts` records
 * the same trap and sidesteps it by not importing a node at all; this spec has
 * to have the registry, so it replaces the decorator's *view* and keeps
 * everything else — including the `{ replace: CodeNode }` entry that makes
 * `type: "code"` resolve to our subclass, without which §10.3 says this spec
 * would be testing the wrong class.
 */
vi.mock("@/editor/nodes/MathNode/MathComponent", () => ({
  default: () => null,
}));

import { createHeadlessEditor } from "@lexical/headless";
import { $generateHtmlFromNodes } from "@lexical/html";
import { $getRoot, type LexicalEditor } from "lexical";
import { editorConfig } from "@/editor/config";
import { CODE_SNIPPET_TYPE } from "@/editor/nodes/CodeSnippetNode";
import {
  CAN_COLLAPSE_CLASS,
  CARD_BODY_CLASS,
  CARD_FILENAME_CLASS,
  CARD_HEAD_CLASS,
  CODE_ACTION_ATTR,
  COLLAPSED_CLASS,
  HAS_HEAD_CLASS,
} from "@/editor/nodes/CodeNode/card";
import { registerCodeCardActions } from "@/editor/nodes/CodeNode/actions";
import { COLLAPSED_LINES } from "@/editor/nodes/CodeNode/collapse";

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

const code = (
  source: string,
  extra: Record<string, unknown> = {},
) => ({
  type: "code",
  version: 1,
  language: "typescript",
  direction: null,
  format: "",
  indent: 0,
  children: source.split("\n").flatMap((line, index) =>
    index === 0
      ? [text(line)]
      : [{ type: "linebreak", version: 1 }, text(line)]
  ),
  ...extra,
});

const state = (...blocks: unknown[]) => ({
  root: {
    type: "root",
    version: 1,
    direction: null,
    format: "",
    indent: 0,
    children: blocks,
  },
});

/** Load a state, export it, and hand back both the editor and the markup. */
function render(
  blocks: unknown[],
): { editor: LexicalEditor; container: HTMLElement } {
  const editor = newEditor();
  editor.setEditorState(
    editor.parseEditorState(JSON.stringify(state(...blocks))),
  );
  const html = editor.getEditorState().read(() => $generateHtmlFromNodes(editor));
  const container = document.createElement("div");
  container.innerHTML = html;
  return { editor, container };
}

const cards = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>("pre.LexicalTheme__code"));

const LONG = Array.from(
  { length: COLLAPSED_LINES * 4 },
  (_, i) => `const line${i} = ${i};`,
).join("\n");

describe("a standalone code block", () => {
  it("exports a card header with the language, and the code inside the body", () => {
    const { container } = render([code("const x = 1;\nconst y = 2;")]);
    const [card] = cards(container);

    expect(card).toBeTruthy();
    expect(card.classList.contains(HAS_HEAD_CLASS)).toBe(true);

    const head = card.querySelector(`:scope > .${CARD_HEAD_CLASS}`);
    expect(head).toBeTruthy();
    expect(head?.textContent).toContain("TypeScript");

    // Copy and collapse are markup, not handlers — which is the whole of §4.2.
    expect(head?.querySelector(`[${CODE_ACTION_ATTR}="copy"]`)).toBeTruthy();
    expect(head?.querySelector(`[${CODE_ACTION_ATTR}="collapse"]`)).toBeTruthy();
    // Word wrap writes node state and so has no meaning in a published article.
    expect(head?.querySelector(`[${CODE_ACTION_ATTR}="wrap"]`)).toBeNull();

    const body = card.querySelector<HTMLElement>(`:scope > .${CARD_BODY_CLASS}`);
    expect(body?.textContent).toBe("const x = 1;const y = 2;");
    // The header is not in the copyable region; `actions.ts` copies the body
    // for exactly this reason.
    expect(body?.textContent).not.toContain("TypeScript");
  });

  it("keeps the line-number gutter after the children move into the body", () => {
    const { container } = render([code("one\ntwo\nthree")]);
    const [card] = cards(container);
    expect(card.getAttribute("data-gutter")).toBe("1\n2\n3");
    expect(card.querySelectorAll(`:scope > .${CARD_BODY_CLASS} > br`).length)
      .toBe(2);
  });

  it("renders the filename phase 5 stored and nothing displayed", () => {
    const { container } = render([code("x", { filename: "server.ts" })]);
    const [card] = cards(container);
    expect(
      card.querySelector(`.${CARD_FILENAME_CLASS}`)?.textContent,
    ).toBe("server.ts");
  });

  it("offers collapse only above the threshold", () => {
    const short = cards(render([code("const x = 1;")]).container)[0];
    expect(short.classList.contains(CAN_COLLAPSE_CLASS)).toBe(false);
    // Expanded by default either way — §7.2: a long block collapsed on arrival
    // is good for scanning and bad for reading.
    expect(short.classList.contains(COLLAPSED_CLASS)).toBe(false);

    const long = cards(render([code(LONG)]).container)[0];
    expect(long.classList.contains(CAN_COLLAPSE_CLASS)).toBe(true);
    expect(long.classList.contains(COLLAPSED_CLASS)).toBe(false);
  });
});

describe("a code block whose parent draws its own heading", () => {
  it("exports no card header inside a code snippet, while a standalone one does", () => {
    const { container } = render([
      code("standalone();"),
      {
        type: CODE_SNIPPET_TYPE,
        version: 1,
        active: 0,
        direction: null,
        format: "",
        indent: 0,
        children: [code("inSnippet();", { filename: "index.ts" })],
      },
    ]);

    const [standalone, file] = cards(container);
    expect(standalone.querySelector(`:scope > .${CARD_HEAD_CLASS}`)).toBeTruthy();
    expect(file.querySelector(`:scope > .${CARD_HEAD_CLASS}`)).toBeNull();
    expect(file.classList.contains(HAS_HEAD_CLASS)).toBe(false);

    // The body treatment still applies — only the heading is suppressed.
    expect(file.querySelector(`:scope > .${CARD_BODY_CLASS}`)?.textContent)
      .toBe("inSnippet();");

    // And the filename is still on the element, because the snippet's own
    // `exportDOM` reads it to caption the file.
    expect(file.getAttribute("data-filename")).toBe("index.ts");
    // …once, not twice: the tab strip's caption is the header here.
    expect(file.querySelector(`.${CARD_FILENAME_CLASS}`)).toBeNull();
  });

  it("exports no card header inside a layout column", () => {
    const { container } = render([{
      type: "layout-container",
      version: 1,
      templateColumns: "1fr 1fr",
      direction: null,
      format: "",
      indent: 0,
      children: [{
        type: "layout-item",
        version: 1,
        direction: null,
        format: "",
        indent: 0,
        children: [code("inColumn();")],
      }],
    }]);

    const [inColumn] = cards(container);
    expect(inColumn).toBeTruthy();
    expect(inColumn.querySelector(`:scope > .${CARD_HEAD_CLASS}`)).toBeNull();
  });
});

describe("the editor's copy of the same decision", () => {
  /**
   * `createDOM` is never reached by a headless editor, so it is called by hand
   * — but on nodes from a real parsed state, so `getParent()` answers what it
   * answers in the app. The claim is that the two surfaces cannot diverge: the
   * same rule, off the same `card.ts`, in both directions.
   */
  const build = (blocks: unknown[]): HTMLElement[] => {
    const editor = newEditor();
    editor.setEditorState(
      editor.parseEditorState(JSON.stringify(state(...blocks))),
    );
    return editor.getEditorState().read(() => {
      const found: HTMLElement[] = [];
      const walk = (node: ReturnType<typeof $getRoot>) => {
        for (const child of node.getChildren()) {
          if (child.getType() === "code") {
            const codeNode = child as unknown as {
              createDOM: (config: unknown) => HTMLElement;
              getDOMSlot: (element: HTMLElement) => { element: HTMLElement };
            };
            const dom = codeNode.createDOM({
              namespace: "test",
              theme: editorConfig.theme,
            });
            // The slot is the body, which is what keeps reconciliation off the
            // header — the `CodeSnippetNode` technique, applied to text children.
            expect(codeNode.getDOMSlot(dom).element).toBe(
              dom.querySelector(`:scope > .${CARD_BODY_CLASS}`),
            );
            found.push(dom);
          } else if ("getChildren" in child) {
            walk(child as ReturnType<typeof $getRoot>);
          }
        }
      };
      walk($getRoot());
      return found;
    });
  };

  it("builds the header for a standalone block and omits it in a snippet", () => {
    const [standalone, inSnippet] = build([
      code("standalone();"),
      {
        type: CODE_SNIPPET_TYPE,
        version: 1,
        active: 0,
        direction: null,
        format: "",
        indent: 0,
        children: [code("inSnippet();")],
      },
    ]);

    expect(standalone.querySelector(`:scope > .${CARD_HEAD_CLASS}`)).toBeTruthy();
    // The editor's header leaves the language slot empty for the portalled
    // `Select`; the reader's carries a static chip. Same builder, one flag.
    expect(standalone.querySelector(`.${CARD_HEAD_CLASS} .code-card-lang`)
      ?.childElementCount).toBe(0);
    expect(standalone.querySelector(`[${CODE_ACTION_ATTR}="wrap"]`)).toBeTruthy();

    expect(inSnippet.querySelector(`:scope > .${CARD_HEAD_CLASS}`)).toBeNull();
    expect(inSnippet.classList.contains(HAS_HEAD_CLASS)).toBe(false);
  });
});

describe("collapsed-ness", () => {
  it("does not serialize (§4.3)", () => {
    const { editor, container } = render([code(LONG)]);
    document.body.append(container);
    const dispose = registerCodeCardActions(container);
    try {
      const before = JSON.stringify(editor.getEditorState().toJSON());
      expect(before).not.toContain("collapsed");

      const [card] = cards(container);
      const fold = card.querySelector<HTMLElement>(
        `[${CODE_ACTION_ATTR}="collapse"]`,
      );
      expect(fold).toBeTruthy();

      fold!.click();
      // The toggle really happened — without this the assertion below passes
      // on a button nobody wired up.
      expect(card.classList.contains(COLLAPSED_CLASS)).toBe(true);
      expect(fold!.getAttribute("aria-label")).toBe("Expand code");

      expect(JSON.stringify(editor.getEditorState().toJSON())).toBe(before);

      fold!.click();
      expect(card.classList.contains(COLLAPSED_CLASS)).toBe(false);
      expect(JSON.stringify(editor.getEditorState().toJSON())).toBe(before);
    } finally {
      dispose();
      container.remove();
    }
  });

  it("is absent from a code node's serialized shape entirely", () => {
    // The other half: not merely equal before and after, but no field for it.
    // A `collapsed` key in `exportJSON` would cost a `check:nodes` arm and a
    // migration, for a preference.
    const editor = newEditor();
    editor.setEditorState(
      editor.parseEditorState(JSON.stringify(state(code("x")))),
    );
    const json = editor.getEditorState().read(() =>
      $getRoot().getFirstChildOrThrow().exportJSON()
    ) as Record<string, unknown>;
    expect(Object.keys(json)).not.toContain("collapsed");
    expect(Object.keys(json)).not.toContain("isCollapsed");
  });
});
