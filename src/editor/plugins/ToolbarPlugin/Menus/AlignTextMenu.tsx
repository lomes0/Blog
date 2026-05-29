"use client";
import {
  $getPreviousSelection,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_CRITICAL,
  ElementFormatType,
  FORMAT_ELEMENT_COMMAND,
  INDENT_CONTENT_COMMAND,
  LexicalEditor,
  OUTDENT_CONTENT_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import {
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  IndentDecrease,
  IndentIncrease,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useMenuState } from "@/hooks/useMenuState";
import { getSelectedNode } from "@/editor/utils/getSelectedNode";
import { $findMatchingParent, mergeRegister } from "@lexical/utils";

export default function AlignTextMenu(
  { editor, isRTL }: { editor: LexicalEditor; isRTL: boolean },
) {
  const { anchorEl, menuOpen: open, openMenu: handleClick, closeMenu } =
    useMenuState();
  const handleClose = useCallback(() => {
    closeMenu();
    setTimeout(() => {
      editor.update(() => {
        const selection = $getSelection() || $getPreviousSelection();
        if (!selection) return;
        $setSelection(selection.clone());
      }, {
        discrete: true,
        onUpdate() {
          editor.focus(undefined, { defaultSelection: "rootStart" });
        },
      });
    }, 0);
  }, [editor, closeMenu]);

  const [formatType, setFormatType] = useState<ElementFormatType>("left");
  const [indentationLevel, setIndentationLevel] = useState<number>(0);

  const $updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if (!selection) return;
    const element = $findMatchingParent(
      $isRangeSelection(selection)
        ? getSelectedNode(selection)
        : selection.getNodes()[0],
      $isElementNode,
    );
    if (!element) return;
    setFormatType(element.getFormatType() || "left");
    setIndentationLevel(element.getIndent() || 0);
  }, []);

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          $updateToolbar();
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerUpdateListener(({ editorState, tags: _tags }) => {
        editorState.read(() => {
          $updateToolbar();
        });
      }),
    );
  }, [editor, $updateToolbar]);

  return (
    <>
      <IconButton
        id="align-button"
        aria-controls={open ? "align-menu" : undefined}
        aria-haspopup="true"
        aria-expanded={open ? "true" : undefined}
        aria-label="Align Text"
        onClick={handleClick}
      >
        {formatType === "left" && <AlignLeft size={18} />}
        {formatType === "center" && <AlignCenter size={18} />}
        {formatType === "right" && <AlignRight size={18} />}
        {formatType === "justify" && <AlignJustify size={18} />}
      </IconButton>
      <Menu
        id="align-menu"
        aria-labelledby="align-button"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "center",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "center",
        }}
        sx={{
          "& .MuiBackdrop-root": { userSelect: "none" },
          "& .MuiMenuItem-root": { minHeight: 36 },
        }}
      >
        <MenuItem
          selected={formatType === "left"}
          onClick={() => {
            editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "left");
          }}
        >
          <ListItemIcon>
            <AlignLeft size={18} />
          </ListItemIcon>
          <ListItemText>Left Align</ListItemText>
        </MenuItem>
        <MenuItem
          selected={formatType === "center"}
          onClick={() => {
            editor.dispatchCommand(
              FORMAT_ELEMENT_COMMAND,
              "center",
            );
          }}
        >
          <ListItemIcon>
            <AlignCenter size={18} />
          </ListItemIcon>
          <ListItemText>Center Align</ListItemText>
        </MenuItem>
        <MenuItem
          selected={formatType === "right"}
          onClick={() => {
            editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "right");
          }}
        >
          <ListItemIcon>
            <AlignRight size={18} />
          </ListItemIcon>
          <ListItemText>Right Align</ListItemText>
        </MenuItem>
        <MenuItem
          selected={formatType === "justify"}
          onClick={() => {
            editor.dispatchCommand(
              FORMAT_ELEMENT_COMMAND,
              "justify",
            );
          }}
        >
          <ListItemIcon>
            <AlignJustify size={18} />
          </ListItemIcon>
          <ListItemText>Justify Align</ListItemText>
        </MenuItem>

        <Divider />

        <MenuItem
          onClick={() => {
            editor.dispatchCommand(
              INDENT_CONTENT_COMMAND,
              undefined,
            );
          }}
        >
          <ListItemIcon>
            {isRTL
              ? <IndentDecrease size={18} />
              : <IndentIncrease size={18} />}
          </ListItemIcon>
          <ListItemText>Indent</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={indentationLevel === 0}
          onClick={() => {
            editor.dispatchCommand(
              OUTDENT_CONTENT_COMMAND,
              undefined,
            );
          }}
        >
          <ListItemIcon>
            {isRTL
              ? <IndentIncrease size={18} />
              : <IndentDecrease size={18} />}
          </ListItemIcon>
          <ListItemText>Outdent</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
