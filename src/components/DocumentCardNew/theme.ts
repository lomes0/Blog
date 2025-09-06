import { alpha } from "@mui/material/styles";

/**
 * Modern blog-oriented card theme with magazine-style design
 * Focused on readability, visual hierarchy, and contemporary aesthetics
 */
export const cardTheme = {
  // Layout - modern blog proportions with better aspect ratios
  borderRadius: 6, // Reduced from 12px for less rounded appearance
  minHeight: {
    post: "380px", // Slightly taller for better content display
  },
  maxHeight: {
    post: "450px", // Increased for more content space
  },
  aspectRatio: "3:4", // Better proportion for blog content

  // Content areas - optimized for modern blog layout
  contentRatio: {
    top: "70%", // More emphasis on content preview
    bottom: "30%", // Streamlined metadata area
  },

  // Spacing - refined for modern design
  spacing: {
    contentPadding: 3.5, // Increased padding for better breathing room
    chipGap: 1.25,
    titleMargin: 2,
    sectionGap: 2.5,
    cardGap: 2, // Gap between cards in grid
  },

  // Typography - modern blog hierarchy
  typography: {
    titleSize: "1.375rem", // Larger, more impactful titles
    titleWeight: 600, // Slightly lighter for modern feel
    titleLineHeight: 1.25, // Optimal line height for readability
    excerptSize: "0.9rem", // Slightly larger for better readability
    excerptLineHeight: 1.6, // Improved line spacing
    metaSize: "0.8rem", // Better metadata readability
    authorSize: "0.85rem", // Distinct author text size
  },

  // Colors - modern blog palette with subtle gradients
  colors: {
    border: "divider",
    cardBackground: "background.paper",
    textPrimary: "text.primary",
    textSecondary: "text.secondary",

    // Enhanced shadows with subtle depth
    shadow: {
      default: "0 4px 12px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)",
      hover: "0 12px 32px rgba(0,0,0,0.15), 0 6px 16px rgba(0,0,0,0.1)",
      focus: "0 0 0 3px rgba(59,130,246,0.25)", // Modern blue focus ring
    },

    // Refined status colors with better contrast
    status: {
      draft: {
        bg: "linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%)",
        border: "#f97316",
        text: "#ea580c",
        icon: "#f97316",
      },
      published: {
        bg: "linear-gradient(135deg, #f0fdf4 0%, #bbf7d0 100%)",
        border: "#22c55e",
        text: "#16a34a",
        icon: "#22c55e",
      },
    },

    // Enhanced series colors
    series: {
      bg: "linear-gradient(135deg, #faf5ff 0%, #e9d5ff 100%)",
      border: "#a855f7",
      text: "#9333ea",
      icon: "#a855f7",
    },

    // Author chip colors
    author: {
      bg: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)",
      border: "#64748b",
      text: "#475569",
    },

    // Hover states
    hover: {
      cardBackground: "#fafbfc",
      borderColor: "#e5e7eb",
    },
  },

  // Simplified animations (removed)
  animation: {
    transition: "none", // Animations disabled
    hoverTransform: "none",
    hoverDuration: "0ms",
    focusTransition: "none",
  },

  // Simplified action bar design
  actionBar: {
    height: "48px", // Content height
    totalHeight: "60px", // Content height + padding (48px + 12px)
    minHeight: "40px", // Reduced minimum height
    backgroundColor: "transparent", // No background
    backdropFilter: "none", // No backdrop filter
    borderTop: "1px solid rgba(226, 232, 240, 0.6)",
  },

  // Enhanced accessibility
  accessibility: {
    minimumTouchTarget: 48, // Larger touch targets
    focusRingWidth: 3,
    focusRingOffset: 2,
  },

  // Image handling for blog posts
  image: {
    aspectRatio: "16:9",
    borderRadius: 4, // Reduced from 8px for less rounded images
    objectFit: "cover",
    fallbackBackground: "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)",
  },
};
