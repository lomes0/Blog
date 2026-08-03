"use client";
import React from "react";
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
import { useContextMenu } from "@/hooks/useContextMenu";
import { SafeNavigationLink } from "./SafeNavigationLink";
import { MONO_FONT, SB_FONT, SB_ITEM_RADIUS } from "./constants";
import type { PostItemActions, RenameField } from "./hooks/useSidebarActions";

export interface SubTabEntry {
  id: string;
  name: string;
}

interface SubTabListProps {
  tabs: SubTabEntry[];
  activeTabId: string | null;
  /**
   * Whether the parent post is the document currently open in the editor/viewer.
   * When true, clicking a tab switches the active tab in place (in the focused
   * pane). When false the post isn't open, so a click navigates to that tab's
   * document instead.
   */
  isOpenRoot: boolean;
  /**
   * The root document's id. The root doubles as the post and its first tab, so
   * renaming that first tab edits its `tabLabel` (keeping the post title in
   * `name` independent); every other tab is a plain doc renamed via `name`.
   */
  rootTabId: string;
  /**
   * The pane this post is open in, or null when it is not open. Switching a
   * sub-tab acts on *that* pane — the focused one may be showing a different
   * post entirely.
   */
  paneId: string | null;
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
  borderRadius: 0.5,
  flexShrink: 0,
  bgcolor: "text.disabled",
} as const;

export const SubTabList: React.FC<SubTabListProps> = (
  { tabs, activeTabId, isOpenRoot, rootTabId, paneId, itemActions },
) => {
  const dispatch = useDispatch();
  const { rename } = itemActions;

  // Switching a sub-tab also focuses the pane holding it: the click is an act
  // of attention, and leaving focus on the other pane would point the toolbar,
  // the rail and the Copilot at a document the user has just navigated away
  // from.
  const switchTo = (tabId: string) => {
    if (!paneId) return;
    dispatch(actions.focusPane(paneId));
    dispatch(actions.setActiveTab({ paneId, tabId }));
  };

  // The first (root) tab renames its own `tabLabel`; the rest rename `name`.
  const fieldFor = (tabId: string): RenameField =>
    tabId === rootTabId ? "tabLabel" : "name";

  // Right-click menu, anchored at the cursor. A sub-tab sits inside the post
  // row, which has its own menu, so the event must stop here.
  const { contextMenu: menu, open: openMenu, close: closeMenu } =
    useContextMenu<SubTabEntry>({ stopPropagation: true });

  const handleRenameFromMenu = () => {
    if (!menu) return;
    const { target: tab } = menu;
    closeMenu();
    rename.start(tab.id, fieldFor(tab.id));
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
          pl: "10px",
          ml: "12px",
          mb: 0.5,
        }}
      >
        {tabs.map((tab) => {
          const isActive = isOpenRoot && tab.id === activeTabId;
          const isRenaming = rename.renamingId === tab.id &&
            rename.context === fieldFor(tab.id);

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
                  borderRadius: SB_ITEM_RADIUS,
                  fontSize: SB_FONT.meta,
                }}
              >
                <Box component="span" aria-hidden sx={dotSx} />
                <TextField
                  inputRef={rename.inputRef}
                  value={rename.value}
                  onChange={(e) => rename.setValue(e.target.value)}
                  onBlur={rename.handleBlur}
                  onKeyDown={rename.handleKeyDown}
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
              onClick: () => switchTo(tab.id),
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  switchTo(tab.id);
                }
              },
            }
            : {
              // This branch is a tab of a post no pane holds, so there is no
              // pane to switch within — the link opens it. `/edit`, because
              // Phase 4 made `/view/[id]` the store-free public page and a
              // sidebar row must not send the user out of the workspace.
              component: SafeNavigationLink,
              href: `/edit/${tab.id}`,
            };
          return (
            <Box
              key={tab.id}
              component="li"
              {...interactionProps}
              onDoubleClick={(e: React.MouseEvent) => {
                e.preventDefault();
                rename.start(tab.id, fieldFor(tab.id));
              }}
              onContextMenu={(e: React.MouseEvent) => openMenu(e, tab)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                py: "3px",
                px: "7px",
                borderRadius: SB_ITEM_RADIUS,
                fontSize: SB_FONT.meta,
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
            </Box>
          );
        })}
      </Box>

      <Menu
        open={menu !== null}
        onClose={closeMenu}
        anchorReference="anchorPosition"
        anchorPosition={menu !== null
          ? { top: menu.mouseY, left: menu.mouseX }
          : undefined}
      >
        <MenuItem onClick={handleRenameFromMenu}>
          <ListItemIcon>
            <FilePen size={ICON_SIZE.dense} />
          </ListItemIcon>
          <ListItemText>Rename</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
};
