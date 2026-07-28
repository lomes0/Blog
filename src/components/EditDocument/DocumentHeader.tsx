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

  return (
    <Box sx={{ pt: 2, pb: 0 }}>
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
