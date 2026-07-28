/**
 * Type definitions for DocumentGrid component and related utilities
 */

import type { Post } from "@/types";

export interface GridBreakpointInfo {
  isXs: boolean;
  isSm: boolean;
  isMd: boolean;
  isLg: boolean;
  isXl: boolean;
}

export interface GridSizing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

export interface ResponsiveGridReturn {
  gridSizing: GridSizing;
  breakpointInfo: GridBreakpointInfo;
}

export interface PerformanceMetrics {
  renderCount: number;
  lastRenderTime: number;
  averageRenderTime: number;
}

export interface DocumentGridErrorProps {
  error?: Error | string | null;
  onRetry?: () => void;
  message?: string;
  showRetry?: boolean;
}

export interface DocumentGridConfig {
  virtualizationThreshold?: number;
  enableVirtualization?: boolean;
  showEmptyState?: boolean;
  emptyMessage?: string;
  emptyActionLabel?: string;
}

// Event handlers
export type DocumentGridErrorHandler = (error: Error) => void;
export type DocumentGridRetryHandler = () => void | Promise<void>;
export type DocumentGridActionHandler = () => void | Promise<void>;
export type DocumentGridMoveHandler = () => void | Promise<void>;

// State types
export type DocumentGridState = "loading" | "error" | "empty" | "ready";

export interface DocumentGridStateInfo {
  state: DocumentGridState;
  hasItems: boolean;
  isLoading: boolean;
  hasError: boolean;
  canShowEmpty: boolean;
}

// Performance monitoring types
export interface PerformanceThresholds {
  renderTime: number; // milliseconds
  itemCount: number; // number of items
  memoryUsage: number; // MB
}

export interface PerformanceWarning {
  type: "render" | "memory" | "items";
  value: number;
  threshold: number;
  suggestion: string;
}

// Testing types
export interface MockDocument {
  id: string;
  local?: Pick<
    Post,
    "id" | "name" | "head" | "data" | "createdAt" | "updatedAt" | "type"
  >;
  cloud?: Post;
}

export interface MockUser {
  id: string;
  handle: string;
  name: string;
  email: string;
  image: string | null;
}

export interface TestScenario {
  name: string;
  description: string;
  itemCount: number;
  hasError: boolean;
  isEmpty: boolean;
  isLoading: boolean;
  expectedBehavior: string;
}

// Utility types
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredProps<T> = Required<T>;

// Component variant types
export type GridVariant = "standard" | "compact" | "comfortable";
export type GridDensity = "dense" | "normal" | "sparse";

// Animation and motion types
export interface MotionConfig {
  enableTransitions: boolean;
  transitionDuration: number;
  easingFunction: string;
  respectReducedMotion: boolean;
}

// Responsive design types
export interface ResponsiveConfig {
  columns: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  breakpoints: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
}
