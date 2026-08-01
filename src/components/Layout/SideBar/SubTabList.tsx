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
import { actions, useDispatch, useSelector } from "@/store";
import { selectFocusedPaneId } from "@/store/selectors/layoutSelectors";
import { ICON_SIZE } from "@/theme/icons";
import { useContextMenu } from "@/hooks/useContextMenu";
import { SafeNavigationLink } from "./SafeNavigationLink";
import { MONO_FONT, SB_FONT, SB_ITEM_RADIUS } from "./constants";
import type { PostItemActions, RenameField } from "./hooks/useSidebarActions";

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
  { tabs, activeTabId, isOpenRoot, rootTabId, itemActions },
) => {
  const dispatch = useDispatch();
  // A sidebar row owns no pane of its own; switching tabs acts on whichever
  // pane has focus. `isOpenRoot` is already the assertion that that pane is
  // rooted at this post.
  const focusedPaneId = useSelector(selectFocusedPaneId);
  const { rename } = itemActions;

  const switchTo = (tabId: string) => {
    if (!focusedPaneId) return;
    dispatch(actions.setActiveTab({ paneId: focusedPaneId, tabId }));
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
              component: SafeNavigationLink,
              href: `/view/${tab.id}`,
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
                borderRadius: 1.5,
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
