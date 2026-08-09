"use client";
import { LexicalEditor } from "lexical";
import { useEffect, useState } from "react";
import { ChevronDown, StickyNote, Trash2 } from "lucide-react";
import {
  $getNodeStyleValueForProperty,
  $patchStyle,
} from "@/editor/nodes/utils";
import ColorPicker from "./ColorPicker";
import { StickyNode } from "@/editor/nodes/StickyNode";
import { ICON_SIZE } from "@/theme/icons";
import {
  cx,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  getActionButtonClassName,
} from "@/editor/ui";
import * as menuCss from "../Menus/menus.css";
import * as css from "./tools.css";

const FormatImageRight = () => (
  <svg
    aria-hidden="true"
    fill="currentColor"
    height={ICON_SIZE.dense}
    viewBox="0 -960 960 960"
    width={ICON_SIZE.dense}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M450-285v-390h390v390H450Zm60-60h270v-270H510v270ZM120-120v-60h720v60H120Zm0-165v-60h270v60H120Zm0-165v-60h270v60H120Zm0-165v-60h270v60H120Zm0-165v-60h720v60H120Z" />
  </svg>
);

const FormatImageLeft = () => (
  <svg
    aria-hidden="true"
    fill="currentColor"
    height={ICON_SIZE.dense}
    viewBox="0 -960 960 960"
    width={ICON_SIZE.dense}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M120-285v-390h390v390H120Zm60-60h270v-270H180v270Zm-60-435v-60h720v60H120Zm450 165v-60h270v60H570Zm0 165v-60h270v60H570Zm0 165v-60h270v60H570ZM120-120v-60h720v60H120Z" />
  </svg>
);

/** The same labelled trigger as `Insert`, `Table` and `AI` — see `menus.css`. */
const triggerClass = cx(
  getActionButtonClassName({ variant: "outline", size: "lg" }),
  menuCss.menuTrigger,
);

const toggleClass = getActionButtonClassName({ size: "md", icon: true });

export default function NoteTools(
  { editor, node }: { editor: LexicalEditor; node: StickyNode },
) {
  const [float, setFloat] = useState<string>();
  const [textColor, setTextColor] = useState<string>();
  const [backgroundColor, setBackgroundColor] = useState<string>();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    editor.getEditorState().read(() => {
      const float = $getNodeStyleValueForProperty(node, "float");
      setFloat(float);
      const color = $getNodeStyleValueForProperty(node, "color");
      setTextColor(color);
      const backgroundColor = $getNodeStyleValueForProperty(
        node,
        "background-color",
      );
      setBackgroundColor(backgroundColor);
    });
  }, [editor, node]);

  const deleteNode = () => {
    editor.update(() => {
      node.selectPrevious();
      node.remove();
    });
  };

  const updateNoteColor = (key: string, value: string) => {
    const styleKey = key === "text" ? "color" : "background-color";
    updateColor(styleKey, value);
  };

  function updateFloat(newFloat: "left" | "right" | "none") {
    setFloat(newFloat);
    editor.update(() => {
      node.select();
      $patchStyle(node, { float: newFloat });
    });
  }

  function updateColor(key: "color" | "background-color", value: string) {
    if (key === "color") setTextColor(value);
    else setBackgroundColor(value);
    editor.update(() => {
      node.select();
      $patchStyle(node, { [key]: value });
    });
  }

  const restoreFocus = () => {
    setTimeout(() => node.focus(), 0);
  };

  /**
   * The menu owns its open state now, so what used to be `handleClose` is this:
   * `Menu.Item` closes on click by itself, and every close — item, Escape,
   * outside press — comes back through here to put focus on the note.
   */
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) restoreFocus();
  };

  useEffect(() => {
    if (!open) return;
    editor.update(() => {
      node.select();
    });
  }, [open, editor, node]);

  return (
    <>
      <DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger aria-label="Note options" className={triggerClass}>
          <StickyNote size={ICON_SIZE.inline} />
          <span className={menuCss.triggerLabel}>Note</span>
          <ChevronDown size={ICON_SIZE.inline} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="center"
          aria-label="Formatting options for note"
          side="bottom"
        >
          <div
            aria-label="note position"
            className={css.menuToggleRow}
            role="group"
          >
            <button
              aria-label="Float left"
              aria-pressed={float === "left"}
              className={toggleClass}
              type="button"
              onClick={() => updateFloat("left")}
            >
              <FormatImageLeft />
            </button>
            <button
              aria-label="Float right"
              aria-pressed={float === "right"}
              className={toggleClass}
              type="button"
              onClick={() => updateFloat("right")}
            >
              <FormatImageRight />
            </button>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={deleteNode}>
            <Trash2 size={ICON_SIZE.dense} />
            Delete Note
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/*
        Out of the menu and into the toolbar row. A Base UI `Popover` opened
        from inside a `Menu.Popup` is not part of that menu's floating tree, so
        the first click in it would read as an outside press and close the menu
        underneath — see the header of `ColorPicker.tsx`.
      */}
      <ColorPicker
        backgroundColor={backgroundColor}
        label="Note"
        onClose={restoreFocus}
        onColorChange={updateNoteColor}
        textColor={textColor}
      />
    </>
  );
}
