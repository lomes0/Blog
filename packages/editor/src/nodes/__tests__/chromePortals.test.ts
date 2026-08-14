// @vitest-environment jsdom
/**
 * The rule every React portal into node DOM depends on: a host element that
 * React renders into must be marked {@link setDOMUnmanaged}.
 *
 * Two nodes build such a host — `CodeNode`'s card header (the language
 * `Select`) and `CodeSnippetNode`'s tab strip — and for a while only one of
 * them said so. `contentEditable = "false"` reads like it should be enough and
 * is not: Lexical's mutation observer walks up from a mutation's target to the
 * nearest *managed* node, and only the marker stops that walk
 * (`$getNearestManagedNodePairFromDOMNode`). Without it the walk reaches the
 * node's own keyed element, React's just-portalled DOM counts as foreign
 * children of a managed node, and the observer evicts it —
 * `parentDOM.removeChild(addedDOM)` in `LexicalMutations.ts`.
 *
 * The visible half is that the chrome disappears a tick after it renders. The
 * expensive half is that React is never told: its next update or unmount of
 * that portal removes a child that is no longer there, and the
 * `NotFoundError: The node to be removed is not a child of this node` takes the
 * whole editor pane down through `EditorErrorBoundary`.
 *
 * So this asserts the eviction does not happen, against the real observer on a
 * real (non-headless) editor — which is the only place it exists. A host added
 * by a future node belongs in the table below.
 */
import "@vanilla-extract/css/disableRuntimeStyles";

/** The jsdom concession `codeCard.test.ts` documents at length. */
vi.mock("@/editor/nodes/MathNode/MathComponent", () => ({
  default: () => null,
}));

import {
  $createTextNode,
  $getRoot,
  createEditor,
  type LexicalEditor,
} from "lexical";
import { editorConfig } from "@/editor/config";
import { $createCodeNode } from "@/editor/nodes/CodeNode";
import { $createCodeSnippetNode } from "@/editor/nodes/CodeSnippetNode";
import { CARD_HEAD_CLASS, CARD_LANG_CLASS } from "@/editor/nodes/CodeNode/card";
import { SNIPPET_TABS_CLASS } from "@/editor/nodes/CodeSnippetNode/utils";

function mount(): LexicalEditor {
  const root = document.createElement("div");
  root.contentEditable = "true";
  document.body.append(root);
  const editor = createEditor({
    namespace: editorConfig.namespace,
    nodes: editorConfig.nodes,
    theme: editorConfig.theme,
    onError: (error) => {
      throw error;
    },
  });
  editor.setRootElement(root);
  return editor;
}

/** The mutation observer runs on a microtask; let it. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Stand in for the portal: append foreign DOM the way React would. */
async function survivesInside(host: HTMLElement): Promise<boolean> {
  const portalled = document.createElement("span");
  portalled.textContent = "portalled";
  host.append(portalled);
  await flush();
  return portalled.parentNode === host;
}

const HOSTS: [name: string, build: (editor: LexicalEditor) => HTMLElement][] = [
  [
    "the code card's language slot",
    (editor) => {
      let key = "";
      editor.update(() => {
        const code = $createCodeNode("typescript");
        code.append($createTextNode("const x = 1;"));
        $getRoot().append(code);
        key = code.getKey();
      }, { discrete: true });
      return editor.getElementByKey(key)!.querySelector<HTMLElement>(
        `:scope > .${CARD_HEAD_CLASS} > .${CARD_LANG_CLASS}`,
      )!;
    },
  ],
  [
    "the code snippet's tab strip",
    (editor) => {
      let key = "";
      editor.update(() => {
        const snippet = $createCodeSnippetNode();
        const file = $createCodeNode("typescript");
        file.setFilename("index.ts");
        file.append($createTextNode("const x = 1;"));
        snippet.append(file);
        $getRoot().append(snippet);
        key = snippet.getKey();
      }, { discrete: true });
      return editor.getElementByKey(key)!.querySelector<HTMLElement>(
        `:scope > .${SNIPPET_TABS_CLASS}`,
      )!;
    },
  ],
];

describe("a portal host inside node DOM", () => {
  it.each(HOSTS)("keeps what React renders into %s", async (_name, build) => {
    const host = build(mount());
    expect(host).toBeTruthy();
    expect(await survivesInside(host)).toBe(true);
  });
});
