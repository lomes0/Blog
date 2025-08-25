import { alpha } from "@mui/material/styles";

/**
 * Blog-oriented card theme with clean, magazine-style design
 * Optimized for content readability and visual hierarchy
 */
export const cardTheme = {
  // Layout - blog-style proportions
  borderRadius: 8, // Softer corners for a modern blog feel
  minHeight: {
    post: "360px", // Taller cards for better content display
  },
  maxHeight: {
    post: "420px", // Consistent maximum height
  },
  aspectRatio: "4:5", // Portrait orientation for blog content

  // Content areas - optimized for blog content
  contentRatio: {
    top: "65%", // More space for content preview
    bottom: "35%", // Adequate space for metadata
  },

  // Spacing - generous for readability
  spacing: {
    contentPadding: 3, // More padding for better text readability
    chipGap: 1,
    titleMargin: 1.5,
    sectionGap: 2,
  },

  // Typography - blog-optimized
  typography: {
    titleSize: "1.25rem", // Larger titles for impact
    titleWeight: 700, // Bold titles for hierarchy
    titleLineHeight: 1.2, // Tight line height for headlines
    excerptSize: "0.875rem", // Readable excerpt text
    excerptLineHeight: 1.5, // Good line height for body text
    metaSize: "0.75rem", // Smaller metadata text
  },

  // Colors - refined blog palette
  colors: {
    border: "divider",
    cardBackground: "background.paper",
    textPrimary: "text.primary",
    textSecondary: "text.secondary",
    
    // Shadows for depth and hierarchy
    shadow: {
      default: "0 2px 8px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)",
      hover: "0 8px 24px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.08)",
      focus: "0 0 0 3px rgba(25,118,210,0.2)",
    },
    
    // Status colors for blog posts
    status: {
      draft: {
        bg: "#fef3e2",
        border: "#f59e0b",
        text: "#d97706",
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
