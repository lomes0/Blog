"use client";
import { usePathname, useRouter } from "next/navigation";
import RouterLink from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { actions, type RootState, useDispatch, useSelector } from "@/store";
import {
  Avatar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  ChevronLeft,
  ChevronRight,
  Home,
  LibraryBooks,
} from "@mui/icons-material";
import FileBrowser from "@/components/FileBrowser";
import { styles } from "./styles";
import type { Domain, User } from "@/types";
import { useDomainManagement } from "./SideBar/hooks/useDomainManagement";
import { useSidebarState } from "./SideBar/hooks/useSidebarState";
import { useKeyboardShortcuts } from "./SideBar/hooks/useKeyboardShortcuts";
import { FileBrowserErrorBoundary } from "./SideBar/components/FileBrowserErrorBoundary";
import { DomainLoadingSkeleton } from "./SideBar/components/DomainLoadingSkeleton";
import type { UserDocument } from "@/types";

// Constants
const DRAWER_WIDTH = 240;

// Accessibility and styling constants
const SIDEBAR_CONSTANTS = {
  DOMAIN_INDICATOR_SIZE: 8,
  DOMAIN_AVATAR_SIZE: 24,
  MIN_HEIGHT: {
    NAVIGATION_ITEM: 42,
    DOMAIN_ITEM: 36,
    USER_ITEM: 48,
  },
  COLORS: {
    DOMAIN_INDICATOR_DEFAULT: "#555",
  },
} as const;

// Types
interface NavigationItem {
  text: string;
  icon: React.ReactNode;
  path: string;
  isDomain?: boolean;
  slug?: string;
  id?: string;
}

// Helper functions
const extractDomainSlug = (path: string): string | null => {
  if (!path.startsWith("/domains/")) return null;

  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const slug = parts[1]; // "domains" is at index 0, slug is at index 1

  // Skip special routes
  if (slug === "new" || slug === "edit") return null;

  return slug;
};

const isEditMode = (pathname: string): boolean => pathname.startsWith("/edit/");
const shouldShowFileBrowser = (pathname: string): boolean =>
  pathname.startsWith("/domains/");

const SideBar: React.FC = () => {
  const dispatch = useDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const theme = useTheme();

  // Custom hooks for state management
  const { open, toggleSidebar, isMobile } = useSidebarState();

  // Keyboard shortcuts for accessibility
  const { shortcutHint } = useKeyboardShortcuts({
    onToggleSidebar: toggleSidebar,
    enabled: true,
  });

  // Drag and drop handlers
  const handleDrop = useCallback(async (
    event: React.DragEvent,
    targetDomainId?: string,
  ) => {
    event.preventDefault();

    try {
      const dragData = event.dataTransfer.getData(
        "application/matheditor-document",
      );
      if (!dragData) return;

      const draggedItem = JSON.parse(dragData);

      // Find the dragged document in the store
      const draggedDocResponse = await dispatch(
        actions.getDocumentById(draggedItem.id),
      );
      const draggedDoc = draggedDocResponse.payload as UserDocument;

      if (!draggedDoc) return;

      // Move to root if no domain specified, otherwise to the specified domain
      const newDomainId = targetDomainId || null;

      // Update local document if it exists
      if (draggedDoc.local) {
        await dispatch(actions.updateLocalDocument({
          id: draggedItem.id,
          partial: {
            domainId: newDomainId,
            parentId: null, // Move to root of target domain
          },
        }));
      }

      // Update cloud document if it exists
      if (draggedDoc.cloud) {
        await dispatch(actions.updateCloudDocument({
          id: draggedItem.id,
          partial: {
            domainId: newDomainId,
            parentId: null, // Move to root of target domain
          },
        }));
      }

      // Show success message
      dispatch(actions.announce({
        message: {
          title: `Moved ${draggedItem.name || "document"} to ${
            targetDomainId ? "domain" : "root"
          }`,
        },
        timeout: 3000,
      }));
    } catch (error) {
      console.error("Error handling drop:", error);
      dispatch(actions.announce({
        message: {
          title: "Failed to move document",
        },
        timeout: 3000,
      }));
    }
  }, [dispatch]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // Redux selectors with proper typing
  const initialized = useSelector((state: RootState) => state.ui.initialized);
  const user = useSelector((state: RootState) => state.user);

  // Memoized computed values
  const isInEditMode = useMemo(() => isEditMode(pathname), [pathname]);
  const showFileBrowser = useMemo(() => shouldShowFileBrowser(pathname), [
    pathname,
  ]);

  const currentDomainSlug = useMemo(() => extractDomainSlug(pathname), [
    pathname,
  ]);

  // Domain management with the custom hook
  const { domains, isLoading: domainsLoading, error: domainsError } =
    useDomainManagement({
      currentDomainSlug,
      user: user || null,
    });

  const currentDomainId = useMemo(() => {
    if (!currentDomainSlug || !domains.length) return null;
    const domain = domains.find((d: Domain) => d.slug === currentDomainSlug);
    return domain?.id || null;
  }, [currentDomainSlug, domains]);

  // Navigation items
  const navigationItems = useMemo((): NavigationItem[] => [
    { text: "Home", icon: <Home />, path: "/" },
    { text: "New Domain", icon: <LibraryBooks />, path: "/domains/new" },
  ], []);

  const domainItems = useMemo(
    (): NavigationItem[] =>
      domains.map((domain: Domain) => ({
        text: domain.name.charAt(0).toUpperCase() + domain.name.slice(1),
        icon: (
          <Box
            sx={{
              width: SIDEBAR_CONSTANTS.DOMAIN_INDICATOR_SIZE,
              height: SIDEBAR_CONSTANTS.DOMAIN_INDICATOR_SIZE,
              borderRadius: "50%",
              backgroundColor:
                SIDEBAR_CONSTANTS.COLORS.DOMAIN_INDICATOR_DEFAULT,
            }}
            role="img"
            aria-label={`Domain indicator for ${domain.name}`}
          />
        ),
        path: `/domains/${domain.slug}`,
        isDomain: true,
        slug: domain.slug,
        id: domain.id,
      })),
    [domains],
  );

  // Callbacks - keep only the navigation handler
  const handleNavigationClick = useCallback((targetUrl: string) => {
    if (isInEditMode) {
      // Trigger autosave before navigation
      dispatch({
        type: "TRIGGER_AUTOSAVE_BEFORE_NAVIGATION",
        payload: { targetUrl },
      });

      setTimeout(() => {
        router.push(targetUrl);
      }, 100);
    }
  }, [dispatch, router, isInEditMode]);

  // Custom Link component with proper typing
  const SafeNavigationLink = useCallback(({
    href,
    children,
    onClick,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
    [key: string]: any;
  }) => {
    const handleClick = (e: React.MouseEvent) => {
      if (isInEditMode) {
        e.preventDefault();
        handleNavigationClick(href);
      }
      onClick?.();
    };

    return (
      <RouterLink href={href} onClick={handleClick} {...props}>
        {children}
      </RouterLink>
    );
  }, [isInEditMode, handleNavigationClick]);

  // Effects - Keep only the initialization effect
  useEffect(() => {
    if (!initialized) {
      dispatch(actions.load());
    }
  }, [dispatch, initialized]);

  return (
    <Drawer
      variant={isMobile ? "temporary" : "permanent"}
      open={open}
      onClose={toggleSidebar}
      sx={{
        width: open ? DRAWER_WIDTH : 72,
        flexShrink: 0,
        displayPrint: "none",
        "& .MuiDrawer-paper": {
          width: open ? DRAWER_WIDTH : 72,
          boxSizing: "border-box",
          transition: theme.transitions.create(["width"], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
          overflowX: "hidden",
          overflowY: "hidden",
          display: "flex",
          flexDirection: "column",
          height: "100vh",
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          padding: theme.spacing(1, 1),
          justifyContent: open ? "space-between" : "center",
          flexShrink: 0,
        }}
      >
        {open && (
          <Box
            component={RouterLink}
            href="/"
            sx={{
              display: "flex",
              alignItems: "center",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <Image
              src="/logo.svg"
              alt="Editor Logo"
              width={32}
              height={32}
            />
            <Box
              sx={{
                ml: 1,
                fontWeight: "bold",
                fontSize: "1.2rem",
              }}
            >
              Editor
            </Box>
          </Box>
        )}
        {!open && (
          <Tooltip title="Editor">
            <Box
              component={RouterLink}
              href="/"
              sx={{ display: "flex", justifyContent: "center" }}
            >
              <Image
                src="/logo.svg"
                alt="Editor Logo"
                width={32}
                height={32}
              />
            </Box>
          </Tooltip>
        )}
        <Tooltip title={`${open ? "Collapse" : "Expand"} sidebar (Ctrl+Alt+S)`}>
          <IconButton
            onClick={toggleSidebar}
            aria-label={`${open ? "Collapse" : "Expand"} sidebar`}
          >
            {open ? <ChevronLeft /> : <ChevronRight />}
          </IconButton>
        </Tooltip>
      </Box>

      <Divider sx={styles.divider} />

      {/* Top section - Main navigation */}
      <Box
        role="navigation"
        aria-label="Main navigation"
        sx={{
          ...styles.sectionBox,
          flexShrink: 0,
          pb: 0,
        }}
      >
        <List>
          {navigationItems.map((item) => (
            <ListItem
              key={item.text}
              disablePadding
              sx={{ display: "block" }}
            >
              <Tooltip
                title={open ? "" : item.text}
                placement="right"
              >
                <ListItemButton
                  component={SafeNavigationLink}
                  href={item.path}
                  selected={Boolean(
                    pathname === item.path ||
                      pathname.startsWith(`${item.path}/`),
                  )}
                  onDragOver={item.text === "Home" ? handleDragOver : undefined}
                  onDrop={item.text === "Home"
                    ? (e) => handleDrop(e)
                    : undefined}
                  sx={{
                    minHeight: SIDEBAR_CONSTANTS.MIN_HEIGHT.NAVIGATION_ITEM,
                    justifyContent: open ? "initial" : "center",
                    px: 2.5,
                    "&.Mui-selected": {
                      bgcolor: "action.selected",
                      "&:hover": {
                        bgcolor: "rgba(0, 0, 0, 0.15)",
                      },
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 0,
                      mr: open ? 2 : "auto",
                      justifyContent: "center",
                      "& .MuiSvgIcon-root": {
                        fontSize: "1.2rem",
                      },
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  {open && (
                    <ListItemText
                      primary={item.text}
                      primaryTypographyProps={{
                        fontSize: "0.9rem",
                      }}
                    />
                  )}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          ))}
        </List>
      </Box>

      <Divider sx={styles.divider} />

      {/* Domain section */}
      {(domains.length > 0 || domainsLoading) && (
        <Box
          role="navigation"
          aria-label="Domain navigation"
          sx={{
            ...styles.sectionBox,
            flexShrink: 0,
            pb: 0,
          }}
        >
          {open && (
            <Box
              sx={{
                px: 2,
                py: 1,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Box
                sx={{
                  fontSize: "0.8rem",
                  fontWeight: "bold",
                  color: "text.secondary",
                }}
              >
                DOMAINS {domainsLoading && "(Loading...)"}
              </Box>
            </Box>
          )}
          {domainsError && open && (
            <Box
              sx={{
                px: 2,
                py: 1,
                color: "error.main",
                fontSize: "0.75rem",
              }}
            >
              {domainsError}
            </Box>
          )}
          {domainsLoading ? <DomainLoadingSkeleton open={open} /> : (
            <List>
              {domainItems.map((item) => (
                <ListItem
                  key={item.id}
                  disablePadding
                  sx={{ display: "block" }}
                >
                  <Tooltip
                    title={open ? "" : item.text}
                    placement="right"
                  >
                    <ListItemButton
                      component={SafeNavigationLink}
                      href={item.path}
                      selected={Boolean(
                        pathname === item.path ||
                          (item.slug &&
                            pathname.startsWith(`/domains/${item.slug}/`)),
                      )}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, item.id)}
                      sx={{
                        minHeight: SIDEBAR_CONSTANTS.MIN_HEIGHT.DOMAIN_ITEM,
                        justifyContent: open ? "initial" : "center",
                        px: 2.5,
                        py: 0.58,
                        "&.Mui-selected": {
                          bgcolor: "action.selected",
                          "&:hover": {
                            bgcolor: "rgba(0, 0, 0, 0.15)",
                          },
                        },
                      }}
                    >
                      {!open && (
                        <Box
                          sx={{
                            width: SIDEBAR_CONSTANTS.DOMAIN_AVATAR_SIZE,
                            height: SIDEBAR_CONSTANTS.DOMAIN_AVATAR_SIZE,
                            borderRadius: "50%",
                            bgcolor: item.id && domains.find((d: Domain) =>
                                  d.id === item.id
                                )?.color || "primary.main",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.75rem",
                            color: "white",
                          }}
                          role="img"
                          aria-label={`${item.text} domain avatar`}
                        >
                          {item.text.charAt(0)}
                        </Box>
                      )}
                      {open && (
                        <>
                          <ListItemIcon
                            sx={{
                              minWidth: 0,
                              mr: 1.5,
                              ml: 0.5,
                              width: 10,
                              justifyContent: "center",
                            }}
                          >
                            {item.icon}
                          </ListItemIcon>
                          <ListItemText
                            primary={item.text}
                            primaryTypographyProps={{
                              fontSize: "0.85rem",
                              margin: 0,
                            }}
                          />
                        </>
                      )}
                    </ListItemButton>
                  </Tooltip>
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      )}

      <Divider sx={styles.divider} />

      {/* Middle section - File browser */}
      {showFileBrowser && (
        <>
          <Box
            sx={{
              flex: "1 1 auto",
              display: "flex",
              flexDirection: "column",
              overflow: "auto",
              minHeight: 0,
            }}
            className="file-browser-scroll"
          >
            <FileBrowserErrorBoundary>
              <FileBrowser open={open} domainId={currentDomainId} />
            </FileBrowserErrorBoundary>
          </Box>

          <Divider sx={styles.dividerBottom} />
        </>
      )}
      {!showFileBrowser && (
        <>
          <Box
            sx={{
              flex: "1 1 auto",
              minHeight: 0,
            }}
          />
          <Divider sx={styles.dividerBottom} />
        </>
      )}

      {/* Bottom section - User */}
      <Box
        sx={{
          ...styles.userBox,
          flexShrink: 0,
        }}
      >
        <Box sx={{ mt: "auto" }}>
          <List>
            <ListItem disablePadding sx={{ display: "block" }}>
              <Tooltip
                title={open ? "" : (user ? user.name : "Sign In")}
                placement="right"
              >
                <ListItemButton
                  component={SafeNavigationLink}
                  href={user ? "/dashboard" : "/api/auth/signin"}
                  sx={{
                    minHeight: SIDEBAR_CONSTANTS.MIN_HEIGHT.USER_ITEM,
                    justifyContent: open ? "initial" : "center",
                    px: 2.5,
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 0,
                      mr: open ? 2 : "auto",
                      justifyContent: "center",
                    }}
                  >
                    <Avatar
                      alt={user?.name}
                      src={user?.image ?? undefined}
                      sx={{
                        width: 32,
                        height: 32,
                      }}
                    />
                  </ListItemIcon>
                  {open && (
                    <ListItemText
                      primary={user ? user.name : "Sign In"}
                    />
                  )}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          </List>
        </Box>
      </Box>
    </Drawer>
  );
};

export default SideBar;
