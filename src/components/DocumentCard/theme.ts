import { alpha } from "@mui/material/styles";

/**
 * Simplified card theme for blog posts
 * Removed complex configurations, keeping only essentials
 */
export const cardTheme = {
  // Layout
  borderRadius: 4,
  minHeight: {
    post: "clamp(240px, 18vw, 280px)", // Reduced minimum height
  },
  // Removed maxWidth constraint to allow cards to fill available space

  // Content areas
  contentRatio: {
    top: "70%",
    bottom: "30%",
  },

  // Spacing (8px grid system)
  spacing: {
    contentPadding: 2,
    chipGap: 0.75,
    titleMargin: 1,
  },

  // Typography
  typography: {
    titleSize: "1.125rem",
    titleWeight: 600,
    titleLineHeight: 1.3,
  },

  // Colors - simplified palette
  colors: {
    border: "divider",
    cardBackground: "background.paper",
    shadow: {
      default: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
      hover: "0 4px 12px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)",
      focus: "0 0 0 3px rgba(25,118,210,0.3)",
    },
    // Status colors for blog posts
    status: {
      draft: {
        bg: "#fff3e0",
        border: "#ff9800",
        text: "#f57c00",
      },
      published: {
        bg: "#e8f5e8",
        border: "#4caf50",
        text: "#2e7d32",
      },
    },
    // Series colors
    series: {
      bg: "#f3e5f5",
      border: "#9c27b0",
      text: "#7b1fa2",
    },
  },

  // Animation - simplified
  animation: {
    transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
    hoverTransform: "translateY(-2px)",
  },

  // Action bar
  actionBar: {
    height: "56px",
    minHeight: "48px",
  },

  // Accessibility
  accessibility: {
    minimumTouchTarget: 44,
    focusRingWidth: 2,
  },
};
