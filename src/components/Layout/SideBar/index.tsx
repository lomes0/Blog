"use client";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { type RootState, useSelector } from "@/store";
import { selectUserFilteredDocuments } from "@/store/selectors/layoutSelectors";
import {
  Avatar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { FileText, Maximize2, MessageSquare, Minimize2 } from "lucide-react";
import { styles } from "../styles";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useSidebarWidth } from "@/contexts/SidebarWidthContext";
import { useLayoutMode } from "@/contexts/LayoutModeContext";
import { useSidebarFontSize } from "./hooks/useSidebarFontSize";
import { useSidebarActions } from "./hooks/useSidebarActions";
import { SidebarHeader } from "./SidebarHeader";
import { ActivePostsSection } from "./ActivePostsSection";
import { PostContextMenu } from "./PostContextMenu";
import { SafeNavigationLink } from "./SafeNavigationLink";
import {
  buildSeriesMap,
  groupPostsBySeriesWithEmpty,
} from "@/utils/posts/seriesGrouping";

const NAV_ITEM_MIN_HEIGHT = 36;
const USER_ITEM_MIN_HEIGHT = 40;

const navigationItems = [
  { text: "Posts", icon: <FileText size={20} />, path: "/posts" },
  { text: "Notes", icon: <MessageSquare size={20} />, path: "/notes" },
];

const SideBar: React.FC = () => {
  const pathname = usePathname();
  const theme = useTheme();

  const {
    sidebarMode,
    sidebarOpen: open,
    toggleSidebar,
    isMobile,
    isResizing,
    startResize,
    getEffectiveWidth,
  } = useSidebarWidth();

  const { viewMode, setFocus, setRead } = useLayoutMode();
  const isFocus = viewMode === "focus";
  const isExpanded = sidebarMode === "full" && !isFocus;
  const { sidebarFontSize } = useSidebarFontSize();
  const {
    contextMenu,
    handleCloseContextMenu,
    handleEditPost,
    handleRenameFromMenu,
    handleDeletePost,
    ...postItemActions
  } = useSidebarActions();

  useKeyboardShortcuts({ onToggleSidebar: toggleSidebar, enabled: true });

  const user = useSelector((state: RootState) => state.user);
  const filteredDocuments = useSelector(selectUserFilteredDocuments);
  const seriesList = useSelector((state: RootState) => state.series);

  const seriesMap = useMemo(
    () => buildSeriesMap(seriesList || []),
    [seriesList],
  );

  const groupedActivePosts = useMemo(
    () => groupPostsBySeriesWithEmpty(filteredDocuments, seriesMap),
    [filteredDocuments, seriesMap],
  );

  return (
    <Drawer
      variant={isMobile ? "temporary" : "permanent"}
      open={open}
      onClose={toggleSidebar}
      sx={{
        width: getEffectiveWidth(),
        flexShrink: 0,
        displayPrint: "none",
        "& .MuiDrawer-paper": {
          width: getEffectiveWidth(),
          boxSizing: "border-box",
          transition: isResizing
            ? "none"
            : theme.transitions.create(["width"], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
          overflowX: "hidden",
          overscrollBehavior: "contain",
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          fontSize: `${sidebarFontSize}px`,
          bgcolor: "rgb(244, 245, 248)",
        },
      }}
    >
      <SidebarHeader open={isExpanded} />

      <Box
        role="navigation"
        aria-label="Main navigation"
        sx={{ ...styles.sectionBox, flexShrink: 0, pb: 0, pt: 0.5 }}
      >
        <List>
          {navigationItems.map((item) => (
            <ListItem key={item.text} disablePadding sx={{ display: "block" }}>
              <Tooltip title={isExpanded ? "" : item.text} placement="right">
                <ListItemButton
                  component={SafeNavigationLink}
                  href={item.path}
                  selected={Boolean(
                    pathname === item.path ||
                      pathname.startsWith(`${item.path}/`),
                  )}
                  sx={{
                    minHeight: NAV_ITEM_MIN_HEIGHT,
                    justifyContent: isExpanded ? "initial" : "center",
                    px: 2.5,
                    "&.Mui-selected": {
                      bgcolor: "action.selected",
                      "&:hover": { bgcolor: "rgba(0, 0, 0, 0.15)" },
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 0,
                      mr: isExpanded ? 2 : "auto",
                      justifyContent: "center",
                      "& .MuiSvgIcon-root": { fontSize: "1.2em" },
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  {isExpanded && (
                    <ListItemText
                      primary={item.text}
                      primaryTypographyProps={{ fontSize: "0.9em" }}
                    />
                  )}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          ))}
        </List>
      </Box>

      {user && (filteredDocuments.length > 0 || seriesMap.size > 0)
        ? (
          <ActivePostsSection
            groupedActivePosts={groupedActivePosts}
            sidebarOpen={isExpanded}
            pathname={pathname}
            itemActions={postItemActions}
          />
        )
        : <Box sx={{ flex: "1 1 auto", minHeight: 0 }} />}

      <Box
        sx={{
          ...styles.userBox,
          flexShrink: 0,
          display: "flex",
          flexDirection: "row",
          borderTop: "1px solid",
          borderColor: "divider",
          alignItems: "center",
          justifyContent: isExpanded ? "space-between" : "center",
          minHeight: USER_ITEM_MIN_HEIGHT,
          px: 1,
        }}
      >
        <Tooltip
          title={isExpanded ? "" : (user ? user.name : "Sign In")}
          placement="right"
        >
          <Box
            component={SafeNavigationLink}
            href={user ? "/dashboard" : "/api/auth/signin"}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              textDecoration: "none",
              color: "inherit",
              borderRadius: 1,
              px: 1.5,
              py: 0.75,
              flex: isExpanded ? "1 1 0" : "0 0 auto",
              minWidth: 0,
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <Avatar
              alt={user?.name}
              src={user?.image ?? undefined}
              sx={{ width: 32, height: 32, flexShrink: 0 }}
            />
            {isExpanded && (
              <Box
                sx={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: "0.9em",
                }}
              >
                {user ? user.name : "Sign In"}
              </Box>
            )}
          </Box>
        </Tooltip>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.25,
            flexShrink: 0,
          }}
        >
          <Tooltip
            title={isFocus ? "Exit focus mode (F)" : "Focus mode (F)"}
            placement="right"
          >
            <IconButton
              size="small"
              onClick={isFocus ? setRead : setFocus}
              aria-label={isFocus ? "Exit focus mode" : "Enter focus mode"}
              sx={{ color: isFocus ? "primary.main" : "text.secondary" }}
            >
              {isFocus ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {isExpanded && !isMobile && (
        <Box
          onMouseDown={startResize}
          sx={{
            position: "fixed",
            top: 0,
            left: getEffectiveWidth() - 4,
            bottom: 0,
            width: 4,
            cursor: "col-resize",
            backgroundColor: isResizing ? "primary.main" : "transparent",
            transition: isResizing ? "none" : "background-color 0.2s",
            "&:hover": { backgroundColor: "primary.main", opacity: 0.5 },
            "&:active": { backgroundColor: "primary.main", opacity: 1 },
            zIndex: 1300,
          }}
        />
      )}

      <PostContextMenu
        contextMenu={contextMenu}
        onClose={handleCloseContextMenu}
        onEdit={handleEditPost}
        onRename={handleRenameFromMenu}
        onDelete={handleDeletePost}
      />
    </Drawer>
  );
};

export default SideBar;
