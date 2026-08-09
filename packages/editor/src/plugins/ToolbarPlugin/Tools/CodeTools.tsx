"use client";
import { LexicalEditor } from "lexical";
import { useCallback, useEffect, useState } from "react";
import {
  $isCodeNode,
  CodeNode as CustomCodeNode,
} from "@/editor/nodes/CodeNode";
import type { SegmentedControlItem } from "@/editor/ui";
import { SegmentedControl } from "@/editor/ui";

/**
 * Floating-toolbar tools for a selected code block. Language selection now
 * lives in the per-block authoring header (CodeActionMenuPlugin); this keeps
 * only the block-width controls.
 *
 * The four widths were an exclusive `ToggleButtonGroup`, which is what the
 * kit's `SegmentedControl` is — one choice out of a short, fixed list, with a
 * sliding indicator instead of four separately shaded buttons. It also brings
 * roving-tabindex arrow navigation, which the MUI group did not have.
 */
const WIDTHS = ["25%", "50%", "75%", "100%"];

/**
 * Typed as `string` rather than left to infer a union of the four literals: the
 * width comes back off the node as an arbitrary `string`, so a narrower type
 * here would only be a cast at the boundary.
 */
const ITEMS: SegmentedControlItem<string>[] = WIDTHS.map((value) => ({
  value,
  label: value,
}));

export default function CodeTools(
  { editor, node }: { editor: LexicalEditor; node: CustomCodeNode },
) {
  const [currentWidth, setCurrentWidth] = useState<string>("100%");

  const handleWidthChange = useCallback(
    (width: string) => {
      editor.update(() => {
        if ($isCodeNode(node)) {
          node.setWidth(width);
          setCurrentWidth(width);
        }
      });
    },
    [editor, node],
  );

  useEffect(() => {
    const width = editor.getEditorState().read(() => node.getWidth());
    setCurrentWidth(width || "100%");
  }, [node, editor]);

  return (
    <SegmentedControl
      items={ITEMS}
      onChange={handleWidthChange}
      size="md"
      value={currentWidth}
    />
  );
}
