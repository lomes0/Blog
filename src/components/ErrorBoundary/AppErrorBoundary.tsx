"use client";
import React, { Component, ErrorInfo, ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Typography,
} from "@mui/material";
import { AlertCircle, Home, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showHomeButton?: boolean;
  title?: string;
  description?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

/**
 * General error boundary for application-wide error handling
 * Provides comprehensive error reporting and recovery options
 */
class AppErrorBoundary extends Component<Props, State> {
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
    console.error("App Error Boundary caught an error:", error, errorInfo);

    // Store error info for debugging
    this.setState({ errorInfo });

    // Call the optional error handler
    this.props.onError?.(error, errorInfo);

    // In production, you might want to send this to an error tracking service
    if (process.env.NODE_ENV === "production") {
      // Example: Sentry, LogRocket, etc.
      // errorReportingService.captureException(error, { extra: errorInfo });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback component
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <Container maxWidth="md" sx={{ py: 8 }}>
          <Paper
            elevation={3}
            sx={{
              p: 6,
              textAlign: "center",
              backgroundColor: "background.paper",
            }}
          >
            <AlertCircle
              size={80}
              style={{
                color: "var(--mui-palette-error-main)",
                marginBottom: 24,
              }}
            />

            <Typography
              variant="h4"
              component="h1"
              gutterBottom
              color="error.main"
            >
              {this.props.title || "Oops! Something went wrong"}
            </Typography>

            <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
              {this.props.description ||
                "We're sorry, but something unexpected happened. Please try refreshing the page or go back to the home page."}
            </Typography>

            {process.env.NODE_ENV === "development" && this.state.error && (
              <Alert
                severity="error"
                sx={{
                  mb: 4,
                  textAlign: "left",
                  "& .MuiAlert-message": {
                    width: "100%",
                  },
                }}
              >
                <Typography variant="subtitle2" gutterBottom>
                  Error Details (Development Mode):
                </Typography>
                <Typography
                  variant="caption"
                  component="pre"
                  sx={{
                    fontSize: "0.75rem",
                    fontFamily: "monospace",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {this.state.error.name}: {this.state.error.message}
                  {this.state.error.stack &&
                    `\n\nStack trace:\n${this.state.error.stack}`}
                  {this.state.errorInfo &&
                    `\n\nComponent stack:\n${this.state.errorInfo.componentStack}`}
                </Typography>
              </Alert>
            )}

            <Box
              sx={{
                display: "flex",
                gap: 2,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <Button
                variant="contained"
                startIcon={<RefreshCw />}
                onClick={this.handleRetry}
                sx={{ minWidth: 120 }}
              >
                Try Again
              </Button>

              {this.props.showHomeButton && <ErrorBoundaryHomeButton />}
            </Box>
          </Paper>
        </Container>
      );
    }

    return this.props.children;
  }
}

/**
 * Separate component for the home button to use hooks
 */
const ErrorBoundaryHomeButton: React.FC = () => {
  const router = useRouter();

  const handleGoHome = () => {
    router.push("/");
  };

  return (
    <Button
      variant="outlined"
      startIcon={<Home />}
      onClick={handleGoHome}
      sx={{ minWidth: 120 }}
    >
      Go Home
    </Button>
  );
};

export default AppErrorBoundary;
