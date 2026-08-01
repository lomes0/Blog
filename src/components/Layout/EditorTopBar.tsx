"use client";
import * as React from "react";
import { usePathname } from "next/navigation";
import {
  Box,
  Breadcrumbs as MuiBreadcrumbs,
  Divider,
  IconButton,
  Link,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  ArrowLeft,
  BookOpen,
  FileText,
  House,
  LayoutDashboard,
  Library,
  PenLine,
  Plus,
  Search,
  StickyNote,
  X,
} from "lucide-react";
import RouterLink from "next/link";
import { shallowEqual } from "react-redux";
import { postsSelectors, useSelector } from "@/store";
import type { RootState } from "@/store";
import { selectFocusedPane } from "@/store/selectors/layoutSelectors";
import { useTopBarActions } from "@/contexts/TopBarActionsContext";
import { useTopBarTabs } from "@/contexts/TopBarTabsContext";
import { ICON_SIZE } from "@/theme/icons";
import { openCommandPalette } from "@/components/CommandPalette/CommandPalette";
import { CONTENT_AXIS_SHIFT } from "./contentInset";

interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

const EditorTopBar: React.FC = () => {
  const pathname = usePathname();
  const { actions } = useTopBarActions();
  const { tabBar } = useTopBarTabs();

  // Platform-aware shortcut label. Starts false (matches SSR) and resolves on
  // the client to avoid a hydration mismatch.
  const [isMac, setIsMac] = React.useState(false);
  React.useEffect(() => {
    setIsMac(/mac|iphone|ipad|ipod/i.test(navigator.userAgent));
  }, []);

  // Inline tab rename. Triggered either by double-clicking a tab label or by the
  // tab context menu, which sets `tabBar.renamingTabId`.
  const [editingTabId, setEditingTabId] = React.useState<string | null>(null);
  const [renameDraft, setRenameDraft] = React.useState("");
  const renameInputRef = React.useRef<HTMLInputElement>(null);

  const startTabRename = React.useCallback((tabId: string, name: string) => {
    setEditingTabId(tabId);
    setRenameDraft(name);
  }, []);

  const cancelTabRename = React.useCallback(() => {
    setEditingTabId(null);
  }, []);

  const commitTabRename = React.useCallback(() => {
    if (!editingTabId) return;
    const tab = tabBar?.tabs.find((t) => t.id === editingTabId);
    const trimmed = renameDraft.trim();
    if (tab && trimmed && trimmed !== tab.name) {
      tabBar?.onRename?.(editingTabId, trimmed);
    }
    setEditingTabId(null);
  }, [editingTabId, renameDraft, tabBar]);

  // Enter rename mode when the context menu requests it.
  const renamingTabId = tabBar?.renamingTabId;
  const onRenameStarted = tabBar?.onRenameStarted;
  React.useEffect(() => {
    if (!renamingTabId) return;
    const tab = tabBar?.tabs.find((t) => t.id === renamingTabId);
    if (!tab) return;
    setEditingTabId(renamingTabId);
    setRenameDraft(tab.name);
    onRenameStarted?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renamingTabId, onRenameStarted]);

  React.useEffect(() => {
    if (editingTabId) renameInputRef.current?.select();
  }, [editingTabId]);

  const segments = React.useMemo(
    () => pathname.split("/").filter(Boolean),
    [pathname],
  );

  const isEditPage = segments[0] === "edit";
  const isViewPage = segments[0] === "view";
  const isDocPage = isEditPage || isViewPage;
  // Which crumbs to draw is a property of the route; *which document* they name
  // is not — that comes from the focused pane, so a second pane would move the
  // breadcrumb with focus rather than with the address bar (plan §2.3).
  const focusedRootId = useSelector(
    (state: RootState) => selectFocusedPane(state)?.rootId ?? null,
  );
  const docId = isDocPage ? focusedRootId ?? undefined : undefined;

  const urlSeriesId = React.useMemo(() => {
    if (
      (segments[0] === "posts" || segments[0] === "series") &&
      segments[1]
    ) {
      return segments[1];
    }
    return undefined;
  }, [segments]);

  const {
    docName,
    docSeriesId,
    seriesTitle,
    docSeriesTitle,
  } = useSelector(
    (state: RootState) => {
      const doc = docId ? postsSelectors.selectById(state, docId) : undefined;
      const dSeriesId = doc?.seriesId;

      return {
        docName: doc?.name,
        docSeriesId: dSeriesId,
        seriesTitle: urlSeriesId
          ? state.series.find((s) => s.id === urlSeriesId)?.title
          : undefined,
        docSeriesTitle: dSeriesId
          ? state.series.find((s) => s.id === dSeriesId)?.title
          : undefined,
      };
    },
    shallowEqual,
  );

  const breadcrumbs = React.useMemo((): BreadcrumbItem[] => {
    const items: BreadcrumbItem[] = [];
    // The home route is a route like any other and gets the same crumb
    // treatment, rather than a second header bar of its own inside the page.
    if (segments.length === 0) {
      items.push({
        label: "Home",
        href: "/",
        icon: <House size={ICON_SIZE.inline} style={{ marginRight: 4 }} />,
      });
      return items;
    }

    switch (segments[0]) {
      case "browse":
        items.push({
          label: "Posts",
          href: "/posts",
          icon: <BookOpen size={ICON_SIZE.inline} style={{ marginRight: 4 }} />,
        });
        break;

      case "posts":
        items.push({
          label: "Posts",
          href: "/posts",
          icon: <BookOpen size={ICON_SIZE.inline} style={{ marginRight: 4 }} />,
        });
        if (segments.length > 1) {
          items.push({
            label: seriesTitle || "Series",
            href: `/series/${segments[1]}`,
            icon: (
              <Library size={ICON_SIZE.inline} style={{ marginRight: 4 }} />
            ),
          });
        }
        break;

      case "series":
        items.push({
          label: "Posts",
          href: "/posts",
          icon: <BookOpen size={ICON_SIZE.inline} style={{ marginRight: 4 }} />,
        });
        if (segments.length > 1) {
          const sId = segments[1];
          if (segments.length > 2 && segments[2] === "edit") {
            items.push({
              label: seriesTitle || "Series",
              href: `/series/${sId}`,
              icon: (
                <Library size={ICON_SIZE.inline} style={{ marginRight: 4 }} />
              ),
            });
            items.push({ label: "Edit", href: `/series/${sId}/edit` });
          } else {
            items.push({
              label: seriesTitle || "Series",
              href: `/series/${sId}`,
              icon: (
                <Library size={ICON_SIZE.inline} style={{ marginRight: 4 }} />
              ),
            });
          }
        }
        break;

      case "dashboard":
        items.push({
          label: "Dashboard",
          href: "/dashboard",
          icon: (
            <LayoutDashboard
              size={ICON_SIZE.inline}
              style={{ marginRight: 4 }}
            />
          ),
        });
        break;

      case "new":
        items.push({
          label: "Posts",
          href: "/posts",
          icon: <BookOpen size={ICON_SIZE.inline} style={{ marginRight: 4 }} />,
        });
        items.push({
          label: "New Post",
          href: "/new",
          icon: <PenLine size={ICON_SIZE.inline} style={{ marginRight: 4 }} />,
        });
        break;

      case "view": {
        const viewId = segments[1];
        items.push({
          label: "Posts",
          href: "/posts",
          icon: <BookOpen size={ICON_SIZE.inline} style={{ marginRight: 4 }} />,
        });
        if (docSeriesId) {
          items.push({
            label: docSeriesTitle || "Series",
            href: `/series/${docSeriesId}`,
            icon: (
              <Library size={ICON_SIZE.inline} style={{ marginRight: 4 }} />
            ),
          });
        }
        items.push({
          label: viewId ? docName || "Post" : "Post",
          href: viewId ? `/view/${viewId}` : "/posts",
        });
        break;
      }

      case "user":
        items.push({
          label: "User Profile",
          href: segments[1] ? `/user/${segments[1]}` : "/",
        });
        break;

      case "notes":
        items.push({
          label: "Notes",
          href: "/notes",
          icon: (
            <StickyNote size={ICON_SIZE.inline} style={{ marginRight: 4 }} />
          ),
        });
        break;

      default:
        items.push({ label: segments[0], href: `/${segments[0]}` });
        break;
    }

    return items;
  }, [
    segments,
    seriesTitle,
    docSeriesId,
    docSeriesTitle,
    docName,
  ]);

  const hasTabs = isDocPage && tabBar && tabBar.tabs.length > 1;

  return (
    <Box
      sx={{
        minHeight: 40,
        px: 1.5,
        borderBottom: "1px solid",
        borderColor: "divider",
        display: "flex",
        alignItems: "center",
        gap: 0,
        flexShrink: 0,
        bgcolor: "background.paper",
      }}
    >
      {
        /* Left region: everything that precedes the search pill.

          It and the empty right region below both take `flex: 1 1 0`, so the
          two always resolve to the same width and the pill between them lands
          on the bar's center. A pair of bare spacers cannot do this — with the
          left content sitting *outside* them they split only the space it
          leaves over, which puts the pill half the left content's width
          off-center. That was 205px on the home route, and it grew with the
          breadcrumb, because the breadcrumb's own `flex: 1` had it expanding in
          lockstep with the spacers. */
      }
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          flex: "1 1 0",
          minWidth: 0,
        }}
      >
        {/* Edit pages: back-to-view button (view pages have their own Edit btn) */}
        {isEditPage && docId && (
          <Tooltip title="Back to view">
            <IconButton
              size="small"
              component={RouterLink}
              href={`/view/${docId}`}
              aria-label="Back to view"
              sx={{ flexShrink: 0, color: "text.secondary", mr: 0.25 }}
            >
              <ArrowLeft size={ICON_SIZE.dense} strokeWidth={2} />
            </IconButton>
          </Tooltip>
        )}

        {/* Edit/view pages: compact document name */}
        {isDocPage
          ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                px: 0.75,
                py: 0.5,
                borderRadius: 1.5,
                cursor: "default",
                flexShrink: 0,
                maxWidth: 200,
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <FileText
                size={ICON_SIZE.inline}
                style={{
                  color: "var(--mui-palette-text-secondary)",
                  flexShrink: 0,
                }}
              />
              <Typography
                noWrap
                variant="dense"
                sx={{
                  fontWeight: 500,
                  color: "text.primary",
                }}
              >
                {docName || "Untitled"}
              </Typography>
            </Box>
          )
          : (
            /* Non-edit pages: full breadcrumb chain */
            <MuiBreadcrumbs
              aria-label="breadcrumb"
              separator="/"
              sx={{ flex: 1, minWidth: 0 }}
            >
              {breadcrumbs.map((item, index) => {
                const isLast = index === breadcrumbs.length - 1;

                if (item.href) {
                  return (
                    <Link
                      key={index}
                      component={RouterLink}
                      href={item.href}
                      underline="hover"
                      color={isLast ? "text.primary" : "inherit"}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        typography: "body2",
                        fontWeight: isLast ? 600 : 400,
                        "&:hover": { color: "primary.main" },
                      }}
                    >
                      {item.icon}
                      {item.label}
                    </Link>
                  );
                }

                return (
                  <Typography
                    key={index}
                    color="text.primary"
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      typography: "body2",
                      fontWeight: isLast ? 600 : 400,
                    }}
                  >
                    {item.icon}
                    {item.label}
                  </Typography>
                );
              })}
            </MuiBreadcrumbs>
          )}

        {/* Inline tabs — only on edit pages when tabs exist */}
        {hasTabs && (
          <>
            <Divider
              orientation="vertical"
              flexItem
              sx={{ mx: 1, my: 0.75 }}
            />
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.25,
                overflowX: "auto",
                overflowY: "hidden",
                flexShrink: 1,
                minWidth: 0,
                "&::-webkit-scrollbar": { height: 2 },
                "&::-webkit-scrollbar-thumb": { bgcolor: "divider" },
              }}
            >
              {tabBar.tabs.map((tab) => {
                const isActive = tab.id === tabBar.activeTabId;
                const isDirty = tabBar.dirtyTabIds?.includes(tab.id) ?? false;
                const isRoot = tab.id === tabBar.rootTabId;

                return (
                  <Box
                    key={tab.id}
                    onClick={() => tabBar.onSwitch(tab.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      tabBar.onContextMenu?.(tab.id, isRoot, e.currentTarget);
                    }}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                      px: 1,
                      py: 0.375,
                      cursor: "pointer",
                      userSelect: "none",
                      flexShrink: 0,
                      width: 95,
                      bgcolor: "transparent",
                      borderBottom: 2,
                      borderColor: isActive ? "primary.main" : "transparent",
                      borderRadius: 0,
                      "&:hover": {
                        bgcolor: isActive ? "transparent" : "action.hover",
                      },
                      "&:hover .tab-close-btn": { opacity: 1 },
                      "&:hover .tab-dirty-dot": { opacity: 0 },
                      transition: "background-color 0.15s, border-color 0.15s",
                    }}
                  >
                    <FileText
                      size={ICON_SIZE.inline}
                      style={{
                        color: "var(--mui-palette-text-secondary)",
                        flexShrink: 0,
                      }}
                    />
                    {editingTabId === tab.id
                      ? (
                        <Box
                          component="input"
                          ref={renameInputRef}
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onBlur={commitTabRename}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitTabRename();
                            if (e.key === "Escape") cancelTabRename();
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
                            startTabRename(tab.id, tab.name);
                          }}
                          sx={{
                            typography: "dense",
                            fontWeight: isActive ? 600 : 400,
                            color: "text.secondary",
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          {tab.name}
                        </Typography>
                      )}
                    {!isRoot && tabBar.onClose
                      ? (
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
                                transition: "opacity 0.15s",
                              }}
                            />
                          )}
                          <IconButton
                            className="tab-close-btn"
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              tabBar.onClose!(tab.id);
                            }}
                            sx={{
                              position: "absolute",
                              opacity: isActive && !isDirty ? 0.7 : 0,
                              p: 0.125,
                              transition: "opacity 0.15s",
                              color: isActive
                                ? "primary.main"
                                : "text.secondary",
                              "&:hover": {
                                color: "error.main",
                                opacity: 1,
                              },
                            }}
                          >
                            <X size={ICON_SIZE.micro} />
                          </IconButton>
                        </Box>
                      )
                      : isDirty
                      ? (
                        <Box
                          sx={{
                            width: 5,
                            height: 5,
                            borderRadius: "50%",
                            bgcolor: "warning.main",
                            flexShrink: 0,
                          }}
                        />
                      )
                      : null}
                  </Box>
                );
              })}

              {tabBar.onAdd && (
                <Tooltip title="New sub-doc">
                  <IconButton
                    size="small"
                    onClick={tabBar.onAdd}
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
              )}
            </Box>
            <Divider
              orientation="vertical"
              flexItem
              sx={{ mx: 1, my: 0.75 }}
            />
          </>
        )}

        {
          /* Single-tab edit pages don't render the strip above, so surface a lone
          "New tab" button to create the first extra tab. */
        }
        {isEditPage && tabBar && !hasTabs && tabBar.onAdd && (
          <>
            <Divider
              orientation="vertical"
              flexItem
              sx={{ mx: 1, my: 0.75 }}
            />
            <Tooltip title="New tab">
              <IconButton
                size="small"
                onClick={tabBar.onAdd}
                aria-label="New tab"
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
          </>
        )}

        {/* Page-level actions slot — right after the sub-doc tabs (or title) */}
        {actions}
      </Box>

      {/* Command palette entry — opens the ⌘K palette (mouse path) */}
      <Box
        role="button"
        tabIndex={0}
        aria-label="Search posts or run a command"
        onClick={openCommandPalette}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openCommandPalette();
          }
        }}
        sx={(theme) => ({
          display: { xs: "none", sm: "flex" },
          alignItems: "center",
          gap: 1,
          flexShrink: 1,
          minWidth: 0,
          width: "100%",
          maxWidth: 440,
          // The flex regions either side center the pill on the *bar*, which is
          // not where the page's content sits — the container below carries a
          // wider left gutter than right. Shifting by half that difference puts
          // the pill on the content axis, so it, the composer beneath it and
          // the ⌘K dialog that opens out of it all share one vertical line.
          // A transform rather than a margin: this is a visual correction, and
          // the two regions should keep splitting the bar evenly.
          transform: {
            sm: `translateX(${theme.spacing(CONTENT_AXIS_SHIFT.sm)})`,
            md: `translateX(${theme.spacing(CONTENT_AXIS_SHIFT.md)})`,
          },
          px: 1,
          py: 0.375,
          cursor: "pointer",
          color: "text.secondary",
          bgcolor: "background.input",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          transition: "border-color 0.15s, background-color 0.15s",
          "&:hover": { borderColor: "primary.main" },
          "&:focus-visible": {
            outline: "none",
            boxShadow:
              "0 0 0 3px rgba(var(--mui-palette-primary-mainChannel) / 0.25)",
          },
        })}
      >
        <Search size={ICON_SIZE.inline} style={{ flexShrink: 0 }} />
        <Typography
          noWrap
          variant="dense"
          sx={{ flex: 1, minWidth: 0, color: "text.secondary" }}
        >
          Search posts or run a command…
        </Typography>
        <Box
          component="kbd"
          sx={{
            typography: "micro",
            flexShrink: 0,
            px: 0.5,
            py: 0.125,
            borderRadius: 1.5,
            border: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            color: "text.secondary",
          }}
        >
          {isMac ? "⌘K" : "Ctrl K"}
        </Box>
      </Box>

      {/* Right region — empty, and the same share as the left one. */}
      <Box sx={{ flex: "1 1 0", minWidth: 0 }} />
    </Box>
  );
};

export default EditorTopBar;
