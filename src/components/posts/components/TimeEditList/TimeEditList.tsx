"use client";
import React from "react";
import { Box, List } from "@mui/material";
import { Post } from "@/types";
import { actions, useDispatch } from "@/store";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import TimeEditRow from "./TimeEditRow";
import { useInlineRename } from "@/hooks/useInlineRename";
import { PendingTimeChange } from "@/types/posts";

interface TimeEditListProps {
  posts: Post[];
  pendingChanges?: Map<string, PendingTimeChange>;
  /** Omitted when the viewer may not edit the series — rows hide their stepper. */
  onTimeAdjust?: (postId: string, originalDate: Date, days: number) => void;
  onTimeReset?: (postId: string) => void;
}

/**
 * The series time-editing list: one flat, date-sorted row per post, each with an
 * inline title field and a day/week/month stepper for its publication date.
 *
 * This is the *only* surface it serves — `PostsView` renders it in series mode
 * under compact view while time-edit mode is on, and `PostsListView` handles
 * every other list. Reordering, selection, drag and the series/post interleave
 * all live there; deliberately none of it is duplicated here.
 */
export const TimeEditList: React.FC<TimeEditListProps> = ({
  posts,
  pendingChanges = new Map(),
  onTimeAdjust,
  onTimeReset,
}) => {
  const router = useRouter();
  const dispatch = useDispatch();

  // One shared rename machine, so a single row across the list is open at a time.
  const rename = useInlineRename<Post, undefined>({
    items: posts,
    getId: (post) => post.id,
    getTitle: (post) => post.title || "",
    onCommit: (post, title) => {
      dispatch(actions.updatePost({ id: post.id, partial: { title } }));
      router.refresh();
    },
    initialContext: undefined,
  });

  const handleDelete = async (post: Post) => {
    const name = post.title || "This post";
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
      await dispatch(actions.deletePost(post.id));
      router.refresh();
    }
  };

  if (posts.length === 0) return null;

  return (
    <Box sx={{ width: "100%" }}>
      <List
        sx={{
          width: "100%",
          bgcolor: "transparent",
          p: 0,
          display: "flex",
          flexDirection: "column",
          gap: 0.5,
        }}
      >
        {posts.map((post) => (
          <TimeEditRow
            key={post.id}
            post={post}
            pendingChange={pendingChanges.get(post.id)}
            rename={rename}
            onTimeAdjust={onTimeAdjust}
            onTimeReset={onTimeReset}
            onDelete={handleDelete}
          />
        ))}
      </List>
    </Box>
  );
};
