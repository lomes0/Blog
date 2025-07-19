// Main component
export { default } from "../DocumentGrid";

// Sub-components
export { default as DocumentGridHeader } from "./DocumentGridHeader";
export { default as DocumentGridError } from "./DocumentGridError";
export { default as DocumentGridEmpty } from "./DocumentGridEmpty";

// Hooks
export { useResponsiveDocumentGrid } from "./hooks/useResponsiveDocumentGrid";
export { useDocumentGridPerformance } from "./hooks/useDocumentGridPerformance";

// Types
export * from "./types";

// Configuration
export interface DocumentGridConfig {
  virtualizationThreshold?: number;
  enableVirtualization?: boolean;
  showEmptyState?: boolean;
  emptyMessage?: string;
  emptyActionLabel?: string;
}
