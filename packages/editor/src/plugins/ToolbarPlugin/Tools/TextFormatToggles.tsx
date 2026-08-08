"use client";
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
import { Toggle } from "@base-ui/react/toggle";
import ColorPicker from "./ColorPicker";
import { $isMathNode, MathNode } from "@/editor/nodes/MathNode";
import { $patchStyle } from "@/editor/nodes/utils";
import { $getSelectionStyleValueForProperty } from "@lexical/selection";
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
import {
  cx,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  getActionButtonClassName,
  Tooltip,
  TooltipProvider,
} from "@/editor/ui";
import * as css from "./textFormatToggles.css";

const Highlight = () => (
  <svg
    aria-hidden="true"
    fill="currentColor"
    height={ICON_SIZE.dense}
    viewBox="0 -960 960 960"
    width={ICON_SIZE.dense}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M80 0v-160h800V0H80Zm504-480L480-584 320-424l103 104 161-160Zm-47-160 103 103 160-159-104-104-159 160Zm-84-29 216 216-189 190q-24 24-56.5 24T367-263l-27 23H140l126-125q-24-24-25-57.5t23-57.5l189-189Zm0 0 187-187q24-24 56.5-24t56.5 24l104 103q24 24 24 56.5T857-640L669-453 453-669Z" />
  </svg>
);

/** One class for every button in the row, toggles and overflow alike. */
const buttonClass = getActionButtonClassName({ size: "md", icon: true });

export default function TextFormatToggles(
  { editor, className }: { editor: LexicalEditor; className?: string },
) {
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
      const color = $getSelectionStyleValueForProperty(selection, "color");
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

  const applyFormat = useCallback((fmt: TextFormatType) => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, fmt);
  }, [editor]);

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
          return editor.dispatchCommand(FORMAT_TEXT_COMMAND, "highlight");
        }
        if (code === "KeyE" && (ctrlKey || metaKey)) {
          event.preventDefault();
          return editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code");
        }
        if (code === "KeyS" && (ctrlKey || metaKey) && shiftKey) {
          event.preventDefault();
          return editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough");
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

  const shortcut = (mac: string, other: string) => IS_APPLE ? mac : other;

  return (
    /*
     * One `TooltipProvider` for the whole row: in Base UI 1.7 the delay lives
     * on the provider, and grouping it here is what makes a tooltip re-show
     * instantly as the pointer travels along the toolbar instead of waiting out
     * the delay again at every button.
     */
    <TooltipProvider closeDelay={0} delay={500}>
      <div className={cx(css.bar, className)}>
        <div
          aria-label="text formatting"
          className={css.group}
          id="text-format-toggles"
          role="group"
        >
          <Tooltip content={`Bold (${shortcut("⌘B", "Ctrl+B")})`}>
            <Toggle
              aria-label={`Format text as bold. Shortcut: ${
                shortcut("⌘B", "Ctrl+B")
              }`}
              className={buttonClass}
              pressed={Boolean(format.bold)}
              value="bold"
              onPressedChange={() => applyFormat("bold")}
            >
              <Bold size={ICON_SIZE.dense} />
            </Toggle>
          </Tooltip>

          <Tooltip content={`Italic (${shortcut("⌘I", "Ctrl+I")})`}>
            <Toggle
              aria-label={`Format text as italics. Shortcut: ${
                shortcut("⌘I", "Ctrl+I")
              }`}
              className={buttonClass}
              pressed={Boolean(format.italic)}
              value="italic"
              onPressedChange={() => applyFormat("italic")}
            >
              <Italic size={ICON_SIZE.dense} />
            </Toggle>
          </Tooltip>

          <Tooltip content={`Underline (${shortcut("⌘U", "Ctrl+U")})`}>
            <Toggle
              aria-label={`Format text to underlined. Shortcut: ${
                shortcut("⌘U", "Ctrl+U")
              }`}
              className={buttonClass}
              pressed={Boolean(format.underline)}
              value="underline"
              onPressedChange={() => applyFormat("underline")}
            >
              <Underline size={ICON_SIZE.dense} />
            </Toggle>
          </Tooltip>

          <Tooltip content={`Insert Link (${shortcut("⌘K", "Ctrl+K")})`}>
            <Toggle
              aria-label={`Insert a link. Shortcut: ${shortcut("⌘K", "Ctrl+K")}`}
              className={buttonClass}
              pressed={Boolean(format.link)}
              value="link"
              onPressedChange={openLinkDialog}
            >
              <Link size={ICON_SIZE.dense} />
            </Toggle>
          </Tooltip>
        </div>

        <span className={css.divider} />

        {/*
          Still the MUI color picker from `./ColorPicker` — it is shared with
          TableTools, NoteTools and MathTools, all of which are MUI menus, so it
          belongs to the tranche that restyles `Tools/` as a whole (see
          docs/plans/haklex-adoption.md §9.2). `ui/color-picker` is ported and
          waiting for it.
        */}
        <ColorPicker
          onColorChange={onColorChange}
          textColor={textColor}
          backgroundColor={backgroundColor}
          onClose={restoreFocus}
        />

        <DropdownMenu>
          <Tooltip content="More formatting">
            <DropdownMenuTrigger
              aria-label="More formatting options"
              className={buttonClass}
            >
              <MoreHorizontal size={ICON_SIZE.dense} />
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent align="center" side="bottom">
            <DropdownMenuCheckboxItem
              checked={Boolean(format.highlight)}
              closeOnClick
              onCheckedChange={() => applyFormat("highlight")}
            >
              <Highlight />
              Highlight
              <DropdownMenuShortcut>
                {shortcut("⌘⇧H", "Ctrl+Shift+H")}
              </DropdownMenuShortcut>
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={Boolean(format.code)}
              closeOnClick
              onCheckedChange={() => applyFormat("code")}
            >
              <Code size={ICON_SIZE.dense} />
              Inline Code
              <DropdownMenuShortcut>
                {shortcut("⌘E", "Ctrl+E")}
              </DropdownMenuShortcut>
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={Boolean(format.strikethrough)}
              closeOnClick
              onCheckedChange={() => applyFormat("strikethrough")}
            >
              <Strikethrough size={ICON_SIZE.dense} />
              Strikethrough
              <DropdownMenuShortcut>
                {shortcut("⌘⇧S", "Ctrl+Shift+S")}
              </DropdownMenuShortcut>
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={Boolean(format.subscript)}
              closeOnClick
              onCheckedChange={() => applyFormat("subscript")}
            >
              <Subscript size={ICON_SIZE.dense} />
              Subscript
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={Boolean(format.superscript)}
              closeOnClick
              onCheckedChange={() => applyFormat("superscript")}
            >
              <Superscript size={ICON_SIZE.dense} />
              Superscript
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  );
}
