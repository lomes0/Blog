"use client";
import * as React from "react";
import {
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  ToggleButton,
} from "@mui/material";
import { Circle, Eraser, Palette, X } from "lucide-react";

export const textPalette = [
  "#d7170b",
  "#fe8a2b",
  "#ffc02b",
  "#63b215",
  "#21ba3a",
  "#17cfcf",
  "#0d80f2",
  "#a219e6",
  "#eb4799",
  "#000000",
  "#666666",
  "#A6A6A6",
  "#d4d5d2",
  "#ffffff",
];

export const backgroundPalette = [
  "#fbbbb6",
  "#ffe0c2",
  "#fff1c2",
  "#d0e8b9",
  "#bceac4",
  "#b9f1f1",
  "#b6d9fb",
  "#e3baf8",
  "#f9c8e0",
  "#353535",
  "#8C8C8C",
  "#D0D0D0",
  "#F0F0F0",
  "#ffffff",
];

export default function ColorPicker(
  {
    onColorChange,
    onOpen,
    onClose,
    toggle = "togglebutton",
    label = "Color",
    textColor,
    backgroundColor,
  }: {
    onColorChange: (key: string, value: string) => void;
    onOpen?: () => void;
    onClose?: () => void;
    toggle?: "togglebutton" | "menuitem";
    label?: string;
    textColor?: string;
    backgroundColor?: string;
  },
) {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    setAnchorEl(open ? null : event.currentTarget);
    if (!open) onOpen?.();
  };
  const handleClose = () => {
    setAnchorEl(null);
    onClose?.();
  };
  const onChange = (key: string, value: string) => {
    onColorChange(key, value);
  };

  return (
    <>
      {toggle === "menuitem" && (
        <MenuItem onClick={handleClick}>
          <ListItemIcon>
            <Palette />
          </ListItemIcon>
          <ListItemText>{label}</ListItemText>
        </MenuItem>
      )}
      {toggle === "togglebutton" && (
        <ToggleButton
          size="small"
          value="color"
          onClick={handleClick}
          className="MuiToggleButtonGroup-grouped MuiToggleButtonGroup-groupedHorizontal"
          selected={open}
        >
          <Palette size={18} />
        </ToggleButton>
      )}
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        disableRestoreFocus
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        sx={{
          "ul": {
            pt: 0,
            display: "flex",
            flexWrap: "wrap",
            width: 280,
          },
          "& .MuiBackdrop-root": { userSelect: "none" },
        }}
      >
        {textPalette.map((color, index) => (
          <MenuItem
            key={index}
            onClick={(_e) => {
              onChange("text", color);
            }}
            selected={color === textColor}
          >
            <Circle style={{ color }} />
          </MenuItem>
        ))}
        <MenuItem
          key="clear-color"
          onClick={(_e) => {
            onChange("text", "inherit");
          }}
          selected={textColor === "inherit"}
        >
          <X />
        </MenuItem>
        {backgroundPalette.map((color, index) => (
          <MenuItem
            key={index}
            onClick={(_e) => {
              onChange("background", color);
            }}
            selected={color === backgroundColor}
          >
            <Circle
              fill={color}
              color={color}
            />
          </MenuItem>
        ))}
        <MenuItem
          key="clear-background"
          onClick={(_e) => {
            onChange("background", "inherit");
          }}
          selected={backgroundColor === "inherit"}
        >
          <Eraser />
        </MenuItem>
      </Menu>
    </>
  );
}
