"use client";
import { Box, Divider, Typography } from "@mui/material";
import { postsSelectors, useSelector } from "@/store";
import type { RootState } from "@/store";
import { shallowEqual } from "react-redux";

interface DocumentHeaderProps {
  docId: string;
  rootId: string;
}

export default function DocumentHeader({
  docId,
}: DocumentHeaderProps) {
  const { name } = useSelector(
    (state: RootState) => {
      const post = postsSelectors.selectById(state, docId);
      return {
        // Show this tab's own label when set (root tab can differ from the post
        // title); otherwise fall back to the post/document name.
        name: post?.tabLabel ?? post?.name ?? "Untitled",
      };
    },
    shallowEqual,
  );

  // pb keeps the editor's first line clear of the divider — `.editor-input` has
  // no top padding and the first paragraph no top margin, so without it the
  // caret sits flush against the rule and reads as part of the title.
  return (
    <Box sx={{ pt: 2, pb: 3 }}>
      <Typography
        variant="h4"
        component="h1"
        sx={{ fontWeight: 700, lineHeight: 1.1, mb: 2 }}
      >
        {name}
      </Typography>
      <Divider />
    </Box>
  );
}
