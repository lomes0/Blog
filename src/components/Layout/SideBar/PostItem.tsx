"use client";
import React, { memo, useCallback, useMemo } from "react";
import {
  Box,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  Tooltip,
} from "@mui/material";
import { File } from "lucide-react";
import { type RootState, useSelector } from "@/store";
import {
  selectChildPostsByParent,
  selectPaneRootedAt,
} from "@/store/selectors/layoutSelectors";
import { selectAgentMarker } from "@/store/selectors/proposalSelectors";
import type { Post } from "@/types";
import { SafeNavigationLink } from "./SafeNavigationLink";
import type { PostItemActions } from "./hooks/useSidebarActions";
import { documentCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";
import {
  DRAG_MIME,
  type DropPosition,
  dropPositionFromEvent,
} from "@/lib/dragDrop";
import { type SubTabEntry, SubTabList } from "./SubTabList";
import { ICON_SIZE } from "@/theme/icons";
import { MONO_FONT, SB_FONT, SB_ITEM_RADIUS } from "./constants";
import {
  chromeFocusRingSx,
  dropIndicatorSx,
  multiSelectSx,
} from "@/theme/treeRow";
import { AgentMarker } from "./AgentMarker";
import { RowAgentActions } from "./RowAgentActions";

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
    const run = useCommandRun();
    const { rename } = itemActions;

    // A tabbed post is a root document with one child per extra tab. Derive the
    // tabs from the store so they render regardless of which doc is open —
    // `ui.workspace` only tracks the documents that are actually open.
    const childMap = useSelector(selectChildPostsByParent);
    const children = childMap.get(post.id) ?? EMPTY_CHILDREN;
    const hasTabs = children.length > 0;

    // The pane this post is open in — *any* pane, not just the focused one.
    // With two panes, asking only about focus marks one of the two open posts
    // and leaves the other looking closed, and it makes a sub-tab click
    // ambiguous (see `selectPaneRootedAt`).
    const openPaneId = useSelector(
      (state: RootState) => selectPaneRootedAt(state, post.id)?.id ?? null,
    );
    const isOpenRoot = openPaneId !== null;
    // An agent has proposed a change to this post, or an agent created it and it
    // has not been accepted yet (docs/plans/agent-gating.md §3.5 and §3.7). A
    // primitive, not the proposal itself: this selector runs for every row in
    // the tree on every store change, and returning an object would give each
    // one a fresh identity to diff.
    //
    // Note what this deliberately is *not*: the row said nothing about unsaved
    // state when autosave went quiet, and it still does not. A proposal or an
    // agent-created post are not the user's own typing — they arrived from
    // outside, change only on a poll, and are the one thing about this document
    // the user cannot otherwise find out.
    const agentMarker = useSelector(
      (state: RootState) => selectAgentMarker(state, post.id),
    );
    const activeTabId = useSelector(
      (state: RootState) =>
        selectPaneRootedAt(state, post.id)?.activeTabId ?? null,
    );

    const doc = post;
    const docName = doc?.name || "Untitled";
    // The first tab's label can differ from the post title; fall back to it.
    const rootTabLabel = doc?.tabLabel ?? docName;
    // "Open in a pane", not "named by the address bar": with two panes the URL
    // can only name one of them, so `ui.workspace` is the only thing that can
    // answer for both. The `/edit` check stays as a fallback for the beat
    // between a navigation landing and the deep-link seam dispatching
    // `openPane`, when no pane is rooted here yet and the row would otherwise
    // flash unselected. There is no `/view` fallback any more: after Phase 4
    // that route left the workspace group entirely, and a sidebar row must
    // never send the user to it.
    const isEditing = pathname === `/edit/${post.id}`;
    const isSelected = isOpenRoot || isEditing;
    // The post row renames the post title (`name`); the first sub-tab (same id)
    // renames `tabLabel`. Disambiguate by field so only one input shows.
    const isRenaming = rename.renamingId === post.id &&
      rename.context === "name";

    // Tab entries: the root itself is the first tab, then each child.
    //
    // These deliberately say nothing about unsaved state. Autosave is silent
    // while it is working, and the sidebar's old dirty subscription put every
    // row on the re-render path of every keystroke in the open editor — see
    // docs/plans/quiet-autosave.md.
    const tabEntries = useMemo<SubTabEntry[]>(() => {
      if (!hasTabs) return EMPTY_TAB_ENTRIES;
      const entries: SubTabEntry[] = [
        { id: post.id, name: rootTabLabel },
      ];
      for (const child of children) {
        entries.push({
          id: child.id,
          name: child?.name || "Untitled",
        });
      }
      return entries;
    }, [hasTabs, children, post.id, rootTabLabel]);

    // Select is carried by the filled pill alone — no weight bump (matches the
    // sub-tab treatment), so the resting weight holds whether selected or not.
    const nameWeight = 500;

    // Tab lists stay collapsed until the user opens them via the file icon
    // (handleToggleTabs). Opening/viewing a tabbed post does NOT auto-reveal
    // its tabs — the expand state is entirely user-driven and persisted.
    const isExpanded = expandedTabs.has(post.id);

    const handleToggleTabs = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onToggleTabs(post.id);
    }, [onToggleTabs, post.id]);

    // Modifier-only selection: Ctrl/Cmd or Shift click selects this row and
    // suppresses navigation; a plain click opens the post in the workspace.
    //
    // The open goes through `document.open` rather than being left to the href,
    // and the difference is not cosmetic: the command dispatches `openPane`
    // *before* it pushes, so the duplicate-open guard gets to decide. Opening a
    // post the other pane already holds then moves focus — whereas a bare
    // navigation to a path the address bar may already hold can be a no-op, and
    // the click would do nothing. It also states the mode instead of inheriting
    // whatever the focused pane was last left in.
    const handleRowClick = useCallback(
      (e: React.MouseEvent) => {
        if (onSelectClick?.(post.id, e)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // A modified or non-primary click is the browser's to handle — new tab,
        // new window, "copy link" — against the href above.
        if (
          e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey
        ) return;
        e.preventDefault();
        run(documentCommands.open, { id: post.id, mode: "write" });
      },
      [onSelectClick, post.id, run],
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

    // Still an anchor, so middle-click and "open in new window" work and the
    // row announces where it leads — but it leads into the workspace now.
    // Pointing it at `/view/[id]` used to be harmless, because that route
    // rendered inside the same five-column shell; Phase 4 moved it to
    // `(public)`, which boots no store and no sidebar, so the old href quietly
    // became "leave the app, discarding both panes".
    const linkProps = isRenaming ? {} : {
      component: SafeNavigationLink,
      href: `/edit/${post.id}`,
    };

    const showSubTabs = sidebarOpen && hasTabs && isExpanded;
    // Tabbed posts toggle their tab list from the file icon itself (it doubles
    // as the "stacked" indicator), so the toggle is only live when open + tabbed.
    const canToggleTabs = sidebarOpen && hasTabs;
    // When the sub-tab list is shown, the active visible content is one of the
    // sub-tabs (highlighted in SubTabList), so don't also highlight the parent.
    const highlightParent = isSelected && !showSubTabs;
    // A selected row darkens its filename to the accent indigo (light mode only,
    // applied below). Nothing competes for the filename's colour any more — the
    // amber "unsaved" tint that used to take precedence is gone.
    const showAccentText = highlightParent;

    return (
      <ListItem
        disablePadding
        sx={{
          display: "block",
          // Hover-reveal vocabulary: the marker is always on — it is what says
          // an agent touched this document, and hiding it on hover took the
          // answer away at the moment the user reached for it. ✓ ✗ appear to
          // its left instead, so the label loses width only while hovered.
          "& .agent-actions": {
            display: "none",
          },
          "&:hover .agent-actions": {
            display: "flex",
          },
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
            onContextMenu={(e) => itemActions.openContextMenu(e, post.id)}
            onDoubleClick={(e) => {
              if (sidebarOpen) {
                e.preventDefault();
                rename.start(post.id, "name");
              }
            }}
            sx={[
              {
                minHeight: inSeries ? 26 : 30,
                justifyContent: sidebarOpen ? "initial" : "center",
                overflow: "hidden",
                position: "relative",
                ...(dropIndicator && dropIndicatorSx(dropIndicator)),
                // Square-edged select band, shared with sub-tabs and series rows.
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
                // The open document keeps its fill under focus; every other row
                // trades MUI's grey `action.focus` fill for the ring.
                ...chromeFocusRingSx(".Mui-selected"),
                // Wins over both the base and `.Mui-selected` fills so a row that
                // is open *and* multi-selected still shows the selection tint.
                ...(isMultiSelected && multiSelectSx("&.Mui-selected")),
              },
              // The selected pill picks up the accent tint. Skipped for
              // multi-selected rows so their primary-tint wins.
              !isMultiSelected
                ? {
                  "&.Mui-selected": {
                    backgroundColor: "accent.tint",
                    "&:hover": { backgroundColor: "accent.tint" },
                  },
                }
                : {},
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
                    inputRef={rename.inputRef}
                    value={rename.value}
                    onChange={(e) => rename.setValue(e.target.value)}
                    onBlur={rename.handleBlur}
                    onKeyDown={rename.handleKeyDown}
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
                      sx: {
                        display: "flex",
                        minWidth: 0,
                        fontFamily: MONO_FONT,
                        fontWeight: nameWeight,
                        color: showAccentText
                          ? "accent.activeText"
                          : "text.secondary",
                      },
                    }}
                  />
                ))}
            {sidebarOpen && !isRenaming && agentMarker && (
              <>
                {/* One group takes the row's slack, so the marker still ends flush
                    with the edge whether or not the actions are showing — two
                    separate `ml: "auto"` elements would split the slack between
                    them and leave a gap. ✓ ✗ open to the marker's left; the ✗
                    cancels its own right padding, so the group adds it back to
                    keep a real gap before the glyph. */}
                <Box
                  sx={{
                    ml: "auto",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <Box
                    className="agent-actions"
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      mr: 0.75,
                    }}
                  >
                    {/* Hooks are confined to rows that actually have a marker: mounting
                        useProposalActions (which calls useConfirm + useCommandRun) on
                        every row in the tree would put those two hooks on every post,
                        series and project, when only the marked rows need them. */}
                    <RowAgentActions
                      postId={post.id}
                      marker={agentMarker}
                    />
                  </Box>
                  <AgentMarker marker={agentMarker} sx={{ mr: 0 }} />
                </Box>
              </>
            )}
          </ListItemButton>
        </Tooltip>
        {showSubTabs && (
          <SubTabList
            tabs={tabEntries}
            activeTabId={activeTabId}
            isOpenRoot={isOpenRoot}
            paneId={openPaneId}
            rootTabId={post.id}
            itemActions={itemActions}
          />
        )}
      </ListItem>
    );
  },
);

PostItem.displayName = "PostItem";
