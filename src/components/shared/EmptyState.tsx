import React from "react";
import { Box, Button, Paper } from "@mui/material";

interface EmptyStateProps {
  /** MUI icon element — takes precedence over `emoji` */
  icon?: React.ReactNode;
  /** Emoji fallback (kept for backward compat) */
  emoji?: string;
  title: string;
  description?: string;
  /** Optional call-to-action button */
  action?: { label: string; onClick: () => void };
  /**
   * `page` (default) — large centered block, generous padding.
   * `card` — Paper with dashed border, compact padding; mirrors old BlogPostsEmptyState.
   */
  variant?: "page" | "card";
}

/**
 * Unified empty-state primitive.
 * Replaces shared/EmptyState, DocumentGrid/DocumentGridEmpty, and
 * DocumentBrowser/components/BlogPostsEmptyState.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  emoji = "📝",
  title,
  description,
  action,
  variant = "page",
}) => {
  const iconNode = icon ?? (
    <Box
      sx={{
        fontSize: { xs: 40, md: 56 },
        filter: "grayscale(0.3)",
      }}
    >
      {emoji}
    </Box>
  );

  const content = (
    <>
      <Box sx={{ mb: 2 }}>{iconNode}</Box>
      <Box
        sx={{
          fontSize: variant === "card"
            ? "1.125rem"
            : { xs: "1.125rem", md: "1.375rem" },
          mb: 1,
          fontWeight: 600,
          color: "text.primary",
        }}
      >
        {title}
      </Box>
      {description && (
        <Box
          sx={{
            fontSize: { xs: "0.875rem", md: "1rem" },
            color: "text.secondary",
            maxWidth: 400,
            mx: "auto",
            lineHeight: 1.6,
            mb: action ? 2 : 0,
          }}
        >
          {description}
        </Box>
      )}
      {action && (
        <Button
          variant="contained"
          onClick={action.onClick}
          sx={{ mt: description ? 0 : 2, borderRadius: 1.5 }}
        >
          {action.label}
        </Button>
      )}
    </>
  );

  if (variant === "card") {
    return (
      <Paper
        elevation={0}
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          p: 6,
          gap: 1,
          borderRadius: 2,
          border: "1px dashed",
          borderColor: "divider",
          bgcolor: "background.default",
          textAlign: "center",
        }}
      >
        {content}
      </Paper>
    );
  }

  return (
    <Box
      sx={{
        textAlign: "center",
        py: { xs: 6, md: 10 },
        px: { xs: 2, md: 4 },
        color: "text.secondary",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {content}
    </Box>
  );
};
