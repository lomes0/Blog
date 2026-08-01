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
import { fitWindow, TAB_GAP, TAB_MAX_W, TAB_MIN_W } from "./tabFit";

export interface TabMeta {
  id: string;
  name: string;
}

/**
 * A tab, not a chip.
 *
 * The fully-rounded filled pill this replaced read as a *value* — something
 * assigned and dismissible — rather than as a switcher between parts of one
 * document. Square corners and a hairline between neighbours are what make a
 * row of labels read as tabs.
 *
 * §17.4's `1.5` top-only radius is the *chrome* tab's, and these are not chrome
 * — they sit under the document title, inside the content column, which §17.6
 * exempts. Square is a local call for that position.
 *
 * Every label in the run carries the **same ink** — active and inactive alike.
 * The active tab is marked by an underline rule drawn in that same ink, plus
 * 600 weight. Nothing here changes hue: this row sits inches under an `h4`
 * title and over the body, where a `primary.main` accent is the loudest thing
 * on the page and competes with the content it is labelling. Rule-and-weight
 * are both non-color cues, so the mark does not rest on hue at all.
 */
const TAB_RADIUS = 0;

/**
 * How far every tab label is faded toward the surface behind it.
 *
 * Measured, not picked: it takes `text.secondary` from 7.6:1 to **5.1:1** on
 * white, and on the tightest dark surface (`background.paper`) from 5.8:1 to
 * **4.7:1** — a visible step down from body text that still clears WCAG AA
 * (4.5:1) in both schemes, which a label you are expected to read and click
 * has to.
 *
 * It is also the last value that does: at 0.8 that dark surface drops to
 * 4.3:1 while light is still passing at 4.5:1, so dimming further has to come
 * with a palette change, not another decimal here. Hover returns the label to
 * full, which is what makes the resting dim read as a state and not a defect —
 * and since the dim no longer distinguishes active from inactive, hover is free
 * to lift any tab without erasing the active mark.
 */
const LABEL_DIM = 0.85;

/**
 * The active tab's mark: a rule under the whole tab box, in the labels' own ink.
 *
 * Full-width rather than label-width — it underlines the *tab*, including the
 * trailing dirty/close slot, which is what makes it read as the tab owning the
 * content below rather than as an underlined word. Drawn at full opacity
 * against the labels' `LABEL_DIM`, so it is a step up in presence without being
 * a step sideways in hue.
 *
 * A child element, not a pseudo-element: `::after` is the separator and
 * `::before` the drop indicator, and an active tab can be showing either.
 */
const ACTIVE_RULE_H = "1px";

/**
 * The hairline between two adjacent tabs, centred in `TAB_GAP` so it belongs to
 * the channel rather than to either tab. Inset top and bottom: a rule the full
 * height of the row would box each label in, which is the chip read again.
 */
const separatorSx = {
  "&::after": {
    content: '""',
    position: "absolute" as const,
    top: 4,
    bottom: 4,
    right: `-${TAB_GAP / 2 + 0.5}px`,
    width: "1px",
    bgcolor: "divider",
  },
};

interface DocumentTabsProps {
  tabs: TabMeta[];
  activeTabId: string | null;
  /** The pane's root document — its tab cannot be closed. */
  rootTabId: string;
  dirtyTabIds: string[];
  /** Set by the context menu's Rename; cleared through `onRenameStarted`. */
  renamingTabId: string | null;
  onSwitch: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onAdd: () => void;
  onRename: (tabId: string, name: string) => void;
  onRenameStarted: () => void;
  onReorder: (orderedIds: string[]) => void;
  onContextMenu: (tabId: string, isRoot: boolean, anchor: HTMLElement) => void;
}

interface DocumentTabProps {
  tab: TabMeta;
  isActive: boolean;
  isDirty: boolean;
  isRoot: boolean;
  /**
   * The off-screen clone the fit math measures. It renders the same box so the
   * width it reports is the width the real tab would take, and nothing else:
   * no handlers, no tab stop, not announced.
   */
  measuring?: boolean;
  isRenaming?: boolean;
  /** False on the last tab in the visible run — nothing follows it to divide. */
  showSeparator?: boolean;
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
 * The insertion line for a reorder — §17.3's 2px `primary.main` bar, rotated
 * onto the horizontal axis. `treeRow.dropIndicatorSx` draws the same bar for
 * vertical lists and is hard-coded to `top`/`bottom`, which is the one thing a
 * row of tabs cannot reuse.
 *
 * Centred in the same channel as the separator, and 2px over the separator's
 * 1px, so it lands *on* the crease it is offering to split rather than beside
 * it. `zIndex` keeps it over the rule it covers.
 */
const dropIndicatorSx = (side: "left" | "right") => ({
  "&::before": {
    content: '""',
    position: "absolute" as const,
    top: 2,
    bottom: 2,
    [side]: `-${TAB_GAP / 2 + 1}px`,
    width: 2,
    bgcolor: "primary.main",
    zIndex: 2,
  },
});

const DocumentTab: React.FC<DocumentTabProps> = ({
  tab,
  isActive,
  isDirty,
  isRoot,
  measuring,
  isRenaming,
  showSeparator,
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
        pl: 1.25,
        // Room for the trailing slot, which the tab reserves whether or not
        // anything is in it — a close button that appears on hover must not
        // reflow the row it appears in.
        pr: 0.75,
        py: 0.375,
        flexShrink: 0,
        maxWidth: TAB_MAX_W,
        cursor: "pointer",
        userSelect: "none",
        borderRadius: TAB_RADIUS,
        transition: `background-color ${MOTION.fast}ms`,
        "&:hover": { bgcolor: "action.hover" },
        "&:hover .tab-label": { opacity: 1 },
        "&:hover .tab-close-btn": { opacity: 1 },
        "&:hover .tab-dirty-dot": { opacity: 0 },
        "&:focus-visible": CHROME_RING,
        ...(showSeparator && separatorSx),
        ...(dropSide && dropIndicatorSx(dropSide)),
      }}
    >
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
              borderRadius: 0.5,
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
            className="tab-label"
            onDoubleClick={(e) => {
              e.stopPropagation();
              onStartRename?.(tab.id, tab.name);
            }}
            sx={{
              typography: "dense",
              fontWeight: isActive ? 600 : 400,
              // One ink for the whole run. Opacity rather than `text.disabled`,
              // which is a claim the tab is not clickable and lands at 2.5:1 —
              // below AA for a label you are meant to read and hit. Fading
              // toward the surface also dims correctly in both schemes without
              // a second hex (§19).
              color: "text.secondary",
              opacity: LABEL_DIM,
              transition: `opacity ${MOTION.fast}ms`,
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
              // Hover-only, including on the active tab: the row reads as a
              // set of labels at rest, and a delete affordance parked on one of
              // them permanently is the opposite of that. Right-click → Delete
              // is the keyboard-reachable path (§9).
              opacity: 0,
              p: 0.125,
              transition: `opacity ${MOTION.fast}ms`,
              color: "text.secondary",
              "&:hover": { color: "error.main", opacity: 1 },
            }}
          >
            <X size={ICON_SIZE.micro} />
          </IconButton>
        )}
      </Box>
      {isActive && (
        <Box
          sx={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: ACTIVE_RULE_H,
            bgcolor: "text.secondary",
            // Stops at the tab's own edge — it does not reach into `TAB_GAP`,
            // so the run still reads as separate tabs with one underlined
            // rather than as a single rule with a break in it.
            pointerEvents: "none",
          }}
        />
      )}
    </Box>
  );
};

/**
 * The sub-document switcher, in the document rather than above it.
 *
 * It has been several places, and the shape follows the position. As window
 * chrome in the top bar it was a fixed-width file tab; as pane chrome it was the
 * same tab with an accent bar. Here — under the non-editable title, over the
 * content — it is still a tab, sized to its label: it is no longer telling you
 * what the *window* has open, but which part of *this post* you are reading, and
 * that is a switch between siblings, which is what tabs are for. The pill it
 * briefly was said "dismissible value" instead, which is what chips are for.
 *
 * What survives every move is the behaviour: tabs size to their labels, overflow
 * into a "»N" menu rather than a scrollbar (`tabFit.ts`), reorder by drag, and
 * rename in place.
 */
const DocumentTabs: React.FC<DocumentTabsProps> = ({
  tabs,
  activeTabId,
  rootTabId,
  dirtyTabIds,
  renamingTabId,
  onSwitch,
  onClose,
  onAdd,
  onRename,
  onRenameStarted,
  onReorder,
  onContextMenu,
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
      // row re-renders with it in view — so focus follows on the next frame.
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
      ref={rowRef}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: `${TAB_GAP}px`,
        minWidth: 0,
        // The whole strip is the hover target, not the button — a control you
        // must already be pointing at to see is one you cannot find.
        "&:hover .tab-add-btn": { opacity: 1 },
        // DESIGN.md §9: a hover-revealed control must stay reachable. Tabbing
        // to the button reveals it, so it is never focused while invisible.
        "&:focus-within .tab-add-btn": { opacity: 1 },
        // No hover to give: on touch the button would otherwise be permanently
        // invisible and permanently tappable, which is the worst of both.
        "@media (hover: none)": { "& .tab-add-btn": { opacity: 1 } },
      }}
    >
      <Box
        role="tablist"
        aria-label="Sub-documents"
        aria-orientation="horizontal"
        sx={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: `${TAB_GAP}px`,
          // Content-sized, so the trailing controls follow the last tab instead
          // of being pushed to the end of the line. It must NOT be the measured
          // element: `fitWindow` reads the width available to the run, and a box
          // that shrinks to the tabs it was just told to show would report its
          // own answer back as the question — each pass dropping one more tab.
          flex: "0 1 auto",
          minWidth: 0,
          // Shrinks before the controls do (they are `flexShrink: 0`), so an
          // undersized row clips a tab rather than the "+".
          overflow: "hidden",
        }}
      >
        {
          /* Measurement clone. Every tab, always, off-flow: the visible window
            is computed from these widths, so it must not be computed from
            them. */
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
            <DocumentTab
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

        {visible.map((tab, i) => (
          <DocumentTab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            isDirty={dirtyTabIds.includes(tab.id)}
            isRoot={tab.id === rootTabId}
            isRenaming={editingTabId === tab.id}
            showSeparator={i < visible.length - 1}
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
            aria-label={`Show ${hidden.length} more sub-documents`}
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
              px: 0.75,
              py: 0.375,
              flexShrink: 0,
              cursor: "pointer",
              // A control, not a tab — a small radius keeps it from reading as
              // one more (permanently inactive) tab at the end of the run.
              borderRadius: 0.5,
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

      {
        /* Last, and hard against the run rather than at the end of the line:
          "add one more" belongs at the end of the thing it adds to, and the
          overflow chip is part of that thing — it is the tabs that did not
          fit. `ADD_BTN_W` is what keeps it from being the item that overflows.

          Hover-revealed, and it keeps its slot while hidden: `opacity` rather
          than `display`, so the tabs do not shift sideways the moment the
          pointer enters the strip. That also means `ADD_BTN_W` is still owed —
          the space is reserved whether or not anything is drawn in it. */
      }
      <Tooltip title="New sub-doc">
        <IconButton
          className="tab-add-btn"
          size="small"
          onClick={onAdd}
          aria-label="New sub-doc"
          sx={{
            flexShrink: 0,
            color: "text.disabled",
            p: 0.375,
            opacity: 0,
            transition: `opacity ${MOTION.fast}ms`,
            "&:hover": { color: "primary.main" },
          }}
        >
          <Plus size={ICON_SIZE.inline} />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export default DocumentTabs;
