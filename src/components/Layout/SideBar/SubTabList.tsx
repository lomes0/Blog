"use client";
import React from "react";
import { Box } from "@mui/material";
import { actions, useDispatch } from "@/store";
import { SafeNavigationLink } from "./SafeNavigationLink";

export interface SubTabEntry {
  id: string;
  name: string;
  dirty: boolean;
}

interface SubTabListProps {
  tabs: SubTabEntry[];
  activeTabId: string | null;
  /**
   * Whether the parent post is the document currently open in the editor/viewer.
   * When true, clicking a tab switches the active tab in place (driven by the
   * shared `ui.tabs` store). When false the post isn't open, so a click
   * navigates to that tab's document instead.
   */
  isOpenRoot: boolean;
}

export const SubTabList: React.FC<SubTabListProps> = (
  { tabs, activeTabId, isOpenRoot },
) => {
  const dispatch = useDispatch();

  return (
    <Box
      component="ul"
      aria-label="Sub-document tabs"
      sx={{
        listStyle: "none",
        p: 0,
        m: 0,
        pl: "14px",
        ml: "12px",
        mb: 0.5,
      }}
    >
      {tabs.map((tab) => {
        const isActive = isOpenRoot && tab.id === activeTabId;
        const interactionProps = isOpenRoot
          ? {
            role: "button",
            tabIndex: 0,
            onClick: () => dispatch(actions.setActiveTab(tab.id)),
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                dispatch(actions.setActiveTab(tab.id));
              }
            },
          }
          : {
            component: SafeNavigationLink,
            href: `/view/${tab.id}`,
          };
        return (
          <Box
            key={tab.id}
            component="li"
            {...interactionProps}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              py: "3px",
              px: "7px",
              borderRadius: "5px",
              fontSize: "0.72em",
              cursor: "pointer",
              color: "text.secondary",
              textDecoration: "none",
              fontWeight: 400,
              bgcolor: isActive ? "action.selected" : "transparent",
              "&:hover": {
                bgcolor: "action.hover",
              },
            }}
          >
            <Box
              component="span"
              aria-hidden
              sx={{
                width: 6,
                height: 6,
                borderRadius: "2px",
                flexShrink: 0,
                bgcolor: "text.disabled",
              }}
            />
            <Box
              component="span"
              sx={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}
            >
              {tab.name}
            </Box>
            {tab.dirty && (
              <Box
                component="span"
                aria-label="Unsaved"
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  bgcolor: "warning.main",
                  flexShrink: 0,
                }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
};
