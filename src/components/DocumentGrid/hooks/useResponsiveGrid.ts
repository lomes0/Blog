import { useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import { useMediaQuery } from "@mui/material";

/**
 * Hook for responsive grid layout calculations with improved breakpoint handling
 */
export const useResponsiveGrid = () => {
  const theme = useTheme();

  // More specific breakpoint detection for better responsive behavior
  const isXs = useMediaQuery(theme.breakpoints.only("xs"));
  const isSm = useMediaQuery(theme.breakpoints.only("sm"));
  const isMd = useMediaQuery(theme.breakpoints.only("md"));
  const isLg = useMediaQuery(theme.breakpoints.only("lg"));
  const isXl = useMediaQuery(theme.breakpoints.up("xl"));

  // Container width detection for better column calculation
  const isNarrow = useMediaQuery("(max-width: 480px)");
  const isWide = useMediaQuery("(min-width: 1600px)");
  const isUltraWide = useMediaQuery("(min-width: 2000px)");

  const gridConfig = useMemo(() => {
    // Mobile-first approach with better column distribution and enhanced spacing
    if (isXs || isNarrow) {
      return {
        columns: 1,
        spacing: { xs: 2, sm: 2, md: 2, lg: 2, xl: 2 },
        size: { xs: 12, sm: 12, md: 12, lg: 12, xl: 12 },
        cardHeight: "auto",
        gap: 16,
      };
    }

    if (isSm) {
      return {
        columns: 2,
        spacing: { xs: 2, sm: 3, md: 3, lg: 3, xl: 3 },
        size: { xs: 12, sm: 6, md: 6, lg: 6, xl: 6 },
        cardHeight: "280px",
        gap: 20,
      };
    }

    if (isMd) {
      return {
        columns: 3,
        spacing: { xs: 2, sm: 3, md: 3, lg: 3, xl: 3 },
        size: { xs: 12, sm: 6, md: 4, lg: 4, xl: 4 },
        cardHeight: "300px",
        gap: 24,
      };
    }

    if (isLg) {
      return {
        columns: 4,
        spacing: { xs: 2, sm: 3, md: 3, lg: 3, xl: 4 },
        size: { xs: 12, sm: 6, md: 4, lg: 3, xl: 3 },
        cardHeight: "320px",
        gap: 24,
      };
    }

    // XL and above with dynamic column calculation and better spacing
    if (isUltraWide) {
      return {
        columns: 6,
        spacing: { xs: 2, sm: 3, md: 3, lg: 3, xl: 4 },
        size: { xs: 12, sm: 6, md: 4, lg: 3, xl: 2 },
        cardHeight: "340px",
        gap: 32,
      };
    }

    if (isWide || isXl) {
      return {
        columns: 5,
        spacing: { xs: 2, sm: 3, md: 3, lg: 3, xl: 4 },
        size: { xs: 12, sm: 6, md: 4, lg: 3, xl: 2.4 },
        cardHeight: "340px",
        gap: 28,
      };
    }

    // Default fallback with enhanced spacing
    return {
      columns: 4,
      spacing: { xs: 2, sm: 3, md: 3, lg: 3, xl: 3 },
      size: { xs: 12, sm: 6, md: 4, lg: 3, xl: 3 },
      cardHeight: "320px",
      gap: 24,
    };
  }, [isXs, isSm, isMd, isLg, isXl, isNarrow, isWide, isUltraWide]);

  return {
    ...gridConfig,
    rowHeight: (baseHeight = 340) => baseHeight + gridConfig.gap,
    breakpoints: {
      isXs,
      isSm,
      isMd,
      isLg,
      isXl,
      isNarrow,
      isWide,
      isUltraWide,
    },
  };
};

/**
 * Hook for determining if virtualization should be used based on item count and performance preferences
 */
export const useVirtualization = (itemCount: number, threshold = 50) => {
  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
  );
  const isLowEndDevice = useMediaQuery("(max-width: 768px) and (hover: none)");

  return useMemo(() => {
    // Adjust threshold based on device capabilities
    const adjustedThreshold = isLowEndDevice
      ? Math.max(threshold * 0.6, 20)
      : threshold;

    return {
      shouldVirtualize: itemCount > adjustedThreshold,
      adjustedThreshold,
      isLowEndDevice,
      prefersReducedMotion,
    };
  }, [itemCount, threshold, isLowEndDevice, prefersReducedMotion]);
};
