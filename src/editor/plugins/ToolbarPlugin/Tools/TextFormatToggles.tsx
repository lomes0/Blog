"use client";
import * as React from "react";
import {
  $getPreviousSelection,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_NORMAL,
  FORMAT_TEXT_COMMAND,
  KEY_MODIFIER_COMMAND,
  LexicalEditor,
  SELECTION_CHANGE_COMMAND,
  TextFormatType,
} from "lexical";
import { $patchStyleText } from "@lexical/selection";
import { IS_APPLE, mergeRegister } from "@lexical/utils";
import { $isLinkNode } from "@lexical/link";
import { useCallback, useEffect, useState } from "react";
import ColorPicker from "./ColorPicker";
import { $isMathNode, MathNode } from "@/editor/nodes/MathNode";
import { $patchStyle } from "@/editor/nodes/utils";
import { $getSelectionStyleValueForProperty } from "@lexical/selection";
import { SxProps, Theme } from "@mui/material/styles";
import {
  Box,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  SvgIcon,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import {
  Bold,
  Code,
  Italic,
  Link,
  MoreHorizontal,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
} from "lucide-react";
import { getSelectedNode } from "@/editor/utils/getSelectedNode";
import { SET_DIALOGS_COMMAND } from "../Dialogs/commands";
import { ICON_SIZE } from "@/theme/icons";

const Highlight = () => (
  <SvgIcon viewBox="0 -960 960 960" fontSize="small">
    <path
      xmlns="http://www.w3.org/2000/svg"
      d="M80 0v-160h800V0H80Zm504-480L480-584 320-424l103 104 161-160Zm-47-160 103 103 160-159-104-104-159 160Zm-84-29 216 216-189 190q-24 24-56.5 24T367-263l-27 23H140l126-125q-24-24-25-57.5t23-57.5l189-189Zm0 0 187-187q24-24 56.5-24t56.5 24l104 103q24 24 24 56.5T857-640L669-453 453-669Z"
      fontSize="small"
    />
  </SvgIcon>
);

export default function TextFormatToggles(
  { editor, sx }: { editor: LexicalEditor; sx?: SxProps<Theme> | undefined },
) {
  const [overflowAnchor, setOverflowAnchor] = useState<HTMLElement | null>(
    null,
  );
  const [format, setFormat] = useState<{ [key: string]: boolean }>({});
  const [textColor, setTextColor] = useState<string>();
  const [backgroundColor, setBackgroundColor] = useState<string>();

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const node = getSelectedNode(selection);
      const parent = node.getParent();
      setFormat({
        bold: selection.hasFormat("bold"),
        italic: selection.hasFormat("italic"),
        underline: selection.hasFormat("underline"),
        strikethrough: selection.hasFormat("strikethrough"),
        subscript: selection.hasFormat("subscript"),
        superscript: selection.hasFormat("superscript"),
        code: selection.hasFormat("code"),
        highlight: selection.hasFormat("highlight"),
        link: $isLinkNode(parent) || $isLinkNode(node),
      });
      const color = $getSelectionStyleValueForProperty(
        selection,
        "color",
      );
      setTextColor(color);
      const backgroundColor = $getSelectionStyleValueForProperty(
        selection,
        "background-color",
      );
      setBackgroundColor(backgroundColor);
    }
  }, []);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      (_payload) => {
        updateToolbar();
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor, updateToolbar]);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateToolbar();
        });
      }),
    );
  }, [editor, updateToolbar]);

  useEffect(() => {
    editor.getEditorState().read(() => {
      updateToolbar();
    });
  }, [editor, updateToolbar]);

  const applyStyleText = useCallback(
    (styles: Record<string, string>) => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $patchStyleText(selection, styles);
          const mathNodes = selection.getNodes().filter((node) =>
            $isMathNode(node)
          ) as MathNode[];
          $patchStyle(mathNodes, styles);
        }
      });
    },
    [editor],
  );

  const onColorChange = useCallback((key: string, value: string) => {
    const styleKey = key === "text" ? "color" : "background-color";
    applyStyleText({ [styleKey]: value });
  }, [applyStyleText]);

  const handleFormat = (event: React.MouseEvent<HTMLElement>) => {
    const button = event.currentTarget as HTMLButtonElement;
    if (!button) return;
    editor.dispatchCommand(
      FORMAT_TEXT_COMMAND,
      button.value as TextFormatType,
    );
  };

  const formatKeys = Object.keys(format).filter((key) => Boolean(format[key]));

  useEffect(() => {
    return editor.registerCommand(
      KEY_MODIFIER_COMMAND,
      (payload) => {
        const event: KeyboardEvent = payload;
        const { code, ctrlKey, metaKey, shiftKey } = event;
        if (code === "KeyK" && (ctrlKey || metaKey)) {
          event.preventDefault();
          return editor.dispatchCommand(SET_DIALOGS_COMMAND, {
            link: { open: true },
          });
        }
        if (code === "KeyH" && (ctrlKey || metaKey) && shiftKey) {
          event.preventDefault();
          return editor.dispatchCommand(
            FORMAT_TEXT_COMMAND,
            "highlight",
          );
        }
        if (code === "KeyE" && (ctrlKey || metaKey)) {
          event.preventDefault();
          return editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code");
        }
        if (code === "KeyS" && (ctrlKey || metaKey) && shiftKey) {
          event.preventDefault();
          return editor.dispatchCommand(
            FORMAT_TEXT_COMMAND,
            "strikethrough",
          );
        }
        return false;
      },
      COMMAND_PRIORITY_NORMAL,
    );
  }, [editor]);

  const restoreFocus = useCallback(() => {
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
  }, [editor]);

  const openLinkDialog = () =>
    editor.dispatchCommand(SET_DIALOGS_COMMAND, { link: { open: true } });

  const handleOverflowFormat = (fmt: TextFormatType) => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, fmt);
    setOverflowAnchor(null);
  };

  return (
    <Box sx={{ display: "flex", alignItems: "center", ...sx }}>
      <ToggleButtonGroup
        size="small"
        value={formatKeys}
        onChange={handleFormat}
        aria-label="text formatting"
        id="text-format-toggles"
      >
        <ToggleButton
          value="bold"
          title={IS_APPLE ? "Bold (⌘B)" : "Bold (Ctrl+B)"}
          aria-label={`Format text as bold. Shortcut: ${
            IS_APPLE ? "⌘B" : "Ctrl+B"
          }`}
        >
          <Bold size={ICON_SIZE.dense} />
        </ToggleButton>
        <ToggleButton
          value="italic"
          title={IS_APPLE ? "Italic (⌘I)" : "Italic (Ctrl+I)"}
          aria-label={`Format text as italics. Shortcut: ${
            IS_APPLE ? "⌘I" : "Ctrl+I"
          }`}
        >
          <Italic size={ICON_SIZE.dense} />
        </ToggleButton>
        <ToggleButton
          value="underline"
          title={IS_APPLE ? "Underline (⌘U)" : "Underline (Ctrl+U)"}
          aria-label={`Format text to underlined. Shortcut: ${
            IS_APPLE ? "⌘U" : "Ctrl+U"
          }`}
        >
          <Underline size={ICON_SIZE.dense} />
        </ToggleButton>
        <ToggleButton
          value="link"
          title={IS_APPLE ? "Insert Link (⌘K)" : "Insert Link (Ctrl+K)"}
          aria-label={`Insert a link. Shortcut: ${IS_APPLE ? "⌘K" : "Ctrl+K"}`}
          onClick={openLinkDialog}
        >
          <Link size={ICON_SIZE.dense} />
        </ToggleButton>
        <ColorPicker
          onColorChange={onColorChange}
          textColor={textColor}
          backgroundColor={backgroundColor}
          onClose={restoreFocus}
        />
      </ToggleButtonGroup>

      {/* More formatting options */}
      <IconButton
        size="small"
        title="More formatting"
        aria-label="More formatting options"
        onClick={(e) => setOverflowAnchor(e.currentTarget)}
        sx={{ ml: 0.25 }}
      >
        <MoreHorizontal size={ICON_SIZE.dense} />
      </IconButton>
      <Menu
        anchorEl={overflowAnchor}
        open={Boolean(overflowAnchor)}
        onClose={() => setOverflowAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        sx={{ "& .MuiMenuItem-root": { minHeight: 36 } }}
      >
        <MenuItem
          selected={format.highlight}
          onClick={() => handleOverflowFormat("highlight")}
        >
          <ListItemIcon>
            <Highlight />
          </ListItemIcon>
          <ListItemText>Highlight</ListItemText>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
            {IS_APPLE ? "⌘⇧H" : "Ctrl+Shift+H"}
          </Typography>
        </MenuItem>
        <MenuItem
          selected={format.code}
          onClick={() => handleOverflowFormat("code")}
        >
          <ListItemIcon>
            <Code size={ICON_SIZE.dense} />
          </ListItemIcon>
          <ListItemText>Inline Code</ListItemText>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
            {IS_APPLE ? "⌘E" : "Ctrl+E"}
          </Typography>
        </MenuItem>
        <MenuItem
          selected={format.strikethrough}
          onClick={() => handleOverflowFormat("strikethrough")}
        >
          <ListItemIcon>
            <Strikethrough size={ICON_SIZE.dense} />
          </ListItemIcon>
          <ListItemText>Strikethrough</ListItemText>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
            {IS_APPLE ? "⌘⇧S" : "Ctrl+Shift+S"}
          </Typography>
        </MenuItem>
        <MenuItem
          selected={format.subscript}
          onClick={() => handleOverflowFormat("subscript")}
        >
          <ListItemIcon>
            <Subscript size={ICON_SIZE.dense} />
          </ListItemIcon>
          <ListItemText>Subscript</ListItemText>
        </MenuItem>
        <MenuItem
          selected={format.superscript}
          onClick={() => handleOverflowFormat("superscript")}
        >
          <ListItemIcon>
            <Superscript size={ICON_SIZE.dense} />
          </ListItemIcon>
          <ListItemText>Superscript</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
}
