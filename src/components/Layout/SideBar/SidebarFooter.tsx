"use client";
import React from "react";
import { Avatar, Box, Tooltip } from "@mui/material";
import { type RootState, useSelector } from "@/store";
import { styles } from "../styles";
import { SafeNavigationLink } from "./SafeNavigationLink";

const USER_ITEM_MIN_HEIGHT = 40;

interface SidebarFooterProps {
  expanded: boolean;
}

/** User row (avatar + name). Collapses to a centered avatar. */
export const SidebarFooter: React.FC<SidebarFooterProps> = ({ expanded }) => {
  const user = useSelector((state: RootState) => state.user);

  return (
    <Box
      sx={{
        ...styles.userBox,
        flexShrink: 0,
        display: "flex",
        flexDirection: "row",
        borderTop: "1px solid",
        borderColor: "divider",
        alignItems: "center",
        justifyContent: "center",
        minHeight: USER_ITEM_MIN_HEIGHT,
        px: 1,
      }}
    >
      <Tooltip
        title={expanded ? "" : (user ? user.name : "Sign In")}
        placement="right"
      >
        <Box
          component={SafeNavigationLink}
          href={user ? "/dashboard" : "/api/auth/signin"}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            textDecoration: "none",
            color: "inherit",
            borderRadius: 1,
            px: 1.5,
            py: 0.75,
            flex: expanded ? "1 1 0" : "0 0 auto",
            minWidth: 0,
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          <Avatar
            alt={user?.name}
            src={user?.image ?? undefined}
            sx={{ width: 32, height: 32, flexShrink: 0 }}
          />
          {expanded && (
            <Box
              sx={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "0.9em",
              }}
            >
              {user ? user.name : "Sign In"}
            </Box>
          )}
        </Box>
      </Tooltip>
    </Box>
  );
};
