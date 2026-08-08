import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { TableCellNode, TableNode } from "./nodes/TableNode";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeHighlightNode, CodeNode as LexicalCodeNode } from "@lexical/code";
import { CodeNode } from "./nodes/CodeNode";
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
import {
  LegacyTableCellNode,
  LegacyTableNode,
  LexicalTableRowNode,
} from "@/editor/nodes/TableNode";
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
    // CodeNode to restore width/wrap. Runtime creation (markdown ```, paste) goes
    // through @lexical/code's $createCodeNode -> $applyNodeReplacement, keyed on
    // the shared "code" type — so the entry MUST also carry a `replace` fn to
    // upgrade those base nodes. The only entry shape giving both klass=CodeNode
    // and a replace fn is `replace: CodeNode`. (A separate `CodeNode` list item
    // would overwrite this entry's replace, leaving runtime-created blocks as
    // base LexicalCodeNode — undetectable by the toolbar/chrome, which is the
    // bug this fixes.)
    //
    // Still true at Lexical 0.49, with two things worth recording:
    //
    // 1. Runtime creation increasingly goes through `$create`, which resolves
    //    the registry entry and constructs `klass` — ours — directly, ignoring
    //    the `with` fn (its own doc calls those deprecated). The fn is still
    //    needed for the residual `$applyNodeReplacement` paths, which is what
    //    `$createCodeNode` in `@lexical/code-core` still uses.
    // 2. Dev builds now warn "Override for CodeNode specifies 'replace'
    //    without 'withKlass'". We cannot satisfy it here and should not try:
    //    registration asserts `replaceWithKlass.prototype instanceof klass`, a
    //    *strict* subclass, which a same-class entry can never be. The table
    //    entries below do carry `withKlass`, because there the replaced class
    //    and the replacement are genuinely different classes.
    {
      replace: CodeNode,
      with: (node: LexicalCodeNode) => new CodeNode(node.getLanguage()),
    },
    CodeHighlightNode,
    TableNode,
    TableCellNode,
    // Type aliases for tables stored before the rename. `LegacyTableNode` owns
    // the `"table"` registry slot and hands `importJSON` to `TableNode`; see
    // the note on that class for why upstream's own class can no longer do it.
    // `withKlass` does the other half: it makes upstream's `TableNode` resolve
    // to ours for `registerNodeTransform` / `registerMutationListener`, which
    // is what lets `@lexical/table`'s `registerTablePlugin` and
    // `registerTableSelectionObserver` drive our subclasses.
    {
      replace: LegacyTableNode,
      with: (_node: LegacyTableNode) => new TableNode(),
      withKlass: TableNode,
    },
    {
      replace: LegacyTableCellNode,
      with: (node: LegacyTableCellNode) =>
        new TableCellNode(
          node.__headerState,
          node.__colSpan,
          node.__width,
        ),
      withKlass: TableCellNode,
    },
    LexicalTableRowNode,
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
