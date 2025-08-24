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
  CollectionsBookmark,
  Create,
  Dashboard,
  Home,
  LibraryBooks,
} from "@mui/icons-material";
import { styles } from "./styles";
import type { User } from "@/types";
import { useSidebarState } from "./SideBar/hooks/useSidebarState";
import { useKeyboardShortcuts } from "./SideBar/hooks/useKeyboardShortcuts";
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

// Helper functions - simplified for blog structure
const isEditMode = (pathname: string): boolean => pathname.startsWith("/edit/");
// Remove domain-related helpers as we don't need them for blog structure

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

  // Remove drag and drop handlers for blog structure

  // Redux selectors with proper typing
  const initialized = useSelector((state: RootState) => state.ui.initialized);
  const user = useSelector((state: RootState) => state.user);

  // Memoized computed values
  const isInEditMode = useMemo(() => isEditMode(pathname), [pathname]);
  // Remove file browser for blog structure
  const showFileBrowser = false;

  // Navigation items for blog structure
  const navigationItems = useMemo((): NavigationItem[] => {
    const items = [
      { text: "Home", icon: <Home />, path: "/" },
      { text: "Browse Posts", icon: <LibraryBooks />, path: "/browse" },
      { text: "Series", icon: <CollectionsBookmark />, path: "/series" },
    ];

    // Add user-specific navigation items if authenticated
    if (user) {
      items.push(
        { text: "Dashboard", icon: <Dashboard />, path: "/dashboard" },
        { text: "New Post", icon: <Create />, path: "/new" },
      );
    }

    return items;
  }, [user]);

  // Remove domain-related items for blog structure
  const domainItems = useMemo((): NavigationItem[] => [], []);

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
              Blog
            </Box>
          </Box>
        )}
        {!open && (
          <Tooltip title="Blog">
            <Box
              component={RouterLink}
              href="/"
              sx={{ display: "flex", justifyContent: "center" }}
            >
              <Image
                src="/logo.svg"
                alt="Blog Logo"
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

      {/* Middle section - Flexible space since we don't have file browser */}
      <Box
        sx={{
          flex: "1 1 auto",
          minHeight: 0,
        }}
      />

      <Divider sx={styles.dividerBottom} />

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
