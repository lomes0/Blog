import { $getRoot, LexicalEditor, LexicalNode, ParagraphNode } from "lexical";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { TableRowNode } from "@lexical/table";
import { HorizontalRuleNode } from "@/editor/nodes/HorizontalRuleNode";
import { ImageNode } from "@/editor/nodes/ImageNode";
import { GraphNode } from "@/editor/nodes/GraphNode";
import { SketchNode } from "@/editor/nodes/SketchNode";
import { MathNode } from "@/editor/nodes/MathNode";
import { AttachmentNode } from "@/editor/nodes/AttachmentNode";
import { IFrameNode } from "@/editor/nodes/IFrameNode";
import { KanbanNode } from "@/editor/nodes/KanbanNode";
import { CodeNode } from "@/editor/nodes/CodeNode";
import { TableNode } from "@/editor/nodes/TableNode";
import {
  DetailsContainerNode,
  DetailsSummaryNode,
} from "@/editor/nodes/DetailsNode";

const CHAR_BUDGET = 12000;
const PARA_TRUNCATE_AT = 200;

function escapeAttr(value: string): string {
  return value.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(
    />/g,
    "&gt;",
  );
}

function truncateText(text: string): string {
  if (text.length <= PARA_TRUNCATE_AT) return text;
  const sentence = text.indexOf(". ");
  const cut = sentence > 0 && sentence < PARA_TRUNCATE_AT
    ? sentence + 1
    : PARA_TRUNCATE_AT;
  return text.slice(0, cut) + " [truncated]";
}

function serializeNode(
  node: LexicalNode,
  budget: { remaining: number },
): string {
  if (budget.remaining <= 0) return "";

  const key = node.getKey();

  if (node instanceof HeadingNode) {
    const tag = node.getTag(); // 'h1' | 'h2' | ... | 'h6'
    const level = tag.slice(1);
    const text = escapeAttr(node.getTextContent());
    const xml = `<heading level="${level}" key="${key}">${text}</heading>`;
    budget.remaining -= xml.length;
    return xml;
  }

  if (node instanceof ParagraphNode) {
    const raw = node.getTextContent();
    if (!raw.trim()) return "";
    const text = truncateText(raw);
    const xml = `<paragraph key="${key}">${text}</paragraph>`;
    budget.remaining -= xml.length;
    return xml;
  }

  if (node instanceof QuoteNode) {
    const text = truncateText(node.getTextContent());
    const xml = `<quote key="${key}">${text}</quote>`;
    budget.remaining -= xml.length;
    return xml;
  }

  if (node instanceof ListNode) {
    const type = node.getListType() === "number" ? "numbered" : "bullet";
    const items = node
      .getChildren()
      .filter((child): child is ListItemNode => child instanceof ListItemNode)
      .map((item) => `<item>${item.getTextContent()}</item>`)
      .join("");
    const xml = `<list type="${type}" key="${key}">${items}</list>`;
    budget.remaining -= xml.length;
    return xml;
  }

  if (node instanceof HorizontalRuleNode) {
    const xml = `<hr key="${key}" />`;
    budget.remaining -= xml.length;
    return xml;
  }

  if (node instanceof GraphNode) {
    const xml = `<graph key="${key}" />`;
    budget.remaining -= xml.length;
    return xml;
  }

  if (node instanceof SketchNode) {
    const xml = `<sketch key="${key}" />`;
    budget.remaining -= xml.length;
    return xml;
  }

  if (node instanceof ImageNode) {
    const src = escapeAttr((node as ImageNode).__src ?? "");
    const alt = escapeAttr((node as ImageNode).__altText ?? "");
    const xml = `<image key="${key}" src="${src}" alt="${alt}" />`;
    budget.remaining -= xml.length;
    return xml;
  }

  if (node instanceof MathNode) {
    const latex = escapeAttr((node as MathNode).__value ?? "");
    const xml = `<math key="${key}" latex="${latex}" />`;
    budget.remaining -= xml.length;
    return xml;
  }

  if (node instanceof CodeNode) {
    const lang = escapeAttr((node as CodeNode).getLanguage() ?? "");
    const code = node.getTextContent();
    const xml = `<code key="${key}" language="${lang}">${
      truncateText(code)
    }</code>`;
    budget.remaining -= xml.length;
    return xml;
  }

  if (node instanceof TableNode) {
    const rows = (node as TableNode).getChildren();
    const rowCount = rows.length;
    const firstRow = rows[0];
    const colCount = firstRow instanceof TableRowNode
      ? firstRow.getChildrenSize()
      : 0;
    const xml = `<table key="${key}" rows="${rowCount}" cols="${colCount}" />`;
    budget.remaining -= xml.length;
    return xml;
  }

  if (node instanceof AttachmentNode) {
    const name = escapeAttr((node as AttachmentNode).getFilename());
    const xml = `<attachment key="${key}" name="${name}" />`;
    budget.remaining -= xml.length;
    return xml;
  }

  if (node instanceof IFrameNode) {
    const src = escapeAttr((node as IFrameNode).__src ?? "");
    const xml = `<iframe key="${key}" src="${src}" />`;
    budget.remaining -= xml.length;
    return xml;
  }

  if (node instanceof KanbanNode) {
    const xml = `<kanban key="${key}" />`;
    budget.remaining -= xml.length;
    return xml;
  }

  if (node instanceof DetailsContainerNode) {
    const summaryNode = node
      .getChildren()
      .find((child): child is DetailsSummaryNode =>
        child instanceof DetailsSummaryNode
      );
    const summary = escapeAttr(summaryNode?.getTextContent() ?? "");
    const contentChildren = node
      .getChildren()
      .filter((child) => !(child instanceof DetailsSummaryNode))
      .map((child) => serializeNode(child, budget))
      .filter(Boolean)
      .join("\n");
    const xml =
      `<details key="${key}" summary="${summary}">${contentChildren}</details>`;
    budget.remaining -= xml.length;
    return xml;
  }

  // Unknown / ignored node types (TextNode, LineBreakNode, etc.)
  return "";
}

export interface CopilotContext {
  /** Serialized document structure (XML-ish), bounded by CHAR_BUDGET. */
  content: string;
  /** True when the document exceeded the budget and was cut short. */
  truncated: boolean;
}

export function serializeForCopilot(editor: LexicalEditor): CopilotContext {
  return editor.getEditorState().read(() => {
    const root = $getRoot();
    const budget = { remaining: CHAR_BUDGET };
    const parts: string[] = [];
    let truncated = false;

    for (const child of root.getChildren()) {
      if (budget.remaining <= 0) {
        parts.push("<!-- document truncated -->");
        truncated = true;
        break;
      }
      const xml = serializeNode(child, budget);
      if (xml) parts.push(xml);
    }

    return { content: parts.join("\n"), truncated };
  });
}
