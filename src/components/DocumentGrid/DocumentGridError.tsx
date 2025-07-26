import React from "react";
import { Alert, AlertTitle, Box, Button, Typography } from "@mui/material";
import { ErrorOutline, Refresh } from "@mui/icons-material";

interface DocumentGridErrorProps {
  /** The error that occurred */
  error?: Error | string | null;
  /** Optional retry function */
  onRetry?: () => void;
  /** Custom error message */
  message?: string;
  /** Whether to show the retry button */
  showRetry?: boolean;
}

/**
 * Error state component for DocumentGrid
 * Provides user-friendly error messages with optional retry functionality
 */
const DocumentGridError: React.FC<DocumentGridErrorProps> = ({
  error,
  onRetry,
  message,
  showRetry = true,
}) => {
  const errorMessage = message ||
    (typeof error === "string" ? error : error?.message) ||
    "Failed to load documents";

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        py: 8,
        px: 3,
        textAlign: "center",
        minHeight: 300,
      }}
    >
      <Alert
        severity="error"
        sx={{
          mb: 3,
          maxWidth: 500,
          "& .MuiAlert-icon": {
            fontSize: "2rem",
          },
        }}
      >
        <AlertTitle>Something went wrong</AlertTitle>
        {errorMessage}
      </Alert>

      {showRetry && onRetry && (
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={onRetry}
          sx={{
            mt: 2,
            minWidth: 120,
          }}
        >
          Try Again
        </Button>
      )}
    </Box>
  );
};

export default DocumentGridError;
