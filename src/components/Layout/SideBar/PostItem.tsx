"use client";
import React, { memo, useCallback } from "react";
import {
  Box,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  Tooltip,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { CloudUpload, FileText } from "lucide-react";
import {
  actions,
  documentsSelectors,
  type RootState,
  useDispatch,
  useSelector,
} from "@/store";
import type { UserDocument } from "@/types";
import { SafeNavigationLink } from "./SafeNavigationLink";
import type { PostItemActions } from "./hooks/useSidebarActions";
import { SubTabList } from "./SubTabList";

interface PostItemProps {
  post: UserDocument;
  inSeries: boolean;
  sidebarOpen: boolean;
  pathname: string;
  itemActions: PostItemActions;
}

export const PostItem = memo(
  ({ post, inSeries, sidebarOpen, pathname, itemActions }: PostItemProps) => {
    const dispatch = useDispatch();
    const {
      renamingPostId,
      renameValue,
      setRenameValue,
      renameInputRef,
      handleContextMenu,
      handleDoubleClick,
      handleRenameBlur,
      handleRenameKeyDown,
    } = itemActions;

    const { tabsState, subTabs } = useSelector((state: RootState) => {
      const tabs = state.ui.tabs;
      const isRoot = tabs.rootId === post.id;
      const count = isRoot ? tabs.tabIds.length : 0;
      const entries = isRoot && count > 1
        ? tabs.tabIds.map((id) => {
          const d = documentsSelectors.selectById(state, id);
          return {
            id,
            name: d?.cloud?.name ?? d?.local?.name ?? "Untitled",
            dirty: tabs.dirtyTabIds.includes(id),
          };
        })
        : [];
      return { tabsState: tabs, subTabs: entries };
    });

    const doc = post.cloud || post.local;
    const docName = doc?.name || "Untitled";
    const isViewing = pathname === `/view/${post.id}`;
    const isEditing = pathname === `/edit/${post.id}`;
    const isSelected = isViewing || isEditing;
    const isRenaming = renamingPostId === post.id;
    const isDirty = Boolean(post.local) &&
      Boolean(post.cloud) &&
      post.local!.head !== post.cloud!.head;

    const handleSyncToCloud = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dispatch(
        actions.syncLocalToCloud({
          id: post.id,
          localHead: post.local!.head,
          updatedAt: post.local!.updatedAt,
          parentId: post.local!.parentId,
        }),
      );
    }, [dispatch, post.id, post.local]);

    const linkProps = isRenaming
      ? {}
      : {
        component: SafeNavigationLink,
        href: isEditing ? `/edit/${post.id}` : `/view/${post.id}`,
      };

    // When the sub-tab list is shown, the active visible content is one of the
    // sub-tabs (highlighted in SubTabList), so don't also highlight the parent.
    const showSubTabs = sidebarOpen && isSelected && subTabs.length > 1;
    const highlightParent = isSelected && !showSubTabs;

    return (
      <ListItem
        disablePadding
        sx={{
          display: "block",
          "& .sync-btn": { opacity: 0, transition: "opacity 0.15s" },
          "&:hover .sync-btn": { opacity: 1 },
        }}
      >
        <Tooltip title={sidebarOpen ? "" : docName} placement="right">
          <ListItemButton
            {...linkProps}
            selected={highlightParent}
            onContextMenu={(e) => handleContextMenu(e, post.id)}
            onDoubleClick={(e) => {
              if (sidebarOpen) handleDoubleClick(e, post.id, docName);
            }}
            sx={{
              minHeight: inSeries ? 26 : 30,
              justifyContent: sidebarOpen ? "initial" : "center",
              overflow: "hidden",
              ...(inSeries ? { pl: 1.5, pr: 5 } : { pl: 2.5, pr: 5 }),
              py: inSeries ? 0.25 : 0.375,
              "&.Mui-selected": {
                bgcolor: "action.selected",
                "&:hover": {
                  bgcolor: (theme) =>
                    alpha(
                      theme.palette.action.active,
                      inSeries ? 0.12 : 0.15,
                    ),
                },
              },
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: 0,
                mr: sidebarOpen ? 1 : "auto",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <FileText
                size={14}
                style={{ color: "var(--mui-palette-text-secondary)" }}
              />
              {isDirty && (
                <Box
                  component="span"
                  sx={{
                    position: "absolute",
                    top: -1,
                    right: -3,
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    bgcolor: "primary.main",
                  }}
                />
              )}
            </ListItemIcon>
            {sidebarOpen &&
              (isRenaming
                ? (
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
                      "& .MuiInput-input": {
                        fontSize: "0.7em",
                        fontWeight: isSelected ? 600 : 500,
                        py: 0,
                      },
                    }}
                  />
                )
                : (
                  <ListItemText
                    primary={docName}
                    sx={{ minWidth: 0, overflow: "hidden" }}
                    primaryTypographyProps={{
                      fontSize: "0.7em",
                      sx: {
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontWeight: isSelected ? 600 : 500,
                        color: "text.secondary",
                      },
                    }}
                  />
                ))}
            {sidebarOpen && isDirty && (
              <Tooltip title="Save to cloud" placement="right">
                <IconButton
                  className="sync-btn"
                  size="small"
                  onClick={handleSyncToCloud}
                  sx={{
                    p: 0.25,
                    ml: 0.5,
                    color: "primary.main",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <CloudUpload size={14} />
                </IconButton>
              </Tooltip>
            )}
          </ListItemButton>
        </Tooltip>
        {showSubTabs && (
          <SubTabList tabs={subTabs} activeTabId={tabsState.activeTabId} />
        )}
      </ListItem>
    );
  },
);

PostItem.displayName = "PostItem";
