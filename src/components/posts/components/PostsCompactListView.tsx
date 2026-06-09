"use client";
import React, { useState } from "react";
import {
  Box,
  Collapse,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { ChevronRight, Trash2 } from "lucide-react";
import { Series, User, UserDocument } from "@/types";
import { actions, useDispatch } from "@/store";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import PostCompactListItem from "./PostCompactListItem";
import { SeriesGroupItem } from "@/utils/posts/seriesGrouping";
import { useExpandedState } from "@/hooks/useExpandedState";
import { PendingTimeChange } from "@/types/posts";
import { ICON_SIZE } from "@/theme/icons";

const deleteIconSx = {
  color: "text.disabled",
  "&:hover": { color: "error.main" },
} as const;

interface PostsCompactListViewProps {
  posts?: UserDocument[];
  groups?: SeriesGroupItem[];
  user?: User;
  isTimeEditMode?: boolean;
  pendingChanges?: Map<string, PendingTimeChange>;
  onTimeAdjust?: (postId: string, originalDate: Date, days: number) => void;
  onTimeReset?: (postId: string) => void;
}

/**
 * Compact list view for posts.
 * When `groups` is provided, renders series as collapsible header rows with
 * indented doc rows beneath them. Falls back to a flat list when only `posts`
 * is supplied (used by PostsTimeSection).
 */
export const PostsCompactListView: React.FC<PostsCompactListViewProps> = ({
  posts = [],
  groups,
  user,
  isTimeEditMode = false,
  pendingChanges = new Map(),
  onTimeAdjust,
  onTimeReset,
}) => {
  const router = useRouter();
  const dispatch = useDispatch();
  const [editingNames, setEditingNames] = useState<Map<string, string>>(
    new Map(),
  );

  const { expandedSeries, toggleSeries } = useExpandedState(
    "seriesViewExpandedState",
  );

  const handleRenameCommit = async (
    postId: string,
    documentId: string,
    originalName: string,
  ) => {
    const newName = editingNames.get(postId)?.trim();
    setEditingNames((prev) => {
      const m = new Map(prev);
      m.delete(postId);
      return m;
    });
    if (!newName || newName === originalName) return;
    await dispatch(
      actions.updateCloudDocument({
        id: documentId,
        partial: { name: newName },
      }),
    );
    router.refresh();
  };

  const handleDeleteSeries = async (seriesId: string, seriesTitle: string) => {
    const alertPayload = {
      title: "Delete Series",
      content: `Delete "${seriesTitle}"? Posts will not be deleted.`,
      actions: [
        { label: "Cancel", id: uuid() },
        { label: "Delete", id: uuid() },
      ],
    };
    const response = await dispatch(actions.alert(alertPayload));
    if (response.payload === alertPayload.actions[1].id) {
      await dispatch(actions.deleteSeries(seriesId));
      router.refresh();
    }
  };

  const handleDelete = async (post: UserDocument) => {
    const name = post.cloud?.name || post.local?.name || "This post";
    const alertPayload = {
      title: "Delete Post",
      content:
        `Are you sure you want to delete "${name}"? This cannot be undone.`,
      actions: [
        { label: "Cancel", id: uuid() },
        { label: "Delete", id: uuid() },
      ],
    };
    const response = await dispatch(actions.alert(alertPayload));
    if (response.payload === alertPayload.actions[1].id) {
      if (post.cloud) await dispatch(actions.deleteCloudDocument(post.id));
      if (post.local) await dispatch(actions.deleteLocalDocument(post.id));
      router.refresh();
    }
  };

  const listSx = {
    width: "100%",
    bgcolor: "transparent",
    p: 0,
    display: "flex",
    flexDirection: "column" as const,
    gap: 0.5,
  };

  const renderSeriesRow = (
    series: Series,
    postCount: number,
    isExpanded: boolean,
    isAuthor: boolean,
    posts: UserDocument[],
  ) => (
    <Box key={`series-${series.id}`}>
      <ListItem
        disablePadding
        secondaryAction={isAuthor && (
          <Tooltip title="Delete series">
            <IconButton
              edge="end"
              size="small"
              onClick={() => handleDeleteSeries(series.id, series.title)}
              sx={deleteIconSx}
            >
              <Trash2 size={ICON_SIZE.dense} />
            </IconButton>
          </Tooltip>
        )}
        sx={{
          "&:hover": { bgcolor: "action.hover" },
          transition: "background-color 0.2s ease",
        }}
      >
        <ListItemButton
          onClick={() => toggleSeries(series.id)}
          sx={{
            py: 1.25,
            pl: 0,
            pr: 2,
            display: "flex",
            alignItems: "center",
            gap: 1,
            "&:hover": { bgcolor: "transparent" },
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <ChevronRight
                size={ICON_SIZE.dense}
                style={{
                  color: "var(--mui-palette-text-secondary)",
                  flexShrink: 0,
                  transition: "transform 0.2s ease",
                  transform: isExpanded ? "rotate(90deg)" : "none",
                }}
              />
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  letterSpacing: "-0.01em",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {series.title}
              </Typography>
            </Box>
            <Typography
              variant="caption"
              sx={{
                color: "text.disabled",
                pl: "26px",
              }}
            >
              series · {postCount} {postCount === 1 ? "post" : "posts"}
            </Typography>
          </Box>
        </ListItemButton>
      </ListItem>

      <Collapse in={isExpanded} unmountOnExit>
        <Box
          sx={{
            mb: 0.5,
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
            borderLeft: "2px solid",
            borderColor: "divider",
            transition: "border-color 0.2s ease",
          }}
        >
          {posts.map((p) => renderPostItem(p, 2))}
        </Box>
      </Collapse>
    </Box>
  );

  const renderPostItem = (post: UserDocument, extraIndent = 0) => (
    <PostCompactListItem
      key={post.id}
      post={post}
      user={user}
      extraIndent={extraIndent}
      isTimeEditMode={isTimeEditMode}
      pendingChange={pendingChanges.get(post.id)}
      editingName={editingNames.get(post.id)}
      onNameChange={(postId, value) =>
        setEditingNames((prev) => new Map(prev).set(postId, value))}
      onNameCommit={handleRenameCommit}
      onNameCancel={(postId) => {
        setEditingNames((prev) => {
          const m = new Map(prev);
          m.delete(postId);
          return m;
        });
      }}
      onTimeAdjust={onTimeAdjust}
      onTimeReset={onTimeReset}
      onDelete={handleDelete}
    />
  );

  // Group-aware rendering (used by PostsGrid compact mode)
  if (groups !== undefined) {
    if (groups.length === 0) return null;
    return (
      <Box sx={{ width: "100%" }}>
        <List sx={listSx}>
          {groups.map((group) => {
            if (group.type === "series" && group.series) {
              const { series, posts: groupPosts } = group;
              const postCount = groupPosts.length;
              const isExpanded = expandedSeries.has(series.id);
              const isAuthor = !!user && user.id === series.authorId;
              return renderSeriesRow(
                series,
                postCount,
                isExpanded,
                isAuthor,
                groupPosts,
              );
            }
            const post = group.posts[0];
            if (!post) return null;
            return renderPostItem(post);
          })}
        </List>
      </Box>
    );
  }

  // Flat list fallback (used by PostsTimeSection)
  if (posts.length === 0) return null;

  return (
    <Box sx={{ width: "100%" }}>
      <List sx={listSx}>
        {posts.map((p) => renderPostItem(p))}
      </List>
    </Box>
  );
};
