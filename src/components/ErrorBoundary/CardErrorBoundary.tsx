"use client";
import React, { Component, ErrorInfo, ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Typography,
} from "@mui/material";
import { ErrorOutline, Refresh } from "@mui/icons-material";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error boundary specifically designed for card components
 * Provides a fallback UI that maintains card layout consistency
 */
class CardErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error to an error reporting service
    console.error("Card Error Boundary caught an error:", error, errorInfo);

    // Call the optional error handler
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback component
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI that maintains card appearance
      return (
        <Card
          variant="outlined"
          sx={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            height: "100%",
            minHeight: "280px",
            width: "100%",
            backgroundColor: "error.light",
            borderColor: "error.main",
            borderWidth: 1,
          }}
        >
          <CardContent
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              p: 3,
            }}
          >
            <ErrorOutline
              sx={{
                fontSize: 48,
                color: "error.main",
                mb: 2,
              }}
            />

            <Typography variant="h6" color="error.main" gutterBottom>
              Card Error
            </Typography>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              This card couldn't be displayed properly
            </Typography>

            {process.env.NODE_ENV === "development" && this.state.error && (
              <Alert severity="error" sx={{ mb: 2, maxWidth: "100%" }}>
                <Typography
                  variant="caption"
                  component="pre"
                  sx={{ fontSize: "0.7rem" }}
                >
                  {this.state.error.message}
                </Typography>
              </Alert>
            )}

            <Button
              variant="outlined"
              size="small"
              startIcon={<Refresh />}
              onClick={this.handleRetry}
              sx={{
                borderColor: "error.main",
                color: "error.main",
                "&:hover": {
                  borderColor: "error.dark",
                  backgroundColor: "error.light",
                },
              }}
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

export default CardErrorBoundary;
