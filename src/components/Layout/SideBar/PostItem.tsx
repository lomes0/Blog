"use client";
import React, { memo, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
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
import { File, Pencil, Save } from "lucide-react";
import { type RootState, useSelector } from "@/store";
import { selectChildPostsByParent } from "@/store/selectors/layoutSelectors";
import type { Post } from "@/types";
import { SafeNavigationLink } from "./SafeNavigationLink";
import type { PostItemActions } from "./hooks/useSidebarActions";
import {
  DRAG_MIME,
  type DropPosition,
  dropPositionFromEvent,
} from "./hooks/useSidebarDnd";
import { type SubTabEntry, SubTabList } from "./SubTabList";
import { triggerSave } from "../../EditDocument/saveRegistry";
import { ICON_SIZE } from "@/theme/icons";
import { MONO_FONT, SB_ACCENT, SB_FONT, SB_ITEM_RADIUS } from "./constants";

const EMPTY_CHILDREN: Post[] = [];
const EMPTY_TAB_ENTRIES: SubTabEntry[] = [];

interface PostItemProps {
  post: Post;
  inSeries: boolean;
  sidebarOpen: boolean;
  pathname: string;
  itemActions: PostItemActions;
  /** Ids of posts whose tab list is expanded in the sidebar tree. */
  expandedTabs: Set<string>;
  /** Toggle a post's tab list open/closed (persisted). */
  onToggleTabs: (id: string) => void;
  /** Whether this row is part of the current multi-selection. */
  isSelected?: boolean;
  /**
   * Apply a modifier-aware selection gesture on row click. Returns true when the
   * click was a selection gesture (navigation should be suppressed).
   */
  onSelectClick?: (id: string, event: React.MouseEvent) => boolean;
  /** Begin dragging this post (native DnD). */
  onDragStartItem?: (event: React.DragEvent, id: string) => void;
  onDragEndItem?: () => void;
  /** Report a hovered reorder position relative to this row. */
  onReorderDragOver?: (targetId: string, position: DropPosition) => void;
  onReorderDrop?: (targetId: string, position: DropPosition) => void;
  /** Insertion line to draw for this row, if any. */
  dropIndicator?: DropPosition | null;
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
      isSelected: isMultiSelected = false,
      onSelectClick,
      onDragStartItem,
      onDragEndItem,
      onReorderDragOver,
      onReorderDrop,
      dropIndicator = null,
    }: PostItemProps,
  ) => {
    const router = useRouter();
    const {
      renamingPostId,
      renameField,
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
    const childMap = useSelector(selectChildPostsByParent);
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

    const doc = post;
    const docName = doc?.name || "Untitled";
    // The first tab's label can differ from the post title; fall back to it.
    const rootTabLabel = doc?.tabLabel ?? docName;
    const isViewing = pathname === `/view/${post.id}`;
    const isEditing = pathname === `/edit/${post.id}`;
    const isSelected = isViewing || isEditing;
    // The post row renames the post title (`name`); the first sub-tab (same id)
    // renames `tabLabel`. Disambiguate by field so only one input shows.
    const isRenaming = renamingPostId === post.id && renameField === "name";

    // The post has unsaved live edits if it's the open document and any tab is
    // dirty. Driven by the same Redux `dirtyTabIds` the Save button uses, so the
    // sidebar updates live as the user types (and clears on save/reset).
    const isDirty = isOpenRoot && (openDirtyIds?.length ?? 0) > 0;
    // Tab entries: the root itself is the first tab, then each child. A tab is
    // dirty only while its editor is open with unsaved edits — a closed post has
    // nothing pending, since the save loop persists on unmount.
    const tabEntries = useMemo<SubTabEntry[]>(() => {
      if (!hasTabs) return EMPTY_TAB_ENTRIES;
      const rootDirty = isOpenRoot &&
        Boolean(openDirtyIds?.includes(post.id));
      const entries: SubTabEntry[] = [
        { id: post.id, name: rootTabLabel, dirty: rootDirty },
      ];
      for (const child of children) {
        const cd = child;
        const childDirty = isOpenRoot &&
          Boolean(openDirtyIds?.includes(child.id));
        entries.push({
          id: child.id,
          name: cd?.name || "Untitled",
          dirty: childDirty,
        });
      }
      return entries;
    }, [
      hasTabs,
      children,
      isOpenRoot,
      openDirtyIds,
      post.id,
      rootTabLabel,
    ]);

    const anyTabDirty = tabEntries.some((tab) => tab.dirty);

    // Unsaved state is carried by filename color only (no weight bump).
    const nameColor = isDirty || anyTabDirty
      ? "warning.main"
      : "text.secondary";
    // Select is carried by the filled pill alone — no weight bump (matches the
    // sub-tab treatment), so the resting weight holds whether selected or not.
    const nameWeight = 500;

    // Tab lists stay collapsed until the user opens them via the file icon
    // (handleToggleTabs). Opening/viewing a tabbed post does NOT auto-reveal
    // its tabs — the expand state is entirely user-driven and persisted.
    const isExpanded = expandedTabs.has(post.id);

    // Autosave already handles this; the button is for users who want to force
    // it now rather than wait out the debounce.
    const handleSaveNow = useCallback(async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      await triggerSave();
    }, []);

    const handleToggleTabs = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onToggleTabs(post.id);
    }, [onToggleTabs, post.id]);

    // Navigate to edit programmatically rather than rendering a nested <a>.
    // The row itself is already an anchor (to /view), and an <a> inside an <a>
    // is invalid HTML that trips React's hydration validation.
    const handleEdit = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      router.push(`/edit/${post.id}`);
    }, [router, post.id]);

    // Modifier-only selection: Ctrl/Cmd or Shift click selects this row and
    // suppresses navigation; a plain click clears any selection and navigates.
    const handleRowClick = useCallback(
      (e: React.MouseEvent) => {
        if (!onSelectClick) return;
        const consumed = onSelectClick(post.id, e);
        if (consumed) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      [onSelectClick, post.id],
    );

    // Native drag reorder: report before/after based on the cursor's position
    // over the row's vertical midpoint. Only our own drags are intercepted.
    const handleDragOver = useCallback(
      (e: React.DragEvent<HTMLElement>) => {
        if (!onReorderDragOver) return;
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        onReorderDragOver(post.id, dropPositionFromEvent(e));
      },
      [onReorderDragOver, post.id],
    );
    const handleDrop = useCallback(
      (e: React.DragEvent<HTMLElement>) => {
        if (!onReorderDrop) return;
        e.preventDefault();
        onReorderDrop(post.id, dropPositionFromEvent(e));
      },
      [onReorderDrop, post.id],
    );

    const linkProps = isRenaming ? {} : {
      component: SafeNavigationLink,
      href: isEditing ? `/edit/${post.id}` : `/view/${post.id}`,
    };

    const showSubTabs = sidebarOpen && hasTabs && isExpanded;
    // Tabbed posts toggle their tab list from the file icon itself (it doubles
    // as the "stacked" indicator), so the toggle is only live when open + tabbed.
    const canToggleTabs = sidebarOpen && hasTabs;
    // When the sub-tab list is shown, the active visible content is one of the
    // sub-tabs (highlighted in SubTabList), so don't also highlight the parent.
    const highlightParent = isSelected && !showSubTabs;
    // A clean selected row darkens its filename to the accent indigo (light mode
    // only, applied below). `nameColor` still owns the amber/green sync signals,
    // so only override when the row is clean (color resolved to `text.secondary`).
    const showAccentText = highlightParent && nameColor === "text.secondary";

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
            draggable={Boolean(onDragStartItem) && !isRenaming}
            onClick={handleRowClick}
            onDragStart={onDragStartItem
              ? (e) => onDragStartItem(e, post.id)
              : undefined}
            onDragEnd={onDragEndItem}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onContextMenu={(e) => handleContextMenu(e, post.id)}
            onDoubleClick={(e) => {
              if (sidebarOpen) handleDoubleClick(e, post.id, docName);
            }}
            sx={[{
              minHeight: inSeries ? 26 : 30,
              justifyContent: sidebarOpen ? "initial" : "center",
              overflow: "hidden",
              position: "relative",
              // Native-DnD insertion line: a 2px primary bar on the row edge the
              // dragged item would drop against (matches PostsListView).
              ...(dropIndicator && {
                "&::after": {
                  content: '""',
                  position: "absolute",
                  left: 0,
                  right: 0,
                  [dropIndicator === "before" ? "top" : "bottom"]: 0,
                  height: 2,
                  bgcolor: "primary.main",
                  zIndex: 2,
                },
              }),
              // Rounded "pill" select shared with sub-tabs and series rows.
              borderRadius: SB_ITEM_RADIUS,
              // Top-level rows use the same left padding as a SeriesGroup row
              // (px: 2) so the post icon lines up under the series chevron;
              // in-series rows trim it since they're already nested.
              ...(inSeries ? { pl: 0.75, pr: 2 } : { pl: 2, pr: 2 }),
              py: inSeries ? 0.25 : 0.375,
              "&:hover": { bgcolor: "action.hover" },
              // Selected = soft filled pill only: no accent bar, no weight bump —
              // the same low-chrome treatment the sub-tabs use.
              "&.Mui-selected": {
                bgcolor: "action.selected",
                "&:hover": { bgcolor: "action.hover" },
              },
              // Keyboard focus must stay visible for a11y, but MUI's default
              // `.Mui-focusVisible` fills the row with `action.focus` — a gray
              // nearly identical to `action.selected`. Left on a row that is no
              // longer the open document (focus lingers after navigating away by
              // another route), it reads as a second "selected" item. Replace the
              // fill with a focus ring so only the viewed row carries a bg fill.
              "&.Mui-focusVisible:not(.Mui-selected)": {
                bgcolor: "transparent",
              },
              "&.Mui-focusVisible": {
                outline: "2px solid",
                outlineColor: "primary.main",
                outlineOffset: "-2px",
              },
              // Multi-selection (Ctrl/Cmd/Shift click) reads as a primary-tinted
              // pill, distinct from the neutral `action.selected` fill that marks
              // the currently-open document. Wins over both the base and
              // `.Mui-selected` fills so a row that is open *and* multi-selected
              // still shows the selection tint.
              ...(isMultiSelected && {
                "&, &.Mui-selected": {
                  bgcolor: (t) => alpha(t.palette.primary.main, 0.16),
                },
                "&:hover, &.Mui-selected:hover": {
                  bgcolor: (t) => alpha(t.palette.primary.main, 0.24),
                },
              }),
            },
            // Light-mode: the selected pill picks up the Refined-Explorer accent
            // tint (dark mode keeps the neutral `action.selected` fill above).
            // Skipped for multi-selected rows so their primary-tint wins.
            (theme) => ({
              ...(!isMultiSelected && {
                "&.Mui-selected": theme.applyStyles("light", {
                  backgroundColor: SB_ACCENT.tint,
                  "&:hover": { backgroundColor: SB_ACCENT.tint },
                }),
              }),
            }),
            ]}
          >
            <ListItemIcon
              onClick={canToggleTabs ? handleToggleTabs : undefined}
              {...(canToggleTabs && {
                role: "button",
                "aria-label": isExpanded ? "Collapse tabs" : "Expand tabs",
                "aria-expanded": isExpanded,
              })}
              sx={{
                minWidth: 0,
                mr: sidebarOpen ? 1 : "auto",
                justifyContent: "center",
                ...(canToggleTabs && { cursor: "pointer" }),
                "& > svg": { transition: "color .15s" },
              }}
            >
              {
                /* Refined-Explorer note glyph — the plain `File` icon, rendered
                  identically for plain and tabbed ("stacked") posts. For tabbed
                  posts the icon still doubles as the tab-list toggle. */
              }
              <File
                size={ICON_SIZE.inline}
                strokeWidth={1.8}
                style={{ color: "var(--mui-palette-text-secondary)" }}
              />
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
                        fontSize: SB_FONT.meta,
                        fontWeight: nameWeight,
                        py: 0,
                      },
                    }}
                  />
                )
                : (
                  <ListItemText
                    sx={{ minWidth: 0, overflow: "hidden" }}
                    primary={
                      <Box
                        component="span"
                        sx={{
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {docName}
                      </Box>
                    }
                    primaryTypographyProps={{
                      component: "div",
                      fontSize: SB_FONT.meta,
                      sx: (theme) => ({
                        display: "flex",
                        minWidth: 0,
                        fontFamily: MONO_FONT,
                        fontWeight: nameWeight,
                        color: nameColor,
                        ...(showAccentText &&
                          theme.applyStyles("light", {
                            color: SB_ACCENT.activeText,
                          })),
                      }),
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
            {sidebarOpen && isDirty && (
              <Tooltip title="Save now" placement="right">
                <IconButton
                  className="sync-btn"
                  size="small"
                  onClick={handleSaveNow}
                  sx={{
                    p: 0.25,
                    ml: isDirty && !showSubTabs ? 0.5 : "auto",
                    color: "warning.main",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <Save size={ICON_SIZE.inline} />
                </IconButton>
              </Tooltip>
            )}
            {sidebarOpen && !isRenaming && !isEditing && (
              <Tooltip title="Edit" placement="right">
                <IconButton
                  className="edit-btn"
                  aria-label="Edit"
                  size="small"
                  onClick={handleEdit}
                  sx={{
                    p: 0.25,
                    // Align the glyph's right edge with the series doc-count
                    // badge above by cancelling the button's own right padding.
                    ml: isDirty && !showSubTabs ? 0.5 : "auto",
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
            rootTabId={post.id}
            itemActions={itemActions}
          />
        )}
      </ListItem>
    );
  },
);

PostItem.displayName = "PostItem";
