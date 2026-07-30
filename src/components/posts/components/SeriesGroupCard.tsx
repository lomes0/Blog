"use client";
import React, { memo } from "react";
import {
  Box,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { SxProps, Theme } from "@mui/material/styles";
import { Post, Series, User } from "@/types";
import { createCardTheme } from "@/components/DocumentCard/theme";
import { SHADOW } from "@/theme/tokens";
import { formatFullDate } from "@/utils/dateFormat";
import { useRouter } from "next/navigation";
import { actions, useDispatch } from "@/store";
import { v4 as uuid } from "uuid";
import { useMenuState } from "@/hooks/useMenuState";
import DocItem from "./DocItem";
import { useSeriesGroupState } from "../hooks/useSeriesGroupState";
import { ICON_SIZE } from "@/theme/icons";

interface SeriesGroupCardProps {
  series: Series;
  user?: User;
  posts: Post[];
  collapsible?: boolean;
  defaultExpanded?: boolean;
  showActions?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
  sx?: SxProps<Theme>;
}

function useSeriesGroupActions(series: Series | null | undefined) {
  const router = useRouter();
  const dispatch = useDispatch();
  const { anchorEl, menuOpen, openMenu, closeMenu } = useMenuState();

  const handleOpenMenu = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    openMenu(e);
  };

  const handleEdit = () => {
    closeMenu();
    if (series) router.push(`/series/${series.id}/edit`);
  };

  const handleDelete = async () => {
    closeMenu();
    if (!series) return;
    const alertPayload = {
      title: "Delete Series",
      content: "Delete this series? Posts will not be deleted.",
      actions: [
        { label: "Cancel", id: uuid() },
        { label: "Delete", id: uuid() },
      ],
    };
    const response = await dispatch(actions.alert(alertPayload));
    if (response.payload === alertPayload.actions[1].id) {
      await dispatch(actions.deleteSeries(series.id));
      router.refresh();
    }
  };

  const handleNavigate = () => {
    if (series) router.push(`/posts/${series.id}`);
  };

  return {
    anchorEl,
    menuOpen,
    handleOpenMenu,
    handleCloseMenu: closeMenu,
    handleEdit,
    handleDelete,
    handleNavigate,
  };
}

interface CollapsedViewProps {
  series: Series;
  showActions: boolean;
  isAuthor: boolean;
  menuOpen: boolean;
  onToggle: () => void;
  onMenuOpen: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

function CollapsedView({
  series,
  showActions,
  isAuthor,
  menuOpen,
  onToggle,
  onMenuOpen,
}: CollapsedViewProps) {
  return (
    <Box
      onClick={onToggle}
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        cursor: "pointer",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: 200,
          p: { xs: 2, sm: 3 },
          gap: 1.5,
        }}
      >
        <Typography
          variant="h5"
          component="h2"
          sx={{
            fontWeight: 700,
            fontSize: { xs: "1.25rem", sm: "1.5rem" },
            lineHeight: 1.2,
            color: "text.primary",
            textAlign: "center",
            transition: "color 0.2s ease",
            "&:hover": { color: "primary.main" },
          }}
        >
          {series.title}
        </Typography>
        {series.createdAt && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontWeight: 600 }}
            >
              {formatFullDate(series.createdAt)}
            </Typography>
          </Box>
        )}
      </Box>

      <Box
        sx={{
          px: 2,
          py: 1,
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          borderTop: "1px solid",
          borderColor: "divider",
          backgroundColor: "background.default",
          minHeight: 48,
        }}
      >
        {showActions && isAuthor && (
          <IconButton
            aria-label="Series Actions"
            aria-controls={menuOpen ? "series-menu" : undefined}
            aria-haspopup="true"
            aria-expanded={menuOpen ? "true" : undefined}
            size="small"
            onClick={onMenuOpen}
          >
            <MoreVertical />
          </IconButton>
        )}
      </Box>
    </Box>
  );
}

interface ExpandedViewProps {
  series: Series;
  sortedPosts: Post[];
  collapsible: boolean;
  showActions: boolean;
  isAuthor: boolean;
  menuOpen: boolean;
  onToggle: () => void;
  onCardClick: (e: React.MouseEvent) => void;
  onMenuOpen: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

function ExpandedView({
  series,
  sortedPosts,
  collapsible,
  showActions,
  isAuthor,
  menuOpen,
  onToggle,
  onCardClick,
  onMenuOpen,
}: ExpandedViewProps) {
  return (
    <>
      <Box
        onClick={onCardClick}
        sx={{
          display: "flex",
          flexDirection: "column",
          p: { xs: 2, sm: 3 },
          height: 200,
          overflow: "hidden",
          cursor: "pointer",
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            flex: 1,
            overflowY: "auto",
            "&::-webkit-scrollbar": { width: 4 },
            "&::-webkit-scrollbar-thumb": {
              bgcolor: "divider",
              borderRadius: 2,
            },
          }}
        >
          {sortedPosts.map((doc) => <DocItem key={doc.id} document={doc} />)}
        </Box>
      </Box>

      <Box
        onClick={collapsible ? onToggle : undefined}
        sx={{
          px: 2,
          py: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: "1px solid",
          borderColor: "divider",
          backgroundColor: "background.default",
          minHeight: 48,
          cursor: collapsible ? "pointer" : "default",
          transition: "background-color 0.2s ease",
          ...(collapsible && {
            "&:hover": {
              bgcolor: "rgba(var(--mui-palette-primary-mainChannel) / 0.06)",
            },
          }),
        }}
      >
        <Typography
          variant="body2"
          sx={{ fontWeight: 600, color: "text.primary" }}
        >
          {series.title}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {collapsible && (
            <Typography
              variant="body2"
              sx={{
                color: "primary.main",
                fontWeight: 500,
                fontSize: "0.8rem",
              }}
            >
              Collapse
            </Typography>
          )}
          {showActions && isAuthor && (
            <IconButton
              aria-label="Series Actions"
              aria-controls={menuOpen ? "series-menu" : undefined}
              aria-haspopup="true"
              aria-expanded={menuOpen ? "true" : undefined}
              size="small"
              onClick={onMenuOpen}
            >
              <MoreVertical />
            </IconButton>
          )}
        </Box>
      </Box>
    </>
  );
}

interface SeriesContextMenuProps {
  anchorEl: HTMLElement | null;
  menuOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function SeriesContextMenu({
  anchorEl,
  menuOpen,
  onClose,
  onEdit,
  onDelete,
}: SeriesContextMenuProps) {
  return (
    <Menu
      id="series-menu"
      anchorEl={anchorEl}
      open={menuOpen}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
    >
      <MenuItem onClick={onEdit}>
        <ListItemIcon>
          <Pencil size={ICON_SIZE.dense} />
        </ListItemIcon>
        <ListItemText>Edit</ListItemText>
      </MenuItem>
      <MenuItem onClick={onDelete} sx={{ color: "error.main" }}>
        <ListItemIcon>
          <Trash2
            size={ICON_SIZE.dense}
            style={{ color: "var(--mui-palette-error-main)" }}
          />
        </ListItemIcon>
        <ListItemText>Delete</ListItemText>
      </MenuItem>
    </Menu>
  );
}

/**
 * Collapsible card for a series group in the posts grid.
 *
 * - Collapsed: series title centered (click to expand)
 * - Expanded: scrollable list of posts with series title in footer
 */
const SeriesGroupCard: React.FC<SeriesGroupCardProps> = memo(({
  series,
  posts,
  user,
  showActions = true,
  collapsible = true,
  defaultExpanded = false,
  onExpand,
  onCollapse,
  sx,
}) => {
  const theme = useTheme();
  const cardTheme = createCardTheme(theme);
  const isAuthor = !!user && user.id === series.authorId;

  const { isCollapsed, sortedPosts, handleToggle, handleCardClick } =
    useSeriesGroupState(
      posts,
      defaultExpanded,
      series.id,
      onExpand,
      onCollapse,
    );

  const {
    anchorEl,
    menuOpen,
    handleOpenMenu,
    handleCloseMenu,
    handleEdit,
    handleDelete,
    handleNavigate,
  } = useSeriesGroupActions(series);

  const isEmpty = posts.length === 0;
  const showCollapsed = isEmpty || (isCollapsed && collapsible);

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        borderRadius: 2,
        border: "2px solid",
        borderColor: cardTheme.colors.border,
        bgcolor: cardTheme.colors.cardBackground,
        transition: "box-shadow 0.2s ease, border-color 0.2s ease",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        "&:hover": {
          boxShadow: SHADOW.card.hover,
          borderColor: "primary.light",
        },
        "&:focus-within": {
          boxShadow:
            "0 0 0 2px rgba(var(--mui-palette-primary-mainChannel) / 0.2)",
          borderColor: "primary.main",
        },
        ...sx,
      }}
    >
      {showCollapsed
        ? (
          <CollapsedView
            series={series}
            showActions={showActions}
            isAuthor={isAuthor}
            menuOpen={menuOpen}
            onToggle={isEmpty ? handleNavigate : handleToggle}
            onMenuOpen={handleOpenMenu}
          />
        )
        : (
          <ExpandedView
            series={series}
            sortedPosts={sortedPosts}
            collapsible={collapsible}
            showActions={showActions}
            isAuthor={isAuthor}
            menuOpen={menuOpen}
            onToggle={handleToggle}
            onCardClick={handleCardClick}
            onMenuOpen={handleOpenMenu}
          />
        )}

      <SeriesContextMenu
        anchorEl={anchorEl}
        menuOpen={menuOpen}
        onClose={handleCloseMenu}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </Box>
  );
});

SeriesGroupCard.displayName = "SeriesGroupCard";

export default SeriesGroupCard;
