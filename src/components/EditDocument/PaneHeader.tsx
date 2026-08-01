"use client";
import * as React from "react";
import {
  Box,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from "@mui/material";
import { ChevronsRight, FileText, Plus, X } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";
import { CHROME_RING } from "@/theme/treeRow";
import { MOTION } from "@/theme/tokens";
import { CONTENT_PAD_X } from "@/components/Layout/contentInset";
import { fitWindow, TAB_GAP, TAB_MAX_W, TAB_MIN_W } from "./tabFit";

export interface TabMeta {
  id: string;
  name: string;
}

/**
 * §17.4 — "Tab: `1.5` (6px) top only". Written as a literal because `sx` only
 * multiplies the `borderRadius` *shorthand* against `shape.borderRadius`; the
 * per-corner keys take raw CSS, so `borderTopLeftRadius: 1.5` would emit 1.5px.
 */
const TAB_RADIUS = "6px 6px 0 0";

interface PaneHeaderProps {
  tabs: TabMeta[];
  activeTabId: string | null;
  /** The pane's root document — its tab cannot be closed. */
  rootTabId: string;
  dirtyTabIds: string[];
  /** Set by the context menu's Rename; cleared through `onRenameStarted`. */
  renamingTabId: string | null;
  /** The toolbar slot. Rendered under the tabs, inside the sticky block. */
  children?: React.ReactNode;
  /** Two panes on screen: the header grows a focus accent and a close-pane ✕. */
  isSplit: boolean;
  isFocused: boolean;
  onSwitch: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onAdd: () => void;
  onRename: (tabId: string, name: string) => void;
  onRenameStarted: () => void;
  onReorder: (orderedIds: string[]) => void;
  onContextMenu: (tabId: string, isRoot: boolean, anchor: HTMLElement) => void;
  onClosePane: () => void;
}

interface TabItemProps {
  tab: TabMeta;
  isActive: boolean;
  isDirty: boolean;
  isRoot: boolean;
  /**
   * The off-screen clone the fit math measures. It renders the same box so the
   * width it reports is the width the real tab would take, and nothing else: no
   * handlers, no tab stop, not announced.
   */
  measuring?: boolean;
  isRenaming?: boolean;
  dropSide?: "left" | "right";
  innerRef?: (el: HTMLDivElement | null) => void;
  onSwitch?: (tabId: string) => void;
  onClose?: (tabId: string) => void;
  onStartRename?: (tabId: string, name: string) => void;
  onCommitRename?: (name: string) => void;
  onCancelRename?: () => void;
  onContextMenu?: (tabId: string, isRoot: boolean, anchor: HTMLElement) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onDrop?: (e: React.DragEvent) => void;
}

/**
 * The insertion line for a tab reorder — §17.3's 2px `primary.main` bar, rotated
 * onto the horizontal axis. `treeRow.dropIndicatorSx` draws the same bar for
 * vertical lists and is hard-coded to `top`/`bottom`, which is the one thing a
 * strip cannot reuse.
 */
const tabDropIndicatorSx = (side: "left" | "right") => ({
  "&::before": {
    content: '""',
    position: "absolute" as const,
    top: 4,
    bottom: 4,
    [side]: -1,
    width: 2,
    bgcolor: "primary.main",
    zIndex: 2,
  },
});

const TabItem: React.FC<TabItemProps> = ({
  tab,
  isActive,
  isDirty,
  isRoot,
  measuring,
  isRenaming,
  dropSide,
  innerRef,
  onSwitch,
  onClose,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onContextMenu,
  onKeyDown,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}) => {
  const [draft, setDraft] = React.useState(tab.name);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Re-seed on entry rather than on every render: the draft is the input's own
  // state once rename is open.
  React.useEffect(() => {
    if (isRenaming) {
      setDraft(tab.name);
      // The input mounts in this same commit; select after it exists.
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [isRenaming, tab.name]);

  return (
    <Box
      ref={innerRef}
      role={measuring ? undefined : "tab"}
      aria-hidden={measuring || undefined}
      aria-selected={measuring ? undefined : isActive}
      tabIndex={measuring ? undefined : isActive ? 0 : -1}
      draggable={!measuring && !isRenaming}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      onKeyDown={onKeyDown}
      onClick={measuring ? undefined : () => onSwitch?.(tab.id)}
      onContextMenu={measuring ? undefined : (e) => {
        e.preventDefault();
        onContextMenu?.(tab.id, isRoot, e.currentTarget);
      }}
      sx={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        flexShrink: 0,
        minWidth: TAB_MIN_W,
        maxWidth: TAB_MAX_W,
        cursor: "pointer",
        userSelect: "none",
        borderRadius: TAB_RADIUS,
        bgcolor: isActive ? "action.selected" : "transparent",
        transition: `background-color ${MOTION.fast}ms`,
        "&:hover": { bgcolor: isActive ? "action.selected" : "action.hover" },
        "&:hover .tab-close-btn": { opacity: 1 },
        "&:hover .tab-dirty-dot": { opacity: 0 },
        "&:focus-visible": CHROME_RING,
        // §17.3's active accent bar. On the tab's *bottom* edge, where it meets
        // the document: in split view the strip's top edge already carries the
        // focused-pane accent, and two primary bars stacked there read as one.
        ...(isActive && {
          "&::after": {
            content: '""',
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 2,
            bgcolor: "primary.main",
          },
        }),
        ...(dropSide && tabDropIndicatorSx(dropSide)),
      }}
    >
      <FileText
        size={ICON_SIZE.inline}
        style={{
          color: "var(--mui-palette-text-secondary)",
          flexShrink: 0,
        }}
      />
      {isRenaming
        ? (
          <Box
            component="input"
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => onCommitRename?.(draft)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") onCommitRename?.(draft);
              if (e.key === "Escape") onCancelRename?.();
            }}
            sx={{
              flex: 1,
              minWidth: 0,
              border: "none",
              outline: "1px solid",
              outlineColor: "primary.main",
              borderRadius: 1.5,
              bgcolor: "background.paper",
              color: "text.primary",
              typography: "dense",
              fontFamily: "inherit",
              px: 0.5,
              py: 0,
            }}
          />
        )
        : (
          <Typography
            noWrap
            onDoubleClick={(e) => {
              e.stopPropagation();
              onStartRename?.(tab.id, tab.name);
            }}
            sx={{
              typography: "dense",
              fontWeight: isActive ? 600 : 400,
              color: isActive ? "text.primary" : "text.secondary",
              flex: 1,
              minWidth: 0,
            }}
          >
            {tab.name}
          </Typography>
        )}
      {
        /* One 16px slot, shared: the dirty dot rests in it and the close button
          takes it over on hover, so a tab never changes width mid-interaction. */
      }
      <Box
        sx={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          flexShrink: 0,
        }}
      >
        {isDirty && (
          <Box
            className="tab-dirty-dot"
            sx={{
              position: "absolute",
              width: 5,
              height: 5,
              borderRadius: "50%",
              bgcolor: "warning.main",
              transition: `opacity ${MOTION.fast}ms`,
            }}
          />
        )}
        {!isRoot && !measuring && (
          <IconButton
            className="tab-close-btn"
            size="small"
            aria-label={`Close ${tab.name}`}
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onClose?.(tab.id);
            }}
            sx={{
              position: "absolute",
              opacity: isActive && !isDirty ? 0.7 : 0,
              p: 0.125,
              transition: `opacity ${MOTION.fast}ms`,
              color: isActive ? "primary.main" : "text.secondary",
              "&:hover": { color: "error.main", opacity: 1 },
            }}
          >
            <X size={ICON_SIZE.micro} />
          </IconButton>
        )}
      </Box>
    </Box>
  );
};

/**
 * Everything pinned above a pane's document: its tabs, its own controls, and —
 * as `children` — the slot its editors portal their formatting toolbar into.
 *
 * The tabs used to be published into the app-wide top bar through a context,
 * which meant one strip for the whole window and only the focused pane's tabs
 * in it; the toolbar was a second such singleton, one row lower. Both are the
 * pane's now, which is what makes the two panes of a split independently
 * editable, and it settles their order: **tabs, then toolbar**. A document is
 * chosen before it is formatted.
 *
 * The pane title and close button `WorkspacePanes` drew in a header row of its
 * own are folded in here too.
 *
 * `position: sticky` is what keeps the block pinned once it is no longer window
 * chrome — one sticky container for both rows rather than two, so the toolbar
 * needs no hard-coded offset for the strip's height. Unsplit, the page's padded
 * container is the scroller and the header cancels its gutters to sit flush
 * with the pane; split, each pane scrolls itself and the same rule holds
 * against `PaneFrame`'s box.
 */
const PaneHeader: React.FC<PaneHeaderProps> = ({
  tabs,
  activeTabId,
  rootTabId,
  dirtyTabIds,
  renamingTabId,
  children,
  isSplit,
  isFocused,
  onSwitch,
  onClose,
  onAdd,
  onRename,
  onRenameStarted,
  onReorder,
  onContextMenu,
  onClosePane,
}) => {
  const rowRef = React.useRef<HTMLDivElement>(null);
  const measureRefs = React.useRef(new Map<string, HTMLDivElement>());
  const [range, setRange] = React.useState({ start: 0, end: tabs.length });
  const [overflowAnchor, setOverflowAnchor] = React.useState<
    HTMLElement | null
  >(null);

  // Inline rename, opened by double-click or by the context menu's Rename.
  const [editingTabId, setEditingTabId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!renamingTabId) return;
    setEditingTabId(renamingTabId);
    onRenameStarted();
  }, [renamingTabId, onRenameStarted]);

  const activeIndex = tabs.findIndex((t) => t.id === activeTabId);

  // Remeasure whenever the row resizes or the labels change. Widths are read
  // off the hidden clone row, which renders *every* tab regardless of what is
  // visible — so the measurement cannot depend on its own result, which is the
  // loop this would otherwise be.
  const remeasure = React.useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const widths = tabs.map((t) =>
      measureRefs.current.get(t.id)?.offsetWidth ?? TAB_MIN_W
    );
    const next = fitWindow(widths, row.clientWidth, activeIndex);
    setRange((prev) =>
      prev.start === next.start && prev.end === next.end ? prev : next
    );
  }, [tabs, activeIndex]);

  React.useLayoutEffect(() => {
    remeasure();
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(remeasure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [remeasure]);

  const visible = tabs.slice(range.start, range.end);
  const hidden = React.useMemo(
    () => [...tabs.slice(0, range.start), ...tabs.slice(range.end)],
    [tabs, range.start, range.end],
  );

  // ---- Reorder (native DnD) ----

  const [dragId, setDragId] = React.useState<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<
    { id: string; side: "left" | "right" } | null
  >(null);

  const handleDragOver = React.useCallback(
    (tabId: string) => (e: React.DragEvent) => {
      if (!dragId || dragId === tabId) return;
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const side = e.clientX < rect.left + rect.width / 2 ? "left" : "right";
      setDropTarget((prev) =>
        prev?.id === tabId && prev.side === side ? prev : { id: tabId, side }
      );
    },
    [dragId],
  );

  const handleDrop = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const target = dropTarget;
    const moved = dragId;
    setDropTarget(null);
    setDragId(null);
    if (!moved || !target || moved === target.id) return;

    const rest = tabs.map((t) => t.id).filter((id) => id !== moved);
    const at = rest.indexOf(target.id) + (target.side === "right" ? 1 : 0);
    onReorder([...rest.slice(0, at), moved, ...rest.slice(at)]);
  }, [dragId, dropTarget, tabs, onReorder]);

  // ---- Keyboard ----

  const handleKeyDown = React.useCallback(
    (index: number) => (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSwitch(tabs[index].id);
        return;
      }
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const next = tabs[index + step];
      // Switching moves the window if the neighbour is past the fold, and the
      // strip re-renders with it in view — so focus follows on the next frame.
      if (next) {
        onSwitch(next.id);
        requestAnimationFrame(() => {
          rowRef.current
            ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
            ?.focus();
        });
      }
    },
    [tabs, onSwitch],
  );

  const commitRename = React.useCallback((tabId: string, name: string) => {
    setEditingTabId(null);
    const trimmed = name.trim();
    const tab = tabs.find((t) => t.id === tabId);
    if (trimmed && tab && trimmed !== tab.name) onRename(tabId, trimmed);
  }, [tabs, onRename]);

  return (
    <Box
      sx={{
        position: "sticky",
        top: 0,
        // Above the document, below the editor's floating toolbars.
        zIndex: 3,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        bgcolor: "background.default",
        // Cancel the scroller's gutters so the header spans the pane it belongs
        // to. Split panes scroll inside `PaneFrame`'s `px: 1` box; unsplit, the
        // page's asymmetric content gutters (`CONTENT_PAD_X`) are the ones to
        // undo.
        ...(isSplit ? { mx: -1 } : {
          ml: {
            xs: -CONTENT_PAD_X.xs.left,
            sm: -CONTENT_PAD_X.sm.left,
            md: -CONTENT_PAD_X.md.left,
          },
          mr: {
            xs: -CONTENT_PAD_X.xs.right,
            sm: -CONTENT_PAD_X.sm.right,
            md: -CONTENT_PAD_X.md.right,
          },
        }),
        // DESIGN.md §17.3 — the focused-pane accent, on the top edge. Only with
        // a second pane to distinguish it from.
        ...(isSplit && {
          "&::before": {
            content: '""',
            position: "absolute",
            insetInline: 0,
            top: 0,
            height: 2,
            bgcolor: isFocused ? "primary.main" : "transparent",
            transition: `background-color ${MOTION.fast}ms`,
            zIndex: 1,
          },
        }),
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: `${TAB_GAP}px`,
          minHeight: 34,
          px: 0.5,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box
          ref={rowRef}
          role="tablist"
          aria-label="Sub-documents"
          aria-orientation="horizontal"
          sx={{
            position: "relative",
            display: "flex",
            alignItems: "stretch",
            gap: `${TAB_GAP}px`,
            flex: 1,
            minWidth: 0,
            minHeight: 30,
            overflow: "hidden",
          }}
        >
          {
            /* Measurement clone. Every tab, always, off-flow: the visible window is
            computed from these widths, so it must not be computed from them. */
          }
          <Box
            aria-hidden
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              display: "flex",
              visibility: "hidden",
              pointerEvents: "none",
            }}
          >
            {tabs.map((tab) => (
              <TabItem
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                isDirty={dirtyTabIds.includes(tab.id)}
                isRoot={tab.id === rootTabId}
                measuring
                innerRef={(el) => {
                  if (el) measureRefs.current.set(tab.id, el);
                  else measureRefs.current.delete(tab.id);
                }}
              />
            ))}
          </Box>

          {visible.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              isDirty={dirtyTabIds.includes(tab.id)}
              isRoot={tab.id === rootTabId}
              isRenaming={editingTabId === tab.id}
              dropSide={dropTarget?.id === tab.id ? dropTarget.side : undefined}
              onSwitch={onSwitch}
              onClose={onClose}
              onStartRename={(id) => setEditingTabId(id)}
              onCommitRename={(name) => commitRename(tab.id, name)}
              onCancelRename={() => setEditingTabId(null)}
              onContextMenu={onContextMenu}
              onKeyDown={handleKeyDown(tabs.indexOf(tab))}
              onDragStart={() => setDragId(tab.id)}
              onDragOver={handleDragOver(tab.id)}
              onDragEnd={() => {
                setDragId(null);
                setDropTarget(null);
              }}
              onDrop={handleDrop}
            />
          ))}
        </Box>

        {hidden.length > 0 && (
          <Tooltip title={`${hidden.length} more`}>
            <Box
              role="button"
              tabIndex={0}
              aria-label={`Show ${hidden.length} more tabs`}
              aria-haspopup="menu"
              onClick={(e) => setOverflowAnchor(e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOverflowAnchor(e.currentTarget);
                }
              }}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.25,
                px: 0.5,
                py: 0.25,
                flexShrink: 0,
                cursor: "pointer",
                borderRadius: 1.5,
                color: "text.secondary",
                transition: `background-color ${MOTION.fast}ms`,
                "&:hover": { bgcolor: "action.hover", color: "text.primary" },
                "&:focus-visible": CHROME_RING,
              }}
            >
              <ChevronsRight size={ICON_SIZE.inline} />
              <Typography variant="micro">{hidden.length}</Typography>
            </Box>
          </Tooltip>
        )}

        <Menu
          anchorEl={overflowAnchor}
          open={!!overflowAnchor}
          onClose={() => setOverflowAnchor(null)}
        >
          {hidden.map((tab) => (
            <MenuItem
              key={tab.id}
              onClick={() => {
                setOverflowAnchor(null);
                onSwitch(tab.id);
              }}
            >
              <ListItemIcon>
                <FileText size={ICON_SIZE.dense} />
              </ListItemIcon>
              <ListItemText>{tab.name}</ListItemText>
              {dirtyTabIds.includes(tab.id) && (
                <Box
                  sx={{
                    width: 5,
                    height: 5,
                    ml: 1,
                    borderRadius: "50%",
                    bgcolor: "warning.main",
                    flexShrink: 0,
                  }}
                />
              )}
            </MenuItem>
          ))}
        </Menu>

        <Tooltip title="New sub-doc">
          <IconButton
            size="small"
            onClick={onAdd}
            aria-label="New sub-doc"
            sx={{
              flexShrink: 0,
              color: "text.secondary",
              p: 0.5,
              "&:hover": { color: "primary.main" },
            }}
          >
            <Plus size={ICON_SIZE.dense} />
          </IconButton>
        </Tooltip>

        {isSplit && (
          <Tooltip title="Close pane">
            <IconButton
              size="small"
              onClick={onClosePane}
              aria-label="Close pane"
              sx={{
                flexShrink: 0,
                color: "text.secondary",
                p: 0.5,
                "&:hover": { color: "text.primary" },
              }}
            >
              <X size={ICON_SIZE.dense} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {
        /* The pane's formatting toolbar portals in here — below the tabs, and
          inside the same sticky block so it pins with them. Empty in read mode,
          which is why the row above owns the divider. */
      }
      {children}
    </Box>
  );
};

export default PaneHeader;
