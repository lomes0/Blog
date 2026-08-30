"use client";
import * as React from "react";
import { usePathname } from "next/navigation";
import {
  Box,
  Breadcrumbs as MuiBreadcrumbs,
  IconButton,
  Link,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  BookOpen,
  Eye,
  FileText,
  House,
  LayoutDashboard,
  Library,
  Pencil,
  PenLine,
  Search,
  SquareSplitHorizontal,
} from "lucide-react";
import RouterLink from "next/link";
import { shallowEqual } from "react-redux";
import { postsSelectors, useSelector } from "@/store";
import type { RootState } from "@/store";
import { selectFocusedPane } from "@/store/selectors/layoutSelectors";
import { paneCommands, uiCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";
import { useTopBarActions } from "@/contexts/TopBarActionsContext";
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

  // Platform-aware shortcut label. Starts false (matches SSR) and resolves on
  // the client to avoid a hydration mismatch.
  const [isMac, setIsMac] = React.useState(false);
  React.useEffect(() => {
    setIsMac(/mac|iphone|ipad|ipod/i.test(navigator.userAgent));
  }, []);

  const segments = React.useMemo(
    () => pathname.split("/").filter(Boolean),
    [pathname],
  );

  // One flag, not three. `isViewPage`/`isDocPage` distinguished the two halves
  // of a view/edit split that this bar can no longer see: `/view/[id]` moved to
  // `(public)` in Phase 4 and renders `PublicShell`, which does not mount this
  // component — so `segments[0] === "view"` was permanently false and
  // `isDocPage` was an alias for `isEditPage` that read as if it weren't.
  const isEditPage = segments[0] === "edit";
  // Which crumbs to draw is a property of the route; *which document* they name
  // is not — that comes from the focused pane, so a second pane would move the
  // breadcrumb with focus rather than with the address bar (plan §2.3).
  const focusedRootId = useSelector(
    (state: RootState) => selectFocusedPane(state)?.rootId ?? null,
  );
  const docId = isEditPage ? focusedRootId ?? undefined : undefined;

  // The pane controls: read/write and the split. Both act on the focused pane,
  // which is why neither reads the pathname — with two panes open the address
  // bar cannot say which one is meant (plan §4.4).
  const run = useCommandRun();
  const focusedMode = useSelector(
    (state: RootState) => selectFocusedPane(state)?.mode ?? null,
  );
  const paneCount = useSelector(
    (state: RootState) => state.ui.workspace.panes.length,
  );
  const isReading = focusedMode === "read";

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

      // Was `case "view"`, and that was the bug: this bar only ever mounts
      // inside the workspace shell (`AppLayoutContent`), so once Phase 4 moved
      // `/view/[id]` into `(public)` the branch became unreachable — while
      // `/edit`, the route the user is on most of the time, had no case at all
      // and fell through to `default:` for a single crumb reading "edit".
      // The block was written for the editor throughout; only its label was
      // wrong. Its last crumb pointed at `/view/[id]`, which now leaves the app.
      case "edit": {
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
        // `docId`, not `segments[1]`: every other value here is read off the
        // focused pane (see the note by `docId`), and since
        // docs/plans/archive/workspace-url.md §3 the address bar does not name
        // a document at all — `/edit` is the steady state, so `segments[1]` is
        // usually just absent.
        items.push({
          label: docName || "Post",
          href: docId ? `/edit/${docId}` : "/posts",
        });
        break;
      }

      case "user":
        items.push({
          label: "User Profile",
          href: segments[1] ? `/user/${segments[1]}` : "/",
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
    docId,
  ]);

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
        {
          /* No back-to-view button. It was the last survivor of view/edit being
            a *route* decision: it navigated to `/view/[id]`, which since Phase 4
            leaves the workspace and discards the pane layout on the way out.
            Read mode is a property of the focused pane now, and the toggle for
            it is in this bar's right region — see `pane.setMode` and plan §4.4.
            The public page is still reachable, by the share link that names it. */
        }

        {/* Doc pages: compact document name */}
        {isEditPage
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

        {
          /* Page-level actions slot — right after the document name. The
            sub-doc tabs used to sit between the two; they belong to a pane, not
            to the window, and live in `PaneHeader` now. */
        }
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

      {
        /* Right region — the focused pane's own controls, and the same share as
          the left one so the search pill stays centred. */
      }
      <Box
        sx={{
          flex: "1 1 0",
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 0.25,
        }}
      >
        {isEditPage && focusedMode && (
          <Tooltip
            title={isReading ? "Edit this post" : "Read this post"}
          >
            <IconButton
              size="small"
              aria-label={isReading ? "Switch to editing" : "Switch to reading"}
              aria-pressed={isReading}
              onClick={() =>
                run(uiCommands.setMode, {
                  mode: isReading ? "write" : "read",
                })}
              sx={{
                flexShrink: 0,
                color: isReading ? "primary.main" : "text.secondary",
                "&:hover": { color: "primary.main" },
              }}
            >
              {isReading
                ? <Pencil size={ICON_SIZE.dense} />
                : <Eye size={ICON_SIZE.dense} />}
            </IconButton>
          </Tooltip>
        )}
        {isEditPage && paneCount > 1 && (
          <Tooltip title="Close the focused pane">
            <IconButton
              size="small"
              aria-label="Close the focused pane"
              onClick={() => run(paneCommands.close, {})}
              sx={{
                flexShrink: 0,
                color: "text.secondary",
                "&:hover": { color: "primary.main" },
              }}
            >
              <SquareSplitHorizontal size={ICON_SIZE.dense} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
};

export default EditorTopBar;
