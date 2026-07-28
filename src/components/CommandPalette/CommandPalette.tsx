"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Box, InputBase, Modal, Typography } from "@mui/material";
import { useColorScheme } from "@mui/material/styles";
import { usePathname, useRouter } from "next/navigation";
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
import { actions, type RootState, useDispatch, useSelector } from "@/store";
import { selectAllPosts } from "@/store/selectors/postsSelectors";
import { ICON_SIZE } from "@/theme/icons";
import { useSidebarWidth } from "@/contexts/SidebarWidthContext";
import { RAIL_COMPACT_W, useLayoutMode } from "@/contexts/LayoutModeContext";
import { ACTIVITY_RAIL_W } from "@/components/Layout/SideBar/constants";

/**
 * Custom window event other entry points (title-bar search, activity rail,
 * status bar) can dispatch to open the palette without wiring through Redux.
 */
export const OPEN_COMMAND_PALETTE_EVENT = "open-command-palette";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const dispatch = useDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const { mode, systemMode, setMode } = useColorScheme();

  const posts = useSelector(selectAllPosts);
  const series = useSelector((state: RootState) => state.series);
  const copilotOpen = useSelector((state: RootState) => state.ui.copilot.open);

  // Layout column widths (same source the grid in AppLayoutContent uses), so the
  // palette can center over the main content column instead of the viewport.
  const { getEffectiveWidth } = useSidebarWidth();
  const { railMode, railWidth, copilotWidth } = useLayoutMode();

  // Current document id from the URL (edit/view routes), used by the mode switch.
  const segments = pathname.split("/").filter(Boolean);
  const routeMode = segments[0];
  const currentDocId =
    routeMode === "edit" || routeMode === "view" ? segments[1] ?? null : null;

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  // Global ⌘K / Ctrl+K toggle + external open event.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        // Defer to the Lexical editor when focus is inside it — ⌘K is its
        // "insert link" shortcut. The title-bar search pill (openCommandPalette)
        // remains an always-available, mouse-driven entry point.
        const el = document.activeElement as HTMLElement | null;
        if (el?.isContentEditable) return;
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    };
  }, []);

  // Map each post id → owning series title, so results can show a mono path.
  const seriesByPostId = useMemo(() => {
    const map = new Map<string, string>();
    series.forEach((s) => {
      s.posts?.forEach((p) => map.set(p.id, s.title));
    });
    return map;
  }, [series]);

  const effectiveMode = mode === "system" ? systemMode : mode;

  const commands: PaletteItem[] = useMemo(() => {
    const items: PaletteItem[] = [
      {
        id: "cmd:theme",
        label: `Switch to ${effectiveMode === "dark" ? "light" : "dark"} theme`,
        hint: "Theme",
        icon: effectiveMode === "dark"
          ? <Sun size={ICON_SIZE.dense} />
          : <Moon size={ICON_SIZE.dense} />,
        run: () => setMode(effectiveMode === "dark" ? "light" : "dark"),
      },
      {
        id: "cmd:sidebar",
        label: "Toggle sidebar",
        hint: "⌘B",
        icon: <PanelLeft size={ICON_SIZE.dense} />,
        run: () => dispatch(actions.toggleDrawer()),
      },
      {
        id: "cmd:ai",
        label: copilotOpen ? "Hide AI assistant" : "Show AI assistant",
        hint: "AI",
        icon: <Sparkles size={ICON_SIZE.dense} />,
        run: () => dispatch(actions.setCopilotOpen(!copilotOpen)),
      },
      {
        id: "cmd:new",
        label: "New post",
        hint: "Create",
        icon: <FilePlus size={ICON_SIZE.dense} />,
        run: () => router.push("/new"),
      },
    ];

    // Read/Edit mode switch only makes sense when a document is open.
    if (currentDocId) {
      const toRead = routeMode === "edit";
      items.splice(3, 0, {
        id: "cmd:mode",
        label: toRead ? "Switch to Read mode" : "Switch to Edit mode",
        hint: "⌘E",
        icon: toRead
          ? <Eye size={ICON_SIZE.dense} />
          : <Pencil size={ICON_SIZE.dense} />,
        run: () =>
          router.push(`/${toRead ? "view" : "edit"}/${currentDocId}`),
      });
    }

    return items;
  }, [
    effectiveMode,
    copilotOpen,
    currentDocId,
    routeMode,
    setMode,
    dispatch,
    router,
  ]);

  const postItems: PaletteItem[] = useMemo(
    () =>
      posts.map((post) => {
        const doc = post;
        const name = doc?.name || "Untitled";
        const folder = seriesByPostId.get(post.id) ?? "posts";
        return {
          id: `post:${post.id}`,
          label: name,
          hint: `${folder}/${name}.md`,
          mono: true,
          icon: <FileText size={ICON_SIZE.dense} />,
          run: () => router.push(`/edit/${post.id}`),
        };
      }),
    [posts, seriesByPostId, router],
  );

  // Filter: commands by label, posts by title; empty query shows commands + a
  // handful of recent posts (mirrors the design's default palette contents).
  const results: PaletteItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...commands, ...postItems.slice(0, 5)];
    const matches = (item: PaletteItem) =>
      item.label.toLowerCase().includes(q);
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

  // The Modal portals to <body>, so it centers on the whole viewport. The app's
  // left chrome (activity rail + sidebar) and right chrome (copilot panel +
  // right rail) are asymmetric, which pushes that viewport-center off the actual
  // editing area. Shift the dialog right by half the (left − right) chrome
  // difference so it sits centered over the main content column.
  const railW = railMode === "full"
    ? railWidth + RAIL_COMPACT_W
    : RAIL_COMPACT_W;
  const copilotW = copilotOpen ? copilotWidth : 0;
  const contentOffsetX =
    (ACTIVITY_RAIL_W + getEffectiveWidth() - copilotW - railW) / 2;

  return (
    <Modal
      open={open}
      onClose={close}
      aria-label="Command palette"
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: "rgba(var(--mui-palette-common-blackChannel) / 0.5)",
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
          // Center over the main content column rather than the viewport.
          transform: `translateX(${contentOffsetX}px)`,
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.panel",
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
                          fontFamily: item.mono
                            ? "monospace"
                            : undefined,
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
