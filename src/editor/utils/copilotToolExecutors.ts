import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  LexicalEditor,
  LexicalNode,
} from "lexical";
import { $createHeadingNode } from "@lexical/rich-text";
import { $createListItemNode, $createListNode } from "@lexical/list";
import { $createCodeNode } from "@lexical/code";
import { $createTableNodeWithDimensions } from "@/editor/nodes/TableNode";
import { $createHorizontalRuleNode } from "@/editor/nodes/HorizontalRuleNode";
import { $createMathNode } from "@/editor/nodes/MathNode";
import type { CopilotAction } from "@/types";

function insertAfterNodeOrAtEnd(node: LexicalNode, afterNodeKey?: string) {
  if (afterNodeKey) {
    const anchor = $getNodeByKey(afterNodeKey);
    if (anchor) {
      anchor.insertAfter(node);
      return;
    }
  }
  $getRoot().append(node);
}

function removeNode(editor: LexicalEditor, params: Record<string, unknown>) {
  editor.update(() => {
    const node = $getNodeByKey(params.nodeKey as string);
    node?.remove();
  });
}

function replaceText(editor: LexicalEditor, params: Record<string, unknown>) {
  editor.update(() => {
    const node = $getNodeByKey(params.nodeKey as string);
    if (!node) return;
    const para = $createParagraphNode();
    para.append($createTextNode(params.newText as string));
    node.replace(para);
  });
}

function replaceSelection(
  editor: LexicalEditor,
  params: Record<string, unknown>,
) {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    selection.insertText(params.newText as string);
  });
}

function insertParagraph(
  editor: LexicalEditor,
  params: Record<string, unknown>,
) {
  editor.update(() => {
    const para = $createParagraphNode();
    para.append($createTextNode(params.text as string));
    insertAfterNodeOrAtEnd(para, params.afterNodeKey as string | undefined);
  });
}

function insertTable(editor: LexicalEditor, params: Record<string, unknown>) {
  editor.update(() => {
    const headers = params.headers as string[] | undefined;
    const table = $createTableNodeWithDimensions(
      params.rows as number,
      params.cols as number,
      (headers?.length ?? 0) > 0,
    );
    insertAfterNodeOrAtEnd(table, params.afterNodeKey as string | undefined);
  });
}

function insertHeading(editor: LexicalEditor, params: Record<string, unknown>) {
  editor.update(() => {
    const heading = $createHeadingNode(
      `h${params.level}` as `h${1 | 2 | 3 | 4 | 5 | 6}`,
    );
    heading.append($createTextNode(params.text as string));
    insertAfterNodeOrAtEnd(heading, params.afterNodeKey as string | undefined);
  });
}

function insertList(editor: LexicalEditor, params: Record<string, unknown>) {
  editor.update(() => {
    const list = $createListNode(
      params.type === "bullet" ? "bullet" : "number",
    );
    for (const item of params.items as string[]) {
      const li = $createListItemNode();
      li.append($createTextNode(item));
      list.append(li);
    }
    insertAfterNodeOrAtEnd(list, params.afterNodeKey as string | undefined);
  });
}

function insertCodeBlock(
  editor: LexicalEditor,
  params: Record<string, unknown>,
) {
  editor.update(() => {
    const code = $createCodeNode(params.language as string);
    code.append($createTextNode(params.code as string));
    insertAfterNodeOrAtEnd(code, params.afterNodeKey as string | undefined);
  });
}

function insertMath(editor: LexicalEditor, params: Record<string, unknown>) {
  editor.update(() => {
    const math = $createMathNode(params.latex as string);
    const para = $createParagraphNode();
    para.append(math);
    insertAfterNodeOrAtEnd(para, params.afterNodeKey as string | undefined);
  });
}

function insertHorizontalRule(
  editor: LexicalEditor,
  params: Record<string, unknown>,
) {
  editor.update(() => {
    const hr = $createHorizontalRuleNode();
    insertAfterNodeOrAtEnd(hr, params.afterNodeKey as string | undefined);
  });
}

const EXECUTORS: Record<
  string,
  (editor: LexicalEditor, params: Record<string, unknown>) => void
> = {
  insert_paragraph: insertParagraph,
  remove_node: removeNode,
  replace_text: replaceText,
  replace_selection: replaceSelection,
  insert_table: insertTable,
  insert_heading: insertHeading,
  insert_list: insertList,
  insert_code_block: insertCodeBlock,
  insert_math: insertMath,
  insert_horizontal_rule: insertHorizontalRule,
};

export function applyActions(
  editor: LexicalEditor,
  actions: CopilotAction[],
): void {
  for (const action of actions) {
    EXECUTORS[action.type]?.(editor, action.params);
  }
}
