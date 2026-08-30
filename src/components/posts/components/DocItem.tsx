"use client";
import React from "react";
import { Box, Typography } from "@mui/material";
import RouterLink from "next/link";
import { Post } from "@/types";
import { documentCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";

interface DocItemProps {
  document: Post;
}

/**
 * Individual document item within an expanded series group card.
 *
 * Opens into the workspace in read mode, matching its sibling row on this route
 * (`PostsListView/components/PostRow.tsx`). It used to be a bare `<a>` to
 * `/view/[id]`, which cost a full page load and — once Phase 4 moved that route
 * to `(public)` — dropped the store, the sidebar and any pane layout with it.
 */
const DocItem: React.FC<DocItemProps> = ({ document }) => {
  const doc = document;
  const title = doc?.title || "Untitled";
  const docId = document.id;
  const run = useCommandRun();

  return (
    <Box
      component={RouterLink}
      href={`/edit/${docId}`}
      onClick={(e: React.MouseEvent) => {
        // The card behind this tile expands/collapses on click; that is what the
        // original `stopPropagation` was for and it still has to happen first.
        e.stopPropagation();
        if (
          e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey
        ) return;
        e.preventDefault();
        run(documentCommands.open, { id: docId, mode: "read" });
      }}
      sx={{
        width: "100%",
        flexShrink: 0,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "4px",
        p: 1.5,
        bgcolor: "background.paper",
        textDecoration: "none",
        transition:
          "box-shadow 0.2s ease, border-color 0.2s ease, background-color 0.2s ease",
        "&:hover": {
          bgcolor: "action.hover",
          borderColor: "primary.light",
          boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
        },
      }}
    >
      <Typography
        variant="body2"
        sx={{
          color: "text.primary",
          fontWeight: 500,
          lineHeight: 1.3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </Typography>
    </Box>
  );
};

export default DocItem;
