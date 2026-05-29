"use client";
import React from "react";
import { useMenuState } from "@/hooks/useMenuState";
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
import { PageBreakNode } from "@/editor/nodes/PageBreakNode";
import { INSERT_PAGE_BREAK } from "@/editor/plugins/PageBreakPlugin";
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  SvgIcon,
  Typography,
} from "@mui/material";
import {
  Brush,
  ChevronDown,
  Columns2,
  Globe,
  Image,
  Minus,
  Paperclip,
  Plus,
  Scissors,
  SeparatorHorizontal,
  Sigma,
  StickyNote,
  Table,
} from "lucide-react";
import { IFrameNode } from "@/editor/nodes/IFrameNode";
import { LayoutContainerNode } from "@/editor/nodes/LayoutNode";
import { DetailsContainerNode } from "@/editor/nodes/DetailsNode";
import { INSERT_DETAILS_COMMAND } from "@/editor/plugins/DetailsPlugin";
import { AttachmentNode } from "@/editor/nodes/AttachmentNode";

const Graph = () => (
  <SvgIcon viewBox="0 0 512 512" fontSize="small">
    <path d="M500.364,244.365h-37.248c12.695-18.223,27.124-31.674,42.415-39.273c5.76-2.851,8.099-9.844,5.248-15.593    c-2.851-5.76-9.821-8.122-15.593-5.248c-24.041,11.927-45.894,34.804-63.185,66.129c-22.726,41.146-52.166,63.802-82.909,63.802    c-26.077,0-51.188-16.465-72.087-46.545H384c6.423,0,11.636-5.201,11.636-11.636c0-6.435-5.213-11.636-11.636-11.636H267.636v-128    h11.636c4.701,0,8.948-2.828,10.752-7.18s0.803-9.356-2.525-12.684l-23.273-23.273c-4.55-4.55-11.904-4.55-16.454,0L224.5,96.502    c-3.328,3.328-4.329,8.332-2.525,12.684s6.051,7.18,10.752,7.18h11.636V218.09c-23.599-28.323-51.7-43.543-81.455-43.543    c-37.876,0-72.972,24.879-99.607,69.818H11.636C5.213,244.365,0,249.567,0,256.001c0,6.435,5.213,11.636,11.636,11.636h37.248    C36.189,285.86,21.76,299.312,6.47,306.911c-5.76,2.851-8.099,9.844-5.248,15.593c2.025,4.108,6.144,6.47,10.426,6.47    c1.734,0,3.503-0.384,5.167-1.21C40.855,315.836,62.708,292.959,80,261.633c22.726-41.158,52.166-63.814,82.909-63.814    c26.077,0,51.188,16.465,72.087,46.545H128c-6.423,0-11.636,5.201-11.636,11.636c0,6.435,5.213,11.636,11.636,11.636h116.364    v162.909c0,6.435,5.213,11.636,11.636,11.636s11.636-5.201,11.636-11.636V293.913c23.599,28.323,51.7,43.543,81.455,43.543    c37.876,0,72.972-24.879,99.607-69.818h51.665c6.423,0,11.636-5.201,11.636-11.636C512,249.567,506.787,244.365,500.364,244.365z" />
  </SvgIcon>
);

export default function InsertToolMenu({ editor }: { editor: LexicalEditor }) {
  const {
    anchorEl,
    menuOpen: open,
    openMenu: handleClick,
    closeMenu: handleClose,
  } = useMenuState();

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
    <>
      <IconButton
        id="insert-button"
        aria-controls={open ? "insert-menu" : undefined}
        aria-haspopup="true"
        aria-expanded={open ? "true" : undefined}
        aria-label="Insert"
        onClick={handleClick}
      >
        <Plus size={18} />
      </IconButton>
      <Menu
        id="insert-menu"
        aria-labelledby="insert-button"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        sx={{
          "& .MuiBackdrop-root": { userSelect: "none" },
          "& .MuiMenuItem-root": { minHeight: 36 },
        }}
      >
        {editor.hasNode(HorizontalRuleNode) && (
          <MenuItem
            onClick={() => {
              editor.dispatchCommand(
                INSERT_HORIZONTAL_RULE_COMMAND,
                undefined,
              );
              handleClose();
            }}
          >
            <ListItemIcon>
              <Minus size={18} />
            </ListItemIcon>
            <ListItemText>Divider</ListItemText>
            <Typography variant="body2" color="text.secondary">
              ---
            </Typography>
          </MenuItem>
        )}
        {editor.hasNode(PageBreakNode) && (
          <MenuItem
            onClick={() => {
              editor.dispatchCommand(
                INSERT_PAGE_BREAK,
                undefined,
              );
              handleClose();
            }}
          >
            <ListItemIcon>
              <Scissors size={18} />
            </ListItemIcon>
            <ListItemText>Page</ListItemText>
            <Typography variant="body2" color="text.secondary">
              /page
            </Typography>
          </MenuItem>
        )}
        {editor.hasNode(MathNode) && (
          <MenuItem
            onClick={() => {
              editor.dispatchCommand(INSERT_MATH_COMMAND, {
                value: "",
              });
              handleClose();
            }}
          >
            <ListItemIcon>
              <Sigma size={18} />
            </ListItemIcon>
            <ListItemText>Math</ListItemText>
            <Typography variant="body2" color="text.secondary">
              $$
            </Typography>
          </MenuItem>
        )}
        {editor.hasNode(GraphNode) && (
          <MenuItem
            onClick={() => {
              openGraphDialog();
              handleClose();
            }}
          >
            <ListItemIcon>
              <Graph />
            </ListItemIcon>
            <ListItemText>Graph</ListItemText>
            <Typography variant="body2" color="text.secondary">
              /plot
            </Typography>
          </MenuItem>
        )}
        {editor.hasNode(SketchNode) && (
          <MenuItem
            onClick={() => {
              openSketchDialog();
              handleClose();
            }}
          >
            <ListItemIcon>
              <Brush size={18} />
            </ListItemIcon>
            <ListItemText>Sketch</ListItemText>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ ml: 1 }}
            >
              /sketch
            </Typography>
          </MenuItem>
        )}
        {editor.hasNode(ImageNode) && (
          <MenuItem
            onClick={() => {
              openImageDialog();
              handleClose();
            }}
          >
            <ListItemIcon>
              <Image size={18} />
            </ListItemIcon>
            <ListItemText>Image</ListItemText>
            <Typography variant="body2" color="text.secondary">
              /img
            </Typography>
          </MenuItem>
        )}
        {editor.hasNode(AttachmentNode) && (
          <MenuItem
            onClick={() => {
              openAttachmentDialog();
              handleClose();
            }}
          >
            <ListItemIcon>
              <Paperclip size={18} />
            </ListItemIcon>
            <ListItemText>Attachment</ListItemText>
            <Typography variant="body2" color="text.secondary">
              /attach
            </Typography>
          </MenuItem>
        )}
        {editor.hasNode(TableNode) && (
          <MenuItem
            onClick={() => {
              openTableDialog();
              handleClose();
            }}
          >
            <ListItemIcon>
              <Table size={18} />
            </ListItemIcon>
            <ListItemText>Table</ListItemText>
            <Typography variant="body2" color="text.secondary">
              /3x3
            </Typography>
          </MenuItem>
        )}
        {editor.hasNode(LayoutContainerNode) && (
          <MenuItem
            onClick={() => {
              openLayoutDialog();
              handleClose();
            }}
          >
            <ListItemIcon>
              <Columns2 size={18} />
            </ListItemIcon>
            <ListItemText>Columns</ListItemText>
            <Typography variant="body2" color="text.secondary">
              /col
            </Typography>
          </MenuItem>
        )}
        {editor.hasNode(StickyNode) && (
          <MenuItem
            onClick={() => {
              editor.dispatchCommand(
                INSERT_STICKY_COMMAND,
                undefined,
              );
              handleClose();
            }}
          >
            <ListItemIcon>
              <StickyNote size={18} />
            </ListItemIcon>
            <ListItemText>Note</ListItemText>
            <Typography variant="body2" color="text.secondary">
              /note
            </Typography>
          </MenuItem>
        )}
        {editor.hasNode(IFrameNode) && (
          <MenuItem
            onClick={() => {
              openIFrameDialog();
              handleClose();
            }}
          >
            <ListItemIcon>
              <Globe size={18} />
            </ListItemIcon>
            <ListItemText>IFrame</ListItemText>
            <Typography variant="body2" color="text.secondary">
              /iframe
            </Typography>
          </MenuItem>
        )}
        {editor.hasNode(DetailsContainerNode) && (
          <MenuItem
            onClick={() => {
              editor.dispatchCommand(
                INSERT_DETAILS_COMMAND,
                undefined,
              );
              handleClose();
            }}
          >
            <ListItemIcon>
              <ChevronDown size={18} />
            </ListItemIcon>
            <ListItemText>Details</ListItemText>
            <Typography variant="body2" color="text.secondary">
              /details
            </Typography>
          </MenuItem>
        )}
      </Menu>
    </>
  );
}
