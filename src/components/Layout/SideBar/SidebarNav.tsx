"use client";
import React from "react";
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from "@mui/material";
import { FileText, MessageSquare } from "lucide-react";
import { styles } from "../styles";
import { SafeNavigationLink } from "./SafeNavigationLink";

const NAV_ITEM_MIN_HEIGHT = 40;

const navigationItems = [
  {
    text: "Posts",
    icon: <FileText size={20} strokeWidth={1.7} />,
    path: "/posts",
  },
  {
    text: "Notes",
    icon: <MessageSquare size={20} strokeWidth={1.7} />,
    path: "/notes",
  },
];

interface SidebarNavProps {
  expanded: boolean;
  pathname: string;
}

/** Primary nav (Posts / Notes). Rounded rows; collapses to centered icons. */
export const SidebarNav: React.FC<SidebarNavProps> = ({
  expanded,
  pathname,
}) => (
  <Box
    role="navigation"
    aria-label="Main navigation"
    sx={{ ...styles.sectionBox, flexShrink: 0, pb: 0, pt: 0.5 }}
  >
    <List>
      {navigationItems.map((item) => (
        <ListItem key={item.text} disablePadding sx={{ display: "block" }}>
          <Tooltip title={expanded ? "" : item.text} placement="right">
            <ListItemButton
              component={SafeNavigationLink}
              href={item.path}
              selected={Boolean(
                pathname === item.path ||
                  pathname.startsWith(`${item.path}/`),
              )}
              sx={{
                minHeight: NAV_ITEM_MIN_HEIGHT,
                justifyContent: expanded ? "initial" : "center",
                px: 1.5,
                mx: 1,
                borderRadius: "11px",
                "&:hover": { bgcolor: "action.hover" },
                "&.Mui-selected": {
                  bgcolor: "action.selected",
                  // scheme-aware overlay (was a light-only rgba(0,0,0,.15))
                  "&:hover": {
                    bgcolor:
                      "rgba(var(--mui-palette-text-primaryChannel) / 0.15)",
                  },
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 0,
                  mr: expanded ? 2 : "auto",
                  justifyContent: "center",
                  "& .MuiSvgIcon-root": { fontSize: "1.2em" },
                }}
              >
                {item.icon}
              </ListItemIcon>
              {expanded && (
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{ fontSize: "0.9em" }}
                />
              )}
            </ListItemButton>
          </Tooltip>
        </ListItem>
      ))}
    </List>
  </Box>
);
