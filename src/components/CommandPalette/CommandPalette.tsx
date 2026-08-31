"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, InputBase, Modal, Typography } from "@mui/material";
import {
  Eye,
  FilePlus,
  FileText,
  Moon,
  PanelLeft,
  Pencil,
  Search,
  Sparkles,
  Sun,
} from "lucide-react";
import { type RootState, useSelector } from "@/store";
import { selectAllPosts } from "@/store/selectors/postsSelectors";
import { ICON_SIZE } from "@/theme/icons";
import { useCommandContext, useCommandRun } from "@/commands/CommandProvider";
import { documentCommands, uiCommands } from "@/commands";

/**
 * Custom window event other entry points (title-bar search, activity rail,
 * status bar) can dispatch to open the palette without wiring through Redux.
 */
const OPEN_COMMAND_PALETTE_EVENT = "open-command-palette";

export const openCommandPalette = () => {
  window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT));
};

type PaletteItem = {
  id: string;
  label: string;
  /** Right-aligned hint / shortcut (commands) or mono path (posts). */
  hint?: string;
  mono?: boolean;
  icon: React.ReactNode;
  run: () => void;
};

const CommandPalette = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Every entry here runs a registered command; the palette only supplies the
  // copy and the icon. `context` is read (never written) for the labels that
  // depend on current state — which document is open, and in which mode.
  const run = useCommandRun();
  const context = useCommandContext();

  const posts = useSelector(selectAllPosts);
  const series = useSelector((state: RootState) => state.series);

  const currentDocId = context.focusedDocumentId;
  const copilotOpen = context.copilot.open;

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  /**
   * How far right of the viewport's center the palette has to sit.
   *
   * The Modal portals to <body> and centers on the whole viewport, but the app's
   * left chrome (activity rail + sidebar) and right chrome (Copilot panel +
   * right rail) are asymmetric, so viewport-center is not where the page's own
   * content sits. The palette has to land on the same vertical axis as the home
   * composer — the thing directly beneath it.
   *
   * Measured off the live content container rather than re-derived from the
   * layout constants. The column's own width is only half the answer: the
   * container also carries asymmetric padding (`pl` 96 / `pr` 64 at `md`) and
   * may own a scrollbar, and a formula built from rail widths silently misses
   * both. `clientWidth` excludes the scrollbar and `clientLeft` the border, so
   * what this measures is exactly the box a centered child is centered in.
   */
  const measureOffset = useCallback(() => {
    const el = document.getElementById("editor-main-container");
    if (!el) return setOffsetX(0);
    const style = getComputedStyle(el);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padRight = parseFloat(style.paddingRight) || 0;
    const contentLeft = el.getBoundingClientRect().left + el.clientLeft +
      padLeft;
    const contentWidth = el.clientWidth - padLeft - padRight;
    // The Modal root is `position: fixed`, so its viewport is the initial
    // containing block — `clientWidth`, not `innerWidth` (which counts a
    // classic scrollbar the fixed layer does not get).
    const viewportWidth = document.documentElement.clientWidth;
    setOffsetX(contentLeft + contentWidth / 2 - viewportWidth / 2);
  }, []);

  // Global ⌘K / Ctrl+K toggle + external open event. Both measure before
  // opening, so the dialog is placed on its first paint and never visibly jumps.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        // Defer to the Lexical editor when focus is inside it — ⌘K is its
        // "insert link" shortcut. The title-bar search pill (openCommandPalette)
        // remains an always-available, mouse-driven entry point.
        const el = document.activeElement as HTMLElement | null;
        if (el?.isContentEditable) return;
        e.preventDefault();
        measureOffset();
        setOpen((prev) => !prev);
      }
    };
    const onOpen = () => {
      measureOffset();
      setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    };
  }, [measureOffset]);

  // The chrome can move under an open palette: a window resize, but also the
  // sidebar or a rail animating to a new width — including from the palette's
  // own "Toggle sidebar" / "Show AI assistant" commands, which run before it
  // closes. Observing the container covers all of them, per frame, where a
  // `resize` listener would only catch the first.
  useEffect(() => {
    const el = open && document.getElementById("editor-main-container");
    if (!el) return;
    const observer = new ResizeObserver(measureOffset);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, measureOffset]);

  // Map each post id → owning series title, so results can show a mono path.
  const seriesByPostId = useMemo(() => {
    const map = new Map<string, string>();
    series.forEach((s) => {
      s.posts?.forEach((p) => map.set(p.id, s.title));
    });
    return map;
  }, [series]);

  const effectiveMode = context.theme.resolved;
  const focusedMode = context.focusedDocumentMode;

  const commands: PaletteItem[] = useMemo(() => {
    const items: PaletteItem[] = [
      {
        id: "cmd:theme",
        label: `Switch to ${effectiveMode === "dark" ? "light" : "dark"} theme`,
        hint: "Theme",
        icon: effectiveMode === "dark"
          ? <Sun size={ICON_SIZE.dense} />
          : <Moon size={ICON_SIZE.dense} />,
        run: () =>
          run(uiCommands.setTheme, {
            mode: effectiveMode === "dark" ? "light" : "dark",
          }),
      },
      {
        id: "cmd:sidebar",
        label: "Toggle sidebar",
        hint: "⌘B",
        icon: <PanelLeft size={ICON_SIZE.dense} />,
        run: () => run(uiCommands.toggleSidebar),
      },
      {
        id: "cmd:ai",
        label: copilotOpen ? "Hide AI assistant" : "Show AI assistant",
        hint: "AI",
        icon: <Sparkles size={ICON_SIZE.dense} />,
        run: () => run(uiCommands.toggleCopilot),
      },
      {
        id: "cmd:new",
        label: "New post",
        hint: "Create",
        icon: <FilePlus size={ICON_SIZE.dense} />,
        run: () => run(documentCommands.create),
      },
    ];

    // Read/Edit mode switch only makes sense when a document is open.
    if (currentDocId) {
      const toRead = focusedMode === "write";
      items.splice(3, 0, {
        id: "cmd:mode",
        label: toRead ? "Switch to Read mode" : "Switch to Edit mode",
        hint: "⌘E",
        icon: toRead
          ? <Eye size={ICON_SIZE.dense} />
          : <Pencil size={ICON_SIZE.dense} />,
        run: () => run(uiCommands.setMode, { mode: toRead ? "read" : "write" }),
      });
    }

    return items;
  }, [effectiveMode, copilotOpen, currentDocId, focusedMode, run]);

  const postItems: PaletteItem[] = useMemo(
    () =>
      posts.map((post) => {
        const doc = post;
        const name = doc?.title || "Untitled";
        const folder = seriesByPostId.get(post.id) ?? "posts";
        return {
          id: `post:${post.id}`,
          label: name,
          hint: `${folder}/${name}.md`,
          mono: true,
          icon: <FileText size={ICON_SIZE.dense} />,
          run: () => run(documentCommands.open, { id: post.id }),
        };
      }),
    [posts, seriesByPostId, run],
  );

  // Filter: commands by label, posts by title; empty query shows commands + a
  // handful of recent posts (mirrors the design's default palette contents).
  const results: PaletteItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...commands, ...postItems.slice(0, 5)];
    const matches = (item: PaletteItem) => item.label.toLowerCase().includes(q);
    return [...commands.filter(matches), ...postItems.filter(matches)];
  }, [query, commands, postItems]);

  // Keep the highlighted row valid as the result set shrinks/grows.
  useEffect(() => {
    setActiveIndex((prev) => (prev >= results.length ? 0 : prev));
  }, [results.length]);

  const runItem = useCallback(
    (item: PaletteItem | undefined) => {
      if (!item) return;
      item.run();
      close();
    },
    [close],
  );

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runItem(results[activeIndex]);
    }
  };

  // Scroll the active row into view during keyboard navigation.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <Modal
      open={open}
      onClose={close}
      aria-label="Command palette"
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor:
              "rgba(var(--mui-palette-common-blackChannel) / 0.5)",
            backdropFilter: "blur(2px)",
          },
        },
      }}
      sx={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        pt: "90px",
      }}
    >
      <Box
        role="dialog"
        aria-modal="true"
        onKeyDown={onListKeyDown}
        sx={{
          width: "min(560px, calc(100vw - 32px))",
          maxHeight: "60vh",
          // Sit on the same axis as the page's content — see `measureOffset`.
          transform: `translateX(${offsetX}px)`,
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.paper",
          border: 1,
          borderColor: "divider",
          borderRadius: 3,
          boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
          overflow: "hidden",
          outline: "none",
        }}
      >
        {/* Search input */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: 2,
            py: 1.5,
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Box sx={{ display: "flex", color: "text.secondary" }}>
            <Search size={ICON_SIZE.default} />
          </Box>
          <InputBase
            inputRef={inputRef}
            autoFocus
            fullWidth
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Search posts or run a command…"
            sx={{ typography: "body1", color: "text.primary" }}
          />
          <Box
            component="kbd"
            sx={{
              typography: "micro",
              px: 0.75,
              py: 0.25,
              borderRadius: 1.5,
              border: 1,
              borderColor: "divider",
              color: "text.secondary",
              bgcolor: "background.input",
            }}
          >
            esc
          </Box>
        </Box>

        {/* Results */}
        <Box
          ref={listRef}
          role="listbox"
          sx={{ overflowY: "auto", py: 0.5, minHeight: 0 }}
        >
          {results.length === 0
            ? (
              <Typography
                variant="dense"
                component="p"
                sx={{ color: "text.secondary", textAlign: "center", py: 4 }}
              >
                No matching commands or posts.
              </Typography>
            )
            : (
              results.map((item, index) => {
                const selected = index === activeIndex;
                return (
                  <Box
                    key={item.id}
                    data-index={index}
                    role="option"
                    aria-selected={selected}
                    onClick={() => runItem(item)}
                    onMouseMove={() => setActiveIndex(index)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      mx: 0.5,
                      px: 1.5,
                      py: 1,
                      borderRadius: 2,
                      cursor: "pointer",
                      color: "text.primary",
                      bgcolor: selected
                        ? "rgba(var(--mui-palette-primary-mainChannel) / 0.14)"
                        : "transparent",
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        color: selected ? "primary.main" : "text.secondary",
                      }}
                    >
                      {item.icon}
                    </Box>
                    <Typography
                      variant="body2"
                      component="span"
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.label}
                    </Typography>
                    {item.hint && (
                      <Typography
                        variant="micro"
                        component="span"
                        sx={{
                          color: "text.secondary",
                          fontFamily: item.mono ? "monospace" : undefined,
                          flexShrink: 0,
                        }}
                      >
                        {item.hint}
                      </Typography>
                    )}
                  </Box>
                );
              })
            )}
        </Box>
      </Box>
    </Modal>
  );
};

export default CommandPalette;
