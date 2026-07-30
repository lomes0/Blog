"use client";
import { useRouter } from "next/navigation";
import { Box, ListItemButton, Typography } from "@mui/material";
import { FileText } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";
import { MONO_FONT } from "@/components/Layout/SideBar/constants";
import {
  chromeFocusRingSx,
  ROW_TRANSITION,
  TREE_ROW_RADIUS,
} from "@/theme/treeRow";
import { HOME_COLUMN_W } from "./layout";
import { useRecentPosts } from "./useRecentPosts";

/** "14m" · "2h" · "4d" — the compact form the row's meta column has room for. */
const relativeTime = (epochMs: number, now: number): string => {
  const mins = Math.floor((now - epochMs) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d`;
  return `${Math.floor(days / 365)}y`;
};

/**
 * The home pane's recents list — the lower third that keeps the route from
 * reading as an empty state.
 *
 * Renders nothing at all when there are no posts. A brand-new workspace gets
 * the composer alone rather than a labelled empty list, which would announce
 * the emptiness the section exists to hide.
 */
const JumpBackIn: React.FC = () => {
  const router = useRouter();
  const recents = useRecentPosts();

  // Safe to read the clock during render: `AppLayoutContent` mounts every route
  // inside `HydrationManager`, which renders nothing until hydration completes,
  // so this component's first render is already client-side. Reading it here
  // rather than from state keeps the times fresh across re-renders.
  const now = Date.now();

  if (recents.length === 0) return null;

  return (
    <Box
      component="section"
      aria-labelledby="jump-back-in-label"
      sx={{
        width: HOME_COLUMN_W,
        maxWidth: "100%",
        display: "flex",
        flexDirection: "column",
        mt: 1,
      }}
    >
      <Typography
        id="jump-back-in-label"
        component="h2"
        variant="overline"
        sx={{ color: "text.secondary", px: 0.5, pb: 0.5 }}
      >
        Jump back in
      </Typography>

      {recents.map((post) => (
        <ListItemButton
          key={post.id}
          onClick={() => router.push(`/edit/${post.id}`)}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: 1,
            py: 0.75,
            borderRadius: TREE_ROW_RADIUS,
            transition: ROW_TRANSITION,
            ...chromeFocusRingSx(),
          }}
        >
          <FileText
            size={ICON_SIZE.inline}
            style={{
              color: "var(--mui-palette-text-secondary)",
              flexShrink: 0,
            }}
          />
          <Typography
            noWrap
            variant="dense"
            sx={{ flex: 1, minWidth: 0, color: "text.primary" }}
          >
            {post.title}
          </Typography>
          {post.series && (
            <Typography
              noWrap
              variant="micro"
              sx={{
                fontFamily: MONO_FONT,
                color: "text.secondary",
                flexShrink: 0,
                maxWidth: "35%",
              }}
            >
              {post.series}
            </Typography>
          )}
          <Typography
            variant="micro"
            sx={{
              color: "text.secondary",
              width: 40,
              textAlign: "right",
              flexShrink: 0,
            }}
          >
            {relativeTime(post.updatedAt, now)}
          </Typography>
        </ListItemButton>
      ))}
    </Box>
  );
};

export default JumpBackIn;
