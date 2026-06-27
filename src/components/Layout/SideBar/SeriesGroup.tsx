import React from "react";
import {
  Box,
  Collapse,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from "@mui/material";
import { ChevronRight } from "lucide-react";
import type { Series } from "@/types";
import type { SeriesGroupItem } from "@/utils/posts/seriesGrouping";
import type { PostItemActions } from "./hooks/useSidebarActions";
import { PostItem } from "./PostItem";
import { SafeNavigationLink } from "./SafeNavigationLink";
import { CHEVRON_TRANSITION } from "./constants";
import { ICON_SIZE } from "@/theme/icons";

interface SeriesGroupProps {
  group: SeriesGroupItem & { series: Series };
  groupIndex: number;
  isExpanded: boolean;
  onToggle: () => void;
  sidebarOpen: boolean;
  pathname: string;
  itemActions: PostItemActions;
}

export const SeriesGroup: React.FC<SeriesGroupProps> = ({
  group,
  groupIndex,
  isExpanded,
  onToggle,
  sidebarOpen,
  pathname,
  itemActions,
}) => {
  const hasAnyDirtyChild = group.posts.some(
    (post) =>
      Boolean(post.local) &&
      Boolean(post.cloud) &&
      post.local!.head !== post.cloud!.head,
  );

  return (
    <Box sx={{ mt: groupIndex > 0 ? 0.5 : 0, mb: 0.5 }}>
      <ListItem disablePadding sx={{ display: "block" }}>
        <Tooltip
          title={sidebarOpen ? "" : group.series.title}
          placement="right"
        >
          <ListItemButton
            component={SafeNavigationLink}
            href={`/posts/${group.series.id}`}
            sx={{
              minHeight: 26,
              justifyContent: sidebarOpen ? "initial" : "center",
              px: 2,
              py: 0.25,
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <ListItemIcon
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggle();
              }}
              sx={{
                minWidth: 0,
                mr: 0.5,
                justifyContent: "center",
                cursor: "pointer",
                // Single chevron rotated 0deg -> 90deg on expand (design spec),
                // rather than swapping two glyphs.
                "& > svg": {
                  transition: CHEVRON_TRANSITION,
                  transform: isExpanded ? "rotate(90deg)" : "none",
                },
              }}
            >
              <ChevronRight size={ICON_SIZE.inline} strokeWidth={2} />
            </ListItemIcon>
            {sidebarOpen && (
              <ListItemText
                primary={
                  <Box
                    component="span"
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      width: "100%",
                      minWidth: 0,
                    }}
                  >
                    <Box
                      component="span"
                      sx={{
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {group.series.title}
                    </Box>
                    <Box
                      component="span"
                      sx={{
                        ml: "auto",
                        pl: 1,
                        flexShrink: 0,
                        fontSize: "0.9em",
                        color: "text.disabled",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {group.posts.length > 99 ? "99+" : group.posts.length}
                    </Box>
                  </Box>
                }
                primaryTypographyProps={{
                  component: "span",
                  fontSize: "0.7em",
                  // Mirror the doc-row sync decoration (color only, no weight
                  // bump): a series with modified children reads amber.
                  fontWeight: 500,
                  color: hasAnyDirtyChild ? "warning.main" : "text.secondary",
                  sx: { display: "block", minWidth: 0, width: "100%" },
                }}
              />
            )}
          </ListItemButton>
        </Tooltip>
      </ListItem>

      <Collapse in={isExpanded} timeout="auto">
        <Box
          sx={{
            ml: sidebarOpen ? 2.5 : 0,
            borderLeft: sidebarOpen ? "2px solid" : "none",
            borderLeftColor: "divider",
          }}
        >
          {group.posts.map((post) => (
            <PostItem
              key={post.id}
              post={post}
              inSeries
              sidebarOpen={sidebarOpen}
              pathname={pathname}
              itemActions={itemActions}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
};
