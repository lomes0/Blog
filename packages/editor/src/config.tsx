import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeHighlightNode, CodeNode as LexicalCodeNode } from "@lexical/code";
import { CodeNode } from "./nodes/CodeNode";
/**
 * Two prism grammars, still here after Shiki became the tokenizer, and now
 * load-bearing for a different reason than they were.
 *
 * `registerCodeHighlighting` gates every code node on `@lexical/code-prism`'s
 * own `isCodeLanguageLoaded`, which reads `Prism.languages` — the custom
 * tokenizer does not get a say. `@lexical/code-prism` loads sixteen grammars of
 * its own; `csharp` and `bash` (and, via prism-bash's alias, `shell`) are not
 * among them, and `utils/codeLanguage.ts` appends both to the language
 * dropdown. Delete these two imports and those blocks stop reaching Shiki at
 * all: `setIsSyntaxHighlightSupported(false)`, no tokens, no colour.
 * See `plugins/CodePlugin/shikiTokenizer.ts`, `grammarIdFor`.
 */
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-bash";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { HorizontalRuleNode } from "@/editor/nodes/HorizontalRuleNode";
import { MathNode } from "./nodes/MathNode";
import { ImageNode } from "./nodes/ImageNode";
import { SketchNode } from "./nodes/SketchNode";
import { GraphNode } from "./nodes/GraphNode";
import { StickyNode } from "./nodes/StickyNode";
import { KanbanNode } from "./nodes/KanbanNode";
import { CanvasNode } from "./nodes/CanvasNode";
import { AttachmentNode } from "./nodes/AttachmentNode";
import theme from "./theme";
import { PageBreakNode } from "./nodes/PageBreakNode";
import { IFrameNode } from "./nodes/IFrameNode";
import { LayoutContainerNode, LayoutItemNode } from "./nodes/LayoutNode";
import type { InitialConfigType } from "@lexical/react/LexicalComposer";
import type { CreateEditorArgs } from "lexical";
import { htmlConfig } from "./utils/htmlConfig";
import { TABLE_NODES } from "@/editor/nodes/TableNode";
import {
  DetailsContainerNode,
  DetailsContentNode,
  DetailsSummaryNode,
} from "./nodes/DetailsNode";

export const editorConfig = {
  // Shared verbatim with `nodes/nestedConfig.tsx` and `nodes/ImageNode/config.tsx`.
  // Lexical only restores rich node state on paste when the source and target
  // editors report the same namespace, so these three must not drift apart.
  namespace: "blog-simple",
  // The editor theme
  theme: theme,
  // Handling of errors during update
  onError(error: Error) {
    throw error;
  },
  // Any custom nodes go here
  nodes: [
    HeadingNode,
    ListNode,
    ListItemNode,
    QuoteNode,
    // Register our CodeNode subclass as THE handler for the "code" type, with a
    // replacement that upgrades any plain @lexical/code CodeNode to ours.
    //
    // Lexical keys its registry by node type string, one entry per type. Import
    // (parseSerializedNode) uses entry.klass.importJSON — so klass MUST be our
    // CodeNode to restore width/wrap. The only entry shape giving both
    // klass=CodeNode and a replace fn is `replace: CodeNode`. (A separate
    // `CodeNode` list item would overwrite this entry's replace, leaving
    // runtime-created blocks as base LexicalCodeNode — undetectable by the
    // toolbar/chrome, which is the bug this fixes.)
    //
    // **This is not the shape the table entries use, and the difference is not
    // a style choice.** Owning a type string upstream also constructs is only
    // safe when upstream constructs it through `$create`, which resolves the
    // registry entry and instantiates `klass` — ours — directly. At 0.49
    // `$createCodeNode` in `@lexical/code-core` is
    // `$create(CodeNode).setLanguage(…)`, so it lands on ours and the
    // constructor's `errorOnTypeKlassMismatch` is satisfied. `@lexical/table`
    // still writes `$applyNodeReplacement(new TableNode())`, where the `new`
    // runs first — so its slots must hold upstream's own classes or every
    // insertion throws. See `nodes/TableNode/registration.ts`.
    //
    // Because `$create` ignores the `with` fn, the fn here only covers the
    // residual `$applyNodeReplacement` paths (a plain @lexical/code node
    // arriving from somewhere that still builds one). Keep it.
    //
    // Dev builds warn "Override for CodeNode specifies 'replace' without
    // 'withKlass'". We cannot satisfy it here and should not try: registration
    // asserts `replaceWithKlass.prototype instanceof klass`, a *strict*
    // subclass, which a same-class entry can never be. The table entries do
    // carry `withKlass`, because there the replaced class and the replacement
    // are genuinely different classes.
    {
      replace: CodeNode,
      with: (node: LexicalCodeNode) => new CodeNode(node.getLanguage()),
    },
    CodeHighlightNode,
    // Our two subclasses, upstream's three classes, and the `replace` entries
    // that join them. One shared constant because the shape is load-bearing and
    // getting it wrong throws on every table insertion — see the note there.
    ...TABLE_NODES,
    AutoLinkNode,
    LinkNode,
    HorizontalRuleNode,
    MathNode,
    ImageNode,
    SketchNode,
    GraphNode,
    StickyNode,
    KanbanNode,
    CanvasNode,
    AttachmentNode,
    PageBreakNode,
    IFrameNode,
    LayoutContainerNode,
    LayoutItemNode,
    DetailsContainerNode,
    DetailsContentNode,
    DetailsSummaryNode,
  ],
  html: htmlConfig,
} satisfies InitialConfigType & CreateEditorArgs;
