"use client";
import { LexicalEditor } from "lexical";
import {
  HorizontalRuleNode,
  INSERT_HORIZONTAL_RULE_COMMAND,
} from "@/editor/nodes/HorizontalRuleNode";
import { INSERT_MATH_COMMAND } from "@/editor/plugins/MathPlugin";
import { INSERT_STICKY_COMMAND } from "@/editor/plugins/StickyPlugin";
import { SET_DIALOGS_COMMAND } from "../Dialogs/commands";
import { MathNode } from "@/editor/nodes/MathNode";
import { GraphNode } from "@/editor/nodes/GraphNode";
import { SketchNode } from "@/editor/nodes/SketchNode";
import { ImageNode } from "@/editor/nodes/ImageNode";
import { TableNode } from "@/editor/nodes/TableNode";
import { StickyNode } from "@/editor/nodes/StickyNode";
import { CanvasNode } from "@/editor/nodes/CanvasNode";
import { INSERT_CANVAS_COMMAND } from "@/editor/plugins/CanvasPlugin";
import { PageBreakNode } from "@/editor/nodes/PageBreakNode";
import { INSERT_PAGE_BREAK } from "@/editor/plugins/PageBreakPlugin";
import {
  Brush,
  ChevronDown,
  Columns2,
  Globe,
  Image,
  LayoutDashboard,
  Minus,
  Paperclip,
  Plus,
  Scissors,
  Sigma,
  StickyNote,
  Table,
} from "lucide-react";
import { IFrameNode } from "@/editor/nodes/IFrameNode";
import { LayoutContainerNode } from "@/editor/nodes/LayoutNode";
import { DetailsContainerNode } from "@/editor/nodes/DetailsNode";
import { INSERT_DETAILS_COMMAND } from "@/editor/plugins/DetailsPlugin";
import { AttachmentNode } from "@/editor/nodes/AttachmentNode";
import { ICON_SIZE } from "@/theme/icons";
import {
  cx,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  getActionButtonClassName,
} from "@/editor/ui";
import * as css from "./menus.css";

const Graph = () => (
  <svg
    aria-hidden="true"
    fill="currentColor"
    height={ICON_SIZE.dense}
    viewBox="0 0 512 512"
    width={ICON_SIZE.dense}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M500.364,244.365h-37.248c12.695-18.223,27.124-31.674,42.415-39.273c5.76-2.851,8.099-9.844,5.248-15.593    c-2.851-5.76-9.821-8.122-15.593-5.248c-24.041,11.927-45.894,34.804-63.185,66.129c-22.726,41.146-52.166,63.802-82.909,63.802    c-26.077,0-51.188-16.465-72.087-46.545H384c6.423,0,11.636-5.201,11.636-11.636c0-6.435-5.213-11.636-11.636-11.636H267.636v-128    h11.636c4.701,0,8.948-2.828,10.752-7.18s0.803-9.356-2.525-12.684l-23.273-23.273c-4.55-4.55-11.904-4.55-16.454,0L224.5,96.502    c-3.328,3.328-4.329,8.332-2.525,12.684s6.051,7.18,10.752,7.18h11.636V218.09c-23.599-28.323-51.7-43.543-81.455-43.543    c-37.876,0-72.972,24.879-99.607,69.818H11.636C5.213,244.365,0,249.567,0,256.001c0,6.435,5.213,11.636,11.636,11.636h37.248    C36.189,285.86,21.76,299.312,6.47,306.911c-5.76,2.851-8.099,9.844-5.248,15.593c2.025,4.108,6.144,6.47,10.426,6.47    c1.734,0,3.503-0.384,5.167-1.21C40.855,315.836,62.708,292.959,80,261.633c22.726-41.158,52.166-63.814,82.909-63.814    c26.077,0,51.188,16.465,72.087,46.545H128c-6.423,0-11.636,5.201-11.636,11.636c0,6.435,5.213,11.636,11.636,11.636h116.364    v162.909c0,6.435,5.213,11.636,11.636,11.636s11.636-5.201,11.636-11.636V293.913c23.599,28.323,51.7,43.543,81.455,43.543    c37.876,0,72.972-24.879,99.607-69.818h51.665c6.423,0,11.636-5.201,11.636-11.636C512,249.567,506.787,244.365,500.364,244.365z" />
  </svg>
);

/**
 * The trigger is the kit's `lg` outline button so it stands 36px tall, level
 * with the two selects beside it — MUI's was 34.
 */
const triggerClass = cx(
  getActionButtonClassName({ variant: "outline", size: "lg" }),
  css.menuTrigger,
);

export default function InsertToolMenu({ editor }: { editor: LexicalEditor }) {
  const openImageDialog = () =>
    editor.dispatchCommand(SET_DIALOGS_COMMAND, { image: { open: true } });
  const openTableDialog = () =>
    editor.dispatchCommand(SET_DIALOGS_COMMAND, { table: { open: true } });
  const openGraphDialog = () =>
    editor.dispatchCommand(SET_DIALOGS_COMMAND, { graph: { open: true } });
  const openSketchDialog = () =>
    editor.dispatchCommand(SET_DIALOGS_COMMAND, { sketch: { open: true } });
  const openIFrameDialog = () =>
    editor.dispatchCommand(SET_DIALOGS_COMMAND, { iframe: { open: true } });
  const openLayoutDialog = () =>
    editor.dispatchCommand(SET_DIALOGS_COMMAND, { layout: { open: true } });
  const openAttachmentDialog = () =>
    editor.dispatchCommand(SET_DIALOGS_COMMAND, { attachment: { open: true } });

  return (
    /*
     * No `useMenuState` any more: Base UI's `Menu.Root` owns the open state and
     * its `Positioner` anchors to the `Trigger` itself, so the anchor element
     * the hook existed to hold has nowhere to go. Nothing in this package needs
     * it as of the `Tools/` tranche; `src/hooks/useMenuState.ts` stays where it
     * is because three app-side menus still do.
     */
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Insert" className={triggerClass}>
        <Plus size={ICON_SIZE.inline} />
        Insert
        <ChevronDown size={ICON_SIZE.inline} />
      </DropdownMenuTrigger>
      {/* Items close the menu themselves — Base UI's `Menu.Item` does it on
          click, which is what every `handleClose()` call here used to be. */}
      <DropdownMenuContent align="center" side="bottom">
        {editor.hasNode(HorizontalRuleNode) && (
          <DropdownMenuItem
            onClick={() =>
              editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)}
          >
            <Minus size={ICON_SIZE.dense} />
            Divider
            <DropdownMenuShortcut>---</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        {editor.hasNode(PageBreakNode) && (
          <DropdownMenuItem
            onClick={() => editor.dispatchCommand(INSERT_PAGE_BREAK, undefined)}
          >
            <Scissors size={ICON_SIZE.dense} />
            Page
            <DropdownMenuShortcut>/page</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        {editor.hasNode(MathNode) && (
          <DropdownMenuItem
            onClick={() =>
              editor.dispatchCommand(INSERT_MATH_COMMAND, { value: "" })}
          >
            <Sigma size={ICON_SIZE.dense} />
            Math
            <DropdownMenuShortcut>$$</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        {editor.hasNode(GraphNode) && (
          <DropdownMenuItem onClick={openGraphDialog}>
            <Graph />
            Graph
            <DropdownMenuShortcut>/plot</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        {editor.hasNode(SketchNode) && (
          <DropdownMenuItem onClick={openSketchDialog}>
            <Brush size={ICON_SIZE.dense} />
            Sketch
            <DropdownMenuShortcut>/sketch</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        {editor.hasNode(ImageNode) && (
          <DropdownMenuItem onClick={openImageDialog}>
            <Image size={ICON_SIZE.dense} />
            Image
            <DropdownMenuShortcut>/img</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        {editor.hasNode(AttachmentNode) && (
          <DropdownMenuItem onClick={openAttachmentDialog}>
            <Paperclip size={ICON_SIZE.dense} />
            Attachment
            <DropdownMenuShortcut>/attach</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        {editor.hasNode(TableNode) && (
          <DropdownMenuItem onClick={openTableDialog}>
            <Table size={ICON_SIZE.dense} />
            Table
            <DropdownMenuShortcut>/3x3</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        {editor.hasNode(LayoutContainerNode) && (
          <DropdownMenuItem onClick={openLayoutDialog}>
            <Columns2 size={ICON_SIZE.dense} />
            Columns
            <DropdownMenuShortcut>/col</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        {editor.hasNode(StickyNode) && (
          <DropdownMenuItem
            onClick={() =>
              editor.dispatchCommand(INSERT_STICKY_COMMAND, undefined)}
          >
            <StickyNote size={ICON_SIZE.dense} />
            Note
            <DropdownMenuShortcut>/note</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        {editor.hasNode(CanvasNode) && (
          <DropdownMenuItem
            onClick={() =>
              editor.dispatchCommand(INSERT_CANVAS_COMMAND, undefined)}
          >
            <LayoutDashboard size={ICON_SIZE.dense} />
            Notes Canvas
            <DropdownMenuShortcut>/canvas</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        {editor.hasNode(IFrameNode) && (
          <DropdownMenuItem onClick={openIFrameDialog}>
            <Globe size={ICON_SIZE.dense} />
            IFrame
            <DropdownMenuShortcut>/iframe</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        {editor.hasNode(DetailsContainerNode) && (
          <DropdownMenuItem
            onClick={() =>
              editor.dispatchCommand(INSERT_DETAILS_COMMAND, undefined)}
          >
            <ChevronDown size={ICON_SIZE.dense} />
            Details
            <DropdownMenuShortcut>/details</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
