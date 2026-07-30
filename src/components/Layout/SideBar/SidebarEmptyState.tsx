"use client";
import React from "react";
import { Box, Button, Typography } from "@mui/material";
import { FilePlus, FolderPlus } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";
import { SB_FONT } from "./constants";

interface SidebarEmptyStateProps {
  onNewPost: () => void;
  /** Omitted for guests, who have no series — see `lib/capabilities`. */
  onNewSeries?: () => void;
}

/**
 * What the explorer shows before there is anything to explore.
 *
 * The tree's create affordances hang off its section headers, and those only
 * render alongside content — so without this a new account opens to a blank
 * rectangle with no way to make the first post from the sidebar at all. The
 * empty state is therefore the create surface, not a decoration.
 */
export const SidebarEmptyState: React.FC<SidebarEmptyStateProps> = ({
  onNewPost,
  onNewSeries,
}) => (
  <Box
    sx={{
      flex: "1 1 auto",
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      gap: 1,
      px: 2,
      py: 3,
    }}
  >
    <Typography
      sx={{
        fontSize: SB_FONT.meta,
        color: "text.disabled",
        textAlign: "center",
        mb: 0.5,
      }}
    >
      Nothing here yet
    </Typography>

    <Button
      size="small"
      variant="outlined"
      onClick={onNewPost}
      startIcon={<FilePlus size={ICON_SIZE.inline} strokeWidth={2} />}
      sx={{ fontSize: SB_FONT.meta, textTransform: "none" }}
    >
      New post
    </Button>

    {onNewSeries && (
      <Button
        size="small"
        variant="text"
        onClick={onNewSeries}
        startIcon={<FolderPlus size={ICON_SIZE.inline} strokeWidth={2} />}
        sx={{
          fontSize: SB_FONT.meta,
          textTransform: "none",
          color: "text.secondary",
        }}
      >
        New series
      </Button>
    )}
  </Box>
);
