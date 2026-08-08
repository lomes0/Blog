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
 * editors themselves: StickyNode, CanvasNode, KanbanNode. Leaving those in
 * would let a user put a canvas inside a note inside that same canvas, which
 * recurses without bound on both render and serialization. AttachmentNode and
 * PageBreakNode are out too — neither means anything at this scale.
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
