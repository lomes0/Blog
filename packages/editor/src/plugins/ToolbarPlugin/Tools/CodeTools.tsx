"use client";
import { LexicalEditor } from "lexical";
import { useCallback, useEffect, useState } from "react";
import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import {
  $isCodeNode,
  CodeNode as CustomCodeNode,
} from "@/editor/nodes/CodeNode";

/**
 * Floating-toolbar tools for a selected code block. Language selection now
 * lives in the per-block authoring header (CodeActionMenuPlugin); this keeps
 * only the block-width controls.
 */
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
    <ToggleButtonGroup
      size="small"
      exclusive
      value={currentWidth}
      sx={{ bgcolor: "background.default" }}
    >
      <ToggleButton value="25%" onClick={() => handleWidthChange("25%")}>
        25%
      </ToggleButton>
      <ToggleButton value="50%" onClick={() => handleWidthChange("50%")}>
        50%
      </ToggleButton>
      <ToggleButton value="75%" onClick={() => handleWidthChange("75%")}>
        75%
      </ToggleButton>
      <ToggleButton value="100%" onClick={() => handleWidthChange("100%")}>
        100%
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
