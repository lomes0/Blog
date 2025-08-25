import { useCallback, useMemo } from "react";
import { useTheme, alpha } from "@mui/material/styles";
import { useMediaQuery } from "@mui/material";

/**
 * Hook for managing grid animations and transitions
 * Provides consistent animation patterns across the grid system
 */
export const useGridAnimations = () => {
  const theme = useTheme();
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  // Base animation configurations
  const animationConfig = useMemo(() => ({
    // Card hover animations
    cardHover: {
      transform: prefersReducedMotion ? "none" : "translateY(-2px) scale(1.02)",
      transition: theme.transitions.create([
        'transform', 'box-shadow', 'filter'
      ], {
        duration: prefersReducedMotion ? 0 : theme.transitions.duration.shorter,
        easing: theme.transitions.easing.easeInOut,
      }),
      boxShadow: `0 8px 25px ${alpha(theme.palette.primary.main, 0.15)}, 0 3px 10px ${alpha(theme.palette.common.black, 0.1)}`,
      filter: prefersReducedMotion ? "none" : "brightness(1.05)",
    },

    // Card focus states
    cardFocus: {
      outline: `3px solid ${alpha(theme.palette.primary.main, 0.3)}`,
      outlineOffset: 2,
      transform: prefersReducedMotion ? "none" : "translateY(-1px)",
      boxShadow: `0 0 0 1px ${theme.palette.primary.main}, 0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}`,
    },

    // Card active states
    cardActive: {
      transform: prefersReducedMotion ? "none" : "translateY(0px) scale(0.98)",
      transition: theme.transitions.create('transform', {
        duration: prefersReducedMotion ? 0 : theme.transitions.duration.shortest,
      }),
    },

    // Staggered entry animation
    staggeredEntry: (index: number, maxDelay = 1000) => ({
      animation: prefersReducedMotion ? "none" : "fadeInUp 0.6s ease-out",
      animationDelay: prefersReducedMotion ? "0s" : `${Math.min(index * 0.1, maxDelay / 1000)}s`,
      animationFillMode: "both",
    }),

    // Shimmer loading animation
    shimmer: {
      background: `linear-gradient(90deg, 
        ${alpha(theme.palette.grey[300], 0.1)} 25%, 
        ${alpha(theme.palette.grey[200], 0.3)} 50%, 
        ${alpha(theme.palette.grey[300], 0.1)} 75%)`,
      backgroundSize: "200% 100%",
      animation: prefersReducedMotion ? "none" : "shimmer 1.8s ease-in-out infinite",
    },

    // Floating animation for empty states
    floating: {
      animation: prefersReducedMotion ? "none" : "float 3s ease-in-out infinite",
    },
  }), [theme, prefersReducedMotion]);

  // Keyframe definitions
  const keyframes = useMemo(() => ({
    "@keyframes fadeInUp": {
      "0%": {
        opacity: 0,
        transform: "translateY(20px)",
      },
      "100%": {
        opacity: 1,
        transform: "translateY(0)",
      },
    },
    "@keyframes shimmer": {
      "0%": {
        backgroundPosition: "-200% 0",
      },
      "100%": {
        backgroundPosition: "200% 0",
      },
    },
    "@keyframes float": {
      "0%, 100%": {
        transform: "translateY(0px)",
      },
      "50%": {
        transform: "translateY(-10px)",
      },
    },
    "@keyframes sweep": {
      "0%": {
        left: "-100%",
      },
      "100%": {
        left: "100%",
      },
    },
  }), []);

  // Animation utilities
  const getCardStyles = useCallback((state: 'default' | 'hover' | 'focus' | 'active' = 'default') => {
    const baseStyles = {
      height: "100%",
      transformOrigin: "center",
      ...keyframes,
    };

    switch (state) {
      case 'hover':
        return { ...baseStyles, "&:hover": animationConfig.cardHover };
      case 'focus':
        return { ...baseStyles, "&:focus-within": animationConfig.cardFocus };
      case 'active':
        return { ...baseStyles, "&:active": animationConfig.cardActive };
      default:
        return {
          ...baseStyles,
          "&:hover": animationConfig.cardHover,
          "&:focus-within": animationConfig.cardFocus,
          "&:active": animationConfig.cardActive,
        };
    }
  }, [animationConfig, keyframes]);

  const getStaggeredStyles = useCallback((index: number, maxDelay?: number) => ({
    ...animationConfig.staggeredEntry(index, maxDelay),
    ...keyframes,
  }), [animationConfig, keyframes]);

  const getShimmerStyles = useCallback(() => ({
    ...animationConfig.shimmer,
    ...keyframes,
  }), [animationConfig, keyframes]);

  const getFloatingStyles = useCallback(() => ({
    ...animationConfig.floating,
    ...keyframes,
  }), [animationConfig, keyframes]);

  return {
    // Pre-configured styles
    cardStyles: getCardStyles(),
    shimmerStyles: getShimmerStyles(),
    floatingStyles: getFloatingStyles(),
    
    // Utility functions
    getCardStyles,
    getStaggeredStyles,
    getShimmerStyles,
    getFloatingStyles,
    
    // Animation state
    prefersReducedMotion,
    
    // Theme integration
    theme,
  };
};

export default useGridAnimations;
