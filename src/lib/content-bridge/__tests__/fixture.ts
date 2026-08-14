/**
 * A document holding one of everything the bridge has to cope with: prose it
 * can rewrite, containers it descends into, and rich blocks it must preserve
 * without understanding them.
 */
import type { SerializedNode, StoredState } from "@/lib/content-bridge/types";

const text = (value: string, format = 0): SerializedNode => ({
  type: "text",
  version: 1,
  text: value,
  detail: 0,
  format,
  mode: "normal",
  style: "",
});

export const paragraph = (value: string): SerializedNode => ({
  type: "paragraph",
  version: 1,
  direction: null,
  format: "",
  indent: 0,
  children: [text(value)],
});

/** Rebuilt per call so a test mutating one cannot affect another. */
export const makeState = (): StoredState => ({
  root: {
    type: "root",
    version: 1,
    direction: null,
    format: "",
    indent: 0,
    children: [
      {
        type: "heading",
        tag: "h1",
        version: 1,
        direction: null,
        format: "",
        indent: 0,
        children: [text("Gradient descent, revisited")],
      },
      paragraph("The usual derivation starts from the gradient."),
      {
        type: "kanban",
        version: 1,
        style: "background: #eee",
        tasks: [
          {
            id: "t1",
            name: "Draft",
            stage: 0,
            priority: "high",
            tags: ["x"],
            createdAt: "a",
            updatedAt: "b",
          },
          {
            id: "t2",
            name: "Review",
            stage: 1,
            priority: "low",
            tags: [],
            createdAt: "a",
            updatedAt: "b",
          },
          {
            id: "t3",
            name: "Ship",
            stage: 1,
            priority: "medium",
            tags: [],
            createdAt: "a",
            updatedAt: "b",
          },
        ],
      },
      {
        type: "layout-container",
        version: 1,
        templateColumns: "1fr 1fr",
        direction: null,
        format: "",
        indent: 0,
        children: [
          {
            type: "layout-item",
            version: 1,
            direction: null,
            format: "",
            indent: 0,
            children: [paragraph("left column")],
          },
          {
            type: "layout-item",
            version: 1,
            direction: null,
            format: "",
            indent: 0,
            children: [
              {
                type: "graph",
                version: 1,
                value: "GEOGEBRA_STATE_BLOB",
                src: "/g.png",
                altText: "f(x)=x^2",
                width: 400,
                height: 300,
                style: "",
                id: "g1",
                showCaption: false,
                caption: { editorState: { root: {} } },
              },
            ],
          },
        ],
      },
      // The app's CodeNode carries width/wrap, which the IR does not model —
      // §4.6.1's carry-through rule is what keeps them.
      {
        type: "code",
        version: 1,
        language: "ts",
        width: 640,
        wrap: true,
        direction: null,
        format: "",
        indent: 0,
        children: [text("const x = 1;\nconst y = 2;")],
      },
      {
        type: "list",
        version: 1,
        listType: "bullet",
        start: 1,
        tag: "ul",
        direction: null,
        format: "",
        indent: 0,
        children: [
          {
            type: "listitem",
            version: 1,
            value: 1,
            indent: 0,
            direction: null,
            format: "",
            children: [text("first")],
          },
          {
            type: "listitem",
            version: 1,
            value: 2,
            indent: 0,
            direction: null,
            format: "",
            children: [text("second")],
          },
        ],
      },
      { type: "pagebreak", version: 1 },
    ],
  },
});

/** Deep-equality snapshot of a subtree, for asserting it did not move. */
export const snapshot = (node: unknown): string => JSON.stringify(node);

/** A nested editor state, shaped as `LexicalEditor.toJSON()` writes it. */
const nestedEditor = (children: SerializedNode[]) => ({
  editorState: {
    root: {
      type: "root",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children,
    },
  },
});

/**
 * A document with a sticky note in it — the container-children seam's fixture
 * (docs/plans/haklex-reprise.md §3).
 *
 * The sticky is `b2` and its two paragraphs are `b2.1` and `b2.2`, which are
 * *not* stored at `b2.children`: a note's body is a whole nested editor, so
 * they live three keys down at `editor.editorState.root.children`. The blocks
 * either side of it are there to be asserted byte-identical after a write
 * inside the note.
 */
/**
 * A document with a nested doc in it — phase 4's fixture
 * (docs/plans/haklex-reprise.md §6.1).
 *
 * Deliberately the same shape as `makeStickyState` one line up, so the two can
 * be compared: the nested doc is `b2` and its blocks are `b2.1` and `b2.2`. The
 * differences are the two the phase turns on. Its interior is a
 * `SerializedEditorState` at `doc` — `{ root }`, with no `editorState` level,
 * because `NestedDocNode.exportJSON` writes `getEditorState().toJSON()` rather
 * than `editor.toJSON()`. And the block is *block-level*, so unlike the sticky
 * it survives a load as a root child and keeps those addresses.
 */
export const makeNestedDocState = (): StoredState => ({
  root: {
    type: "root",
    version: 1,
    direction: null,
    format: "",
    indent: 0,
    children: [
      paragraph("Before the aside."),
      {
        type: "nested-doc",
        version: 1,
        title: "Working notes",
        open: true,
        doc: {
          root: {
            type: "root",
            version: 1,
            direction: null,
            format: "",
            indent: 0,
            children: [paragraph("aside one"), paragraph("aside two")],
          },
        },
      },
      paragraph("After the aside."),
    ],
  },
});

/**
 * A document with a code snippet in it — phase 5's fixture
 * (docs/plans/haklex-reprise.md §6.2).
 *
 * Deliberately the same shape as the two above, so the three can be compared:
 * the snippet is `b2` and its files are `b2.1` and `b2.2`. The difference is
 * the point of the phase — there is nothing unusual about where its children
 * are. They are `code` nodes in `children`, so every existing codec and the
 * *default* container accessor serve them with no new arm anywhere.
 */
export const makeCodeSnippetState = (): StoredState => ({
  root: {
    type: "root",
    version: 1,
    direction: null,
    format: "",
    indent: 0,
    children: [
      paragraph("Before the snippet."),
      {
        type: "code-snippet",
        version: 1,
        active: 0,
        direction: null,
        format: "",
        indent: 0,
        children: [
          codeFile("index.ts", "ts", "export const x = 1;"),
          codeFile("main.py", "python", "x = 1"),
        ],
      },
      paragraph("After the snippet."),
    ],
  },
});

/** One file of a snippet: a `code` node carrying its own name. */
const codeFile = (
  filename: string,
  language: string,
  source: string,
): SerializedNode => ({
  type: "code",
  version: 1,
  language,
  filename,
  direction: null,
  format: "",
  indent: 0,
  children: [text(source)],
});

export const makeStickyState = (): StoredState => ({
  root: {
    type: "root",
    version: 1,
    direction: null,
    format: "",
    indent: 0,
    children: [
      paragraph("Before the note."),
      {
        type: "sticky",
        version: 1,
        style: "float: right; background-color: #bceac4;",
        editor: nestedEditor([
          paragraph("note one"),
          paragraph("note two"),
        ]),
      },
      paragraph("After the note."),
    ],
  },
});
