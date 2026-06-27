"use client";
import React, { memo, useCallback, useEffect, useMemo } from "react";
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
import { CloudUpload, FileStack, FileText, Pencil } from "lucide-react";
import {
  actions,
  type RootState,
  useDispatch,
  useSelector,
} from "@/store";
import { selectChildDocumentsByParent } from "@/store/selectors/layoutSelectors";
import type { UserDocument } from "@/types";
import { SafeNavigationLink } from "./SafeNavigationLink";
import type { PostItemActions } from "./hooks/useSidebarActions";
import { SubTabList, type SubTabEntry } from "./SubTabList";
import { triggerSave } from "../../EditDocument/saveRegistry";
import { ICON_SIZE } from "@/theme/icons";

const EMPTY_CHILDREN: UserDocument[] = [];
const EMPTY_TAB_ENTRIES: SubTabEntry[] = [];

interface PostItemProps {
  post: UserDocument;
  inSeries: boolean;
  sidebarOpen: boolean;
  pathname: string;
  itemActions: PostItemActions;
  /** Ids of posts whose tab list is expanded in the sidebar tree. */
  expandedTabs: Set<string>;
  /** Toggle a post's tab list open/closed (persisted). */
  onToggleTabs: (id: string) => void;
  /** Idempotently reveal a post's tab list (used when it becomes the open doc). */
  onExpandTabs: (id: string) => void;
}

export const PostItem = memo(
  (
    {
      post,
      inSeries,
      sidebarOpen,
      pathname,
      itemActions,
      expandedTabs,
      onToggleTabs,
      onExpandTabs,
    }: PostItemProps,
  ) => {
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

    // A tabbed post is a root document with one child per extra tab. Derive the
    // tabs from the store so they render regardless of which doc is open — the
    // live `ui.tabs` slice only tracks the currently-open document.
    const childMap = useSelector(selectChildDocumentsByParent);
    const children = childMap.get(post.id) ?? EMPTY_CHILDREN;
    const hasTabs = children.length > 0;

    // When this post is the open document, `ui.tabs` carries the live active
    // tab and per-tab unsaved (dirty) state.
    const isOpenRoot = useSelector(
      (state: RootState) => state.ui.tabs.rootId === post.id,
    );
    const activeTabId = useSelector((state: RootState) =>
      state.ui.tabs.rootId === post.id ? state.ui.tabs.activeTabId : null
    );
    const openDirtyIds = useSelector((state: RootState) =>
      state.ui.tabs.rootId === post.id ? state.ui.tabs.dirtyTabIds : null
    );

    const doc = post.cloud || post.local;
    const docName = doc?.name || "Untitled";
    const isViewing = pathname === `/view/${post.id}`;
    const isEditing = pathname === `/edit/${post.id}`;
    const isSelected = isViewing || isEditing;
    const isRenaming = renamingPostId === post.id;

    // The post has unsaved live edits if it's the open document and any tab is
    // dirty. Driven by the same Redux `dirtyTabIds` the Save button uses, so the
    // sidebar updates live as the user types (and clears on save/reset).
    const isDirty = isOpenRoot && (openDirtyIds?.length ?? 0) > 0;
    // IDE git-decoration style sync state, encoded on the filename:
    //   modified (local edits diverge from cloud) -> amber + bold
    //   new      (exists only locally, never synced) -> green
    //   clean    (in sync, or cloud-only) -> default
    const isModified = Boolean(post.local) &&
      Boolean(post.cloud) &&
      post.local!.head !== post.cloud!.head;
    const isNew = Boolean(post.local) && !post.cloud;

    // Tab entries: the root itself is the first tab, then each child. Dirty state
    // comes from `ui.tabs` while open, else from local/cloud divergence.
    const tabEntries = useMemo<SubTabEntry[]>(() => {
      if (!hasTabs) return EMPTY_TAB_ENTRIES;
      const rootDirty = isOpenRoot
        ? Boolean(openDirtyIds?.includes(post.id))
        : isModified;
      const entries: SubTabEntry[] = [
        { id: post.id, name: docName, dirty: rootDirty },
      ];
      for (const child of children) {
        const cd = child.cloud || child.local;
        const childDirty = isOpenRoot
          ? Boolean(openDirtyIds?.includes(child.id))
          : Boolean(child.local) &&
            Boolean(child.cloud) &&
            child.local!.head !== child.cloud!.head;
        entries.push({
          id: child.id,
          name: cd?.name || "Untitled",
          dirty: childDirty,
        });
      }
      return entries;
    }, [hasTabs, children, isOpenRoot, openDirtyIds, isModified, post.id, docName]);

    const anyTabDirty = tabEntries.some((tab) => tab.dirty);

    // Sync state is carried by filename color only (no weight bump):
    //   unsaved/modified -> amber, new -> green, clean -> default.
    const nameColor = isDirty || isModified || anyTabDirty
      ? "warning.main"
      : isNew
      ? "success.main"
      : "text.secondary";
    const nameWeight = isSelected ? 600 : 500;

    // Auto-reveal a post's tabs when it becomes the open document, so opening a
    // tabbed post still surfaces its tabs. The user can then collapse them via
    // the chevron, and the choice persists until they open it again.
    const isExpanded = expandedTabs.has(post.id);
    useEffect(() => {
      if (hasTabs && (isSelected || isOpenRoot)) onExpandTabs(post.id);
    }, [hasTabs, isSelected, isOpenRoot, post.id, onExpandTabs]);

    const handleSaveToCloud = useCallback(async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Unsaved live edits: persist the open editor's current state (and any
      // sibling tabs) via the editor's registered save callbacks.
      if (isDirty) {
        await triggerSave();
        return;
      }
      // Committed local edits diverging from cloud: push the local head.
      dispatch(
        actions.syncLocalToCloud({
          id: post.id,
          localHead: post.local!.head,
          updatedAt: post.local!.updatedAt,
          parentId: post.local!.parentId,
        }),
      );
    }, [dispatch, isDirty, post.id, post.local]);

    const handleToggleTabs = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onToggleTabs(post.id);
    }, [onToggleTabs, post.id]);

    const linkProps = isRenaming ? {} : {
      component: SafeNavigationLink,
      href: isEditing ? `/edit/${post.id}` : `/view/${post.id}`,
    };

    const showSubTabs = sidebarOpen && hasTabs && isExpanded;
    // When the sub-tab list is shown, the active visible content is one of the
    // sub-tabs (highlighted in SubTabList), so don't also highlight the parent.
    const highlightParent = isSelected && !showSubTabs;

    return (
      <ListItem
        disablePadding
        sx={{
          display: "block",
          "& .sync-btn, & .edit-btn": {
            opacity: 0,
            transition: "opacity 0.15s",
          },
          "&:hover .sync-btn, &:hover .edit-btn": { opacity: 1 },
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
              ...(inSeries ? { pl: 1.5, pr: 2 } : { pl: 2.5, pr: 2 }),
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
              onClick={hasTabs ? handleToggleTabs : undefined}
              {...(hasTabs && {
                role: "button",
                "aria-label": isExpanded ? "Collapse tabs" : "Expand tabs",
                "aria-expanded": isExpanded,
              })}
              sx={{
                minWidth: 0,
                mr: sidebarOpen ? 1 : "auto",
                justifyContent: "center",
                ...(hasTabs && { cursor: "pointer" }),
                "& > svg": { transition: "color .15s" },
              }}
            >
              {hasTabs
                ? (
                  // A tabbed post reads as a stack of pages rather than a folder,
                  // distinguishing it from the series chevron. The glyph darkens
                  // when its tab list is expanded.
                  <FileStack
                    size={ICON_SIZE.inline}
                    strokeWidth={2}
                    style={{
                      color: isExpanded
                        ? "var(--mui-palette-text-primary)"
                        : "var(--mui-palette-text-secondary)",
                    }}
                  />
                )
                : (
                  <FileText
                    size={ICON_SIZE.inline}
                    style={{ color: "var(--mui-palette-text-secondary)" }}
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
                        fontWeight: nameWeight,
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
                        fontWeight: nameWeight,
                        color: nameColor,
                      },
                    }}
                  />
                ))}
            {sidebarOpen && isDirty && !showSubTabs && (
              <Box
                component="span"
                aria-label="Unsaved changes"
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  bgcolor: "warning.main",
                  flexShrink: 0,
                  ml: "auto",
                }}
              />
            )}
            {sidebarOpen && (isDirty || isModified) && (
              <Tooltip title="Save to cloud" placement="right">
                <IconButton
                  className="sync-btn"
                  size="small"
                  onClick={handleSaveToCloud}
                  sx={{
                    p: 0.25,
                    ml: isDirty && !showSubTabs ? 0.5 : "auto",
                    color: "warning.main",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <CloudUpload size={ICON_SIZE.inline} />
                </IconButton>
              </Tooltip>
            )}
            {sidebarOpen && !isRenaming && !isEditing && (
              <Tooltip title="Edit" placement="right">
                <IconButton
                  className="edit-btn"
                  component={SafeNavigationLink}
                  href={`/edit/${post.id}`}
                  size="small"
                  onClick={(e) => e.stopPropagation()}
                  sx={{
                    p: 0.25,
                    // Align the glyph's right edge with the series doc-count
                    // badge above by cancelling the button's own right padding.
                    ml: isModified || (isDirty && !showSubTabs) ? 0.5 : "auto",
                    mr: -0.25,
                    color: "text.secondary",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <Pencil size={ICON_SIZE.micro} />
                </IconButton>
              </Tooltip>
            )}
          </ListItemButton>
        </Tooltip>
        {showSubTabs && (
          <SubTabList
            tabs={tabEntries}
            activeTabId={activeTabId}
            isOpenRoot={isOpenRoot}
          />
        )}
      </ListItem>
    );
  },
);

PostItem.displayName = "PostItem";
