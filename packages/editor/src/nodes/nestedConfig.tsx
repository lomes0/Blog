import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { HorizontalRuleNode } from "@/editor/nodes/HorizontalRuleNode";
import { MathNode } from "./MathNode";
import { ImageNode } from "./ImageNode";
import { SketchNode } from "./SketchNode";
import { GraphNode } from "./GraphNode";
import theme from "@/editor/theme";
import { IFrameNode } from "./IFrameNode";
import { LayoutContainerNode, LayoutItemNode } from "./LayoutNode";
import type { InitialConfigType } from "@lexical/react/LexicalComposer";
import type { CreateEditorArgs } from "lexical";
import { htmlConfig } from "@/editor/utils/htmlConfig";
import { TABLE_NODES } from "@/editor/nodes/TableNode";
import {
  DetailsContainerNode,
  DetailsContentNode,
  DetailsSummaryNode,
} from "./DetailsNode";

/**
 * Node set for editors nested inside a decorator node — a sticky note, or a
 * note on a `CanvasNode` board.
 *
 * It is the document's node set minus the container nodes that own nested
 * editors themselves: StickyNode, CanvasNode, KanbanNode and **NestedDocNode**.
 * Leaving those in would let a user put a canvas inside a note inside that same
 * canvas — or a nested doc inside itself — which recurses without bound on both
 * render and serialization. AttachmentNode and PageBreakNode are out too —
 * neither means anything at this scale.
 *
 * ### This list is a data-loss hazard, and something else enforces it
 *
 * A node type absent here does not merely fail to render: `parseEditorState`
 * throws on it, and both `StickyNode.importJSON` and `$createNestedDocNode`
 * swallow that into `console.error` and hand back an editor with its *default*
 * state — so the whole nested document comes back empty, on load, long after
 * the write that put it there reported success.
 *
 * The block IR can author two of the excluded types (`kanban`, `attachment`),
 * so the exclusion is enforced where a write can still be refused:
 * `NESTED_EDITOR_REFUSES` in `src/lib/content-bridge/containers.ts`, which
 * `src/lib/content-bridge/__tests__/nestedDoc.test.ts` pins *against this
 * array* — adding a node here without adding it there, or the reverse, turns
 * that spec red rather than costing someone a document.
 */
export const nestedEditorConfig = {
  // Must match `editor/config.tsx` — see the note there.
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
    CodeNode,
    CodeHighlightNode,
    // The same constant `editor/config.tsx` spreads, not a copy of it — see the
    // note in `TableNode/registration.ts`.
    ...TABLE_NODES,
    AutoLinkNode,
    LinkNode,
    HorizontalRuleNode,
    MathNode,
    ImageNode,
    SketchNode,
    GraphNode,
    IFrameNode,
    LayoutContainerNode,
    LayoutItemNode,
    DetailsContainerNode,
    DetailsContentNode,
    DetailsSummaryNode,
  ],
  html: htmlConfig,
} satisfies InitialConfigType & CreateEditorArgs;
