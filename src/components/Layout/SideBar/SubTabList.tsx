"use client";
import React, { useState } from "react";
import {
  Box,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
} from "@mui/material";
import { FilePen } from "lucide-react";
import { actions, useDispatch } from "@/store";
import { ICON_SIZE } from "@/theme/icons";
import { SafeNavigationLink } from "./SafeNavigationLink";
import { MONO_FONT } from "./constants";
import type { PostItemActions } from "./hooks/useSidebarActions";

export interface SubTabEntry {
  id: string;
  name: string;
  dirty: boolean;
}

interface SubTabListProps {
  tabs: SubTabEntry[];
  activeTabId: string | null;
  /**
   * Whether the parent post is the document currently open in the editor/viewer.
   * When true, clicking a tab switches the active tab in place (driven by the
   * shared `ui.tabs` store). When false the post isn't open, so a click
   * navigates to that tab's document instead.
   */
  isOpenRoot: boolean;
  /**
   * The root document's id. The root doubles as the post and its first tab, so
   * renaming that first tab edits its `tabLabel` (keeping the post title in
   * `name` independent); every other tab is a plain doc renamed via `name`.
   */
  rootTabId: string;
  /**
   * Shared rename machinery from `useSidebarActions`. Sub-tabs are regular
   * documents, so the same id-keyed rename flow used for posts renames them too
   * (double-click or right-click → Rename to start; Enter/blur commits, Escape
   * cancels).
   */
  itemActions: PostItemActions;
}

const dotSx = {
  width: 6,
  height: 6,
  borderRadius: "2px",
  flexShrink: 0,
  bgcolor: "text.disabled",
} as const;

export const SubTabList: React.FC<SubTabListProps> = (
  { tabs, activeTabId, isOpenRoot, rootTabId, itemActions },
) => {
  const dispatch = useDispatch();
  const {
    renamingPostId,
    renameField,
    renameValue,
    setRenameValue,
    renameInputRef,
    handleDoubleClick,
    handleRenameBlur,
    handleRenameKeyDown,
  } = itemActions;

  // The first (root) tab renames its own `tabLabel`; the rest rename `name`.
  const fieldFor = (tabId: string) => tabId === rootTabId ? "tabLabel" : "name";

  // Right-click menu, anchored at the cursor and keyed to the target tab.
  const [menu, setMenu] = useState<
    { mouseX: number; mouseY: number; tab: SubTabEntry } | null
  >(null);

  const handleContextMenu = (e: React.MouseEvent, tab: SubTabEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu((prev) =>
      prev === null
        ? { mouseX: e.clientX + 2, mouseY: e.clientY - 6, tab }
        : null
    );
  };

  const handleCloseMenu = () => setMenu(null);

  const handleRenameFromMenu = (e: React.MouseEvent) => {
    if (!menu) return;
    const { tab } = menu;
    setMenu(null);
    // Reuse the double-click rename starter (it only reads the event to
    // suppress default behavior), so the inline TextField opens on this tab.
    handleDoubleClick(e, tab.id, tab.name, fieldFor(tab.id));
  };

  return (
    <>
      <Box
        component="ul"
        aria-label="Sub-document tabs"
        sx={{
          listStyle: "none",
          p: 0,
          m: 0,
          pl: "14px",
          ml: "22px",
          mb: 0.5,
        }}
      >
        {tabs.map((tab) => {
          const isActive = isOpenRoot && tab.id === activeTabId;
          const isRenaming = renamingPostId === tab.id &&
            renameField === fieldFor(tab.id);

          if (isRenaming) {
            return (
              <Box
                key={tab.id}
                component="li"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  py: "3px",
                  px: "7px",
                  borderRadius: "5px",
                  fontSize: "0.72em",
                }}
              >
                <Box component="span" aria-hidden sx={dotSx} />
                <TextField
                  inputRef={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={handleRenameBlur}
                  onKeyDown={handleRenameKeyDown}
                  size="small"
                  variant="standard"
                  fullWidth
                  sx={{
                    "& .MuiInput-input": { fontSize: "inherit", py: 0 },
                  }}
                />
              </Box>
            );
          }

          const interactionProps = isOpenRoot
            ? {
              role: "button",
              tabIndex: 0,
              onClick: () => dispatch(actions.setActiveTab(tab.id)),
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  dispatch(actions.setActiveTab(tab.id));
                }
              },
            }
            : {
              component: SafeNavigationLink,
              href: `/view/${tab.id}`,
            };
          return (
            <Box
              key={tab.id}
              component="li"
              {...interactionProps}
              onDoubleClick={(e: React.MouseEvent) =>
                handleDoubleClick(e, tab.id, tab.name, fieldFor(tab.id))}
              onContextMenu={(e: React.MouseEvent) => handleContextMenu(e, tab)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                py: "3px",
                px: "7px",
                borderRadius: "5px",
                fontSize: "0.72em",
                cursor: "pointer",
                color: "text.secondary",
                textDecoration: "none",
                fontWeight: 400,
                bgcolor: isActive ? "action.selected" : "transparent",
                "&:hover": {
                  bgcolor: "action.hover",
                },
              }}
            >
              <Box
                component="span"
                aria-hidden
                sx={dotSx}
              />
              <Box
                component="span"
                sx={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  fontFamily: MONO_FONT,
                }}
              >
                {tab.name}
              </Box>
              {tab.dirty && (
                <Box
                  component="span"
                  aria-label="Unsaved"
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: "warning.main",
                    flexShrink: 0,
                  }}
                />
              )}
            </Box>
          );
        })}
      </Box>

      <Menu
        open={menu !== null}
        onClose={handleCloseMenu}
        anchorReference="anchorPosition"
        anchorPosition={menu !== null
          ? { top: menu.mouseY, left: menu.mouseX }
          : undefined}
        slotProps={{
          paper: {
            elevation: 2,
            sx: (theme) => ({
              minWidth: 130,
              borderRadius: 1,
              mt: 0.5,
              bgcolor: "rgba(250, 250, 250, 0.95)",
              ...theme.applyStyles("dark", {
                bgcolor: "rgba(30, 30, 30, 0.95)",
              }),
              backdropFilter: "blur(8px)",
            }),
          },
        }}
      >
        <MenuItem
          onClick={handleRenameFromMenu}
          sx={{
            py: 0.75,
            px: 1.75,
            gap: 1.25,
            typography: "body2",
            "&:hover": { backgroundColor: "action.hover" },
          }}
        >
          <ListItemIcon sx={{ minWidth: "auto !important" }}>
            <FilePen size={ICON_SIZE.dense} />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ variant: "body2" }}>
            Rename
          </ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
};
