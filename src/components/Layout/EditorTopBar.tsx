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
  BookOpen,
  ChevronDown,
  FileText,
  LayoutDashboard,
  Library,
  Menu as MenuIcon,
  PenLine,
  Plus,
  StickyNote,
  X,
} from "lucide-react";
import RouterLink from "next/link";
import { shallowEqual } from "react-redux";
import { documentsSelectors, useSelector } from "@/store";
import type { RootState } from "@/store";
import { useLayoutMode } from "@/contexts/LayoutModeContext";
import { useSidebarWidth } from "@/contexts/SidebarWidthContext";
import { useTopBarActions } from "@/contexts/TopBarActionsContext";
import { useTopBarTabs } from "@/contexts/TopBarTabsContext";

interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

const EditorTopBar: React.FC = () => {
  const pathname = usePathname();
  const { viewMode, setFocus, setRead } = useLayoutMode();
  const { toggleSidebarCompact, sidebarMode } = useSidebarWidth();
  const { actions } = useTopBarActions();
  const { tabBar } = useTopBarTabs();
  const isFocus = viewMode === "focus";

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) return;
      if (e.key === "f" || e.key === "F") {
        if (isFocus) setRead();
        else setFocus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isFocus, setFocus, setRead]);

  const segments = React.useMemo(
    () => pathname.split("/").filter(Boolean),
    [pathname],
  );

  const isEditPage = segments[0] === "edit";
  const isViewPage = segments[0] === "view";
  const isDocPage = isEditPage || isViewPage;
  const docId = isDocPage ? segments[1] : undefined;

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
      const doc = docId
        ? documentsSelectors.selectById(state, docId)
        : undefined;
      const dSeriesId = doc?.cloud?.seriesId || doc?.local?.seriesId;

      return {
        docName: doc?.cloud?.name || doc?.local?.name,
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
    if (segments.length === 0) return items;

    switch (segments[0]) {
      case "browse":
        items.push({
          label: "Posts",
          href: "/posts",
          icon: <BookOpen size={16} style={{ marginRight: 4 }} />,
        });
        break;

      case "posts":
        items.push({
          label: "Posts",
          href: "/posts",
          icon: <BookOpen size={16} style={{ marginRight: 4 }} />,
        });
        if (segments.length > 1) {
          items.push({
            label: seriesTitle || "Series",
            href: `/series/${segments[1]}`,
            icon: <Library size={16} style={{ marginRight: 4 }} />,
          });
        }
        break;

      case "series":
        items.push({
          label: "Posts",
          href: "/posts",
          icon: <BookOpen size={16} style={{ marginRight: 4 }} />,
        });
        if (segments.length > 1) {
          const sId = segments[1];
          if (segments.length > 2 && segments[2] === "edit") {
            items.push({
              label: seriesTitle || "Series",
              href: `/series/${sId}`,
              icon: <Library size={16} style={{ marginRight: 4 }} />,
            });
            items.push({ label: "Edit", href: `/series/${sId}/edit` });
          } else {
            items.push({
              label: seriesTitle || "Series",
              href: `/series/${sId}`,
              icon: <Library size={16} style={{ marginRight: 4 }} />,
            });
          }
        }
        break;

      case "dashboard":
        items.push({
          label: "Dashboard",
          href: "/dashboard",
          icon: <LayoutDashboard size={16} style={{ marginRight: 4 }} />,
        });
        break;

      case "new":
        items.push({
          label: "Posts",
          href: "/posts",
          icon: <BookOpen size={16} style={{ marginRight: 4 }} />,
        });
        items.push({
          label: "New Post",
          href: "/new",
          icon: <PenLine size={16} style={{ marginRight: 4 }} />,
        });
        break;

      case "view": {
        const viewId = segments[1];
        items.push({
          label: "Posts",
          href: "/posts",
          icon: <BookOpen size={16} style={{ marginRight: 4 }} />,
        });
        if (docSeriesId) {
          items.push({
            label: docSeriesTitle || "Series",
            href: `/series/${docSeriesId}`,
            icon: <Library size={16} style={{ marginRight: 4 }} />,
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
          icon: <StickyNote size={16} style={{ marginRight: 4 }} />,
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

  if (pathname === "/") return null;

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
      {/* Hamburger */}
      <Tooltip
        title={sidebarMode === "full" ? "Collapse sidebar" : "Expand sidebar"}
      >
        <IconButton
          size="small"
          onClick={toggleSidebarCompact}
          aria-label={sidebarMode === "full"
            ? "Collapse sidebar"
            : "Expand sidebar"}
          sx={{ flexShrink: 0, color: "text.secondary", mr: 0.5 }}
        >
          <MenuIcon size={16} strokeWidth={2} />
        </IconButton>
      </Tooltip>

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
              borderRadius: 1,
              cursor: "default",
              flexShrink: 0,
              maxWidth: 200,
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <FileText
              size={14}
              style={{
                color: "var(--mui-palette-text-secondary)",
                flexShrink: 0,
              }}
            />
            <Typography
              noWrap
              sx={{
                fontSize: "0.8125rem",
                fontWeight: 500,
                color: "text.primary",
              }}
            >
              {docName || "Untitled"}
            </Typography>
            <ChevronDown
              size={13}
              style={{
                color: "var(--mui-palette-text-disabled)",
                flexShrink: 0,
              }}
            />
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
                      fontSize: "0.875rem",
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
                    fontSize: "0.875rem",
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
                    width: 105,
                    bgcolor: "transparent",
                    borderBottom: 2,
                    borderColor: isActive ? "primary.main" : "transparent",
                    borderRadius: 0,
                    "&:hover": {
                      bgcolor: isActive ? "transparent" : "action.hover",
                    },
                    "&:hover .tab-close-btn": { opacity: 1 },
                    transition: "background-color 0.15s, border-color 0.15s",
                  }}
                >
                  <FileText
                    size={13}
                    style={{
                      color: isActive
                        ? "var(--mui-palette-primary-main)"
                        : "var(--mui-palette-text-secondary)",
                      flexShrink: 0,
                    }}
                  />
                  {isDirty && (
                    <Box
                      sx={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        bgcolor: "warning.main",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <Typography
                    noWrap
                    sx={{
                      fontSize: "0.8rem",
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? "primary.main" : "text.secondary",
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {tab.name}
                  </Typography>
                  {!isRoot && tabBar.onClose && (
                    <IconButton
                      className="tab-close-btn"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        tabBar.onClose!(tab.id);
                      }}
                      sx={{
                        opacity: isActive ? 0.7 : 0,
                        p: 0.125,
                        transition: "opacity 0.15s",
                        color: isActive ? "primary.main" : "text.secondary",
                        "&:hover": {
                          color: "error.main",
                          opacity: 1,
                        },
                      }}
                    >
                      <X size={11} />
                    </IconButton>
                  )}
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
                  <Plus size={15} />
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

      {/* Page-level actions slot — right after the sub-doc tabs (or title) */}
      {actions}

      {/* Trailing spacer — keeps actions left-aligned, fills the rest */}
      <Box sx={{ flex: 1 }} />
    </Box>
  );
};

export default EditorTopBar;
