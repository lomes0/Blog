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
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Series } from "@/types";
import type { SeriesGroupItem } from "@/utils/posts/seriesGrouping";
import type { PostItemActions } from "./hooks/useSidebarActions";
import { PostItem } from "./PostItem";
import { SafeNavigationLink } from "./SafeNavigationLink";

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
              }}
            >
              {isExpanded
                ? <ChevronDown size={14} strokeWidth={2} />
                : <ChevronRight size={14} strokeWidth={2} />}
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
                    {hasAnyDirtyChild && (
                      <Box
                        component="span"
                        sx={{
                          flexShrink: 0,
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          bgcolor: "primary.main",
                          mr: 0.5,
                        }}
                      />
                    )}
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
                      }}
                    >
                      {group.posts.length}
                    </Box>
                  </Box>
                }
                primaryTypographyProps={{
                  component: "span",
                  fontSize: "0.7em",
                  fontWeight: 500,
                  color: "text.secondary",
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
