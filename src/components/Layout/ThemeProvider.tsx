"use client";
import { CssBaseline } from "@mui/material";
import {
  createTheme,
  ThemeProvider as MuiThemeProvider,
} from "@mui/material/styles";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v13-appRouter";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";

// Create a stable theme with deterministic class names
const theme = createTheme({
  colorSchemes: {
    light: {
      palette: {
        primary: { main: "#1976d2", light: "#42a5f5", dark: "#1565c0" },
        // Purple — used for series indicators
        secondary: { main: "#9333ea", light: "#c084fc", dark: "#7e22ce" },
        // Green — published posts
        success: { main: "#22c55e", light: "#86efac", dark: "#16a34a" },
        // Orange — draft posts
        warning: { main: "#f97316", light: "#fdba74", dark: "#ea580c" },
        // Blue — active/in-progress posts
        info: { main: "#3b82f6", light: "#93c5fd", dark: "#2563eb" },
      },
    },
    dark: {
      palette: {
        primary: { main: "#90caf9" },
        secondary: { main: "#ce93d8" },
        success: { main: "#66bb6a" },
        warning: { main: "#ffa726" },
        info: { main: "#29b6f6" },
      },
    },
  },
  cssVariables: { colorSchemeSelector: "class" },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: "2.5rem",
      fontWeight: 700,
      lineHeight: 1.2,
      letterSpacing: "-0.02em",
    },
    h2: {
      fontSize: "2rem",
      fontWeight: 700,
      lineHeight: 1.25,
      letterSpacing: "-0.01em",
    },
    h3: { fontSize: "1.75rem", fontWeight: 600, lineHeight: 1.3 },
    h4: { fontSize: "1.5rem", fontWeight: 600, lineHeight: 1.35 },
    h5: { fontSize: "1.25rem", fontWeight: 600, lineHeight: 1.4 },
    h6: { fontSize: "1.125rem", fontWeight: 600, lineHeight: 1.45 },
    body1: { fontSize: "1rem", lineHeight: 1.6 },
    body2: { fontSize: "0.875rem", lineHeight: 1.6 },
    subtitle1: { fontSize: "1rem", fontWeight: 500, lineHeight: 1.5 },
    subtitle2: { fontSize: "0.875rem", fontWeight: 500, lineHeight: 1.5 },
    caption: { fontSize: "0.75rem", lineHeight: 1.5, letterSpacing: "0.02em" },
    overline: {
      fontSize: "0.75rem",
      fontWeight: 600,
      lineHeight: 1.5,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
    },
    button: { fontWeight: 600, textTransform: "none", letterSpacing: "0.02em" },
  },
  components: {
    // Override default container sizes
    MuiContainer: {
      styleOverrides: {
        maxWidthXl: {
          maxWidth: "2400px !important", // Override the default 'xl' size of 1536px
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 8, textTransform: "none" },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 6 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
  },
});

// Options for the emotion cache
const cacheOptions = {
  key: "mui-app",
  prepend: true,
  stylisPlugins: [], // Ensure consistent behavior between server and client
};

export default function ThemeProvider(
  { children }: { children: React.ReactNode },
) {
  return (
    <AppRouterCacheProvider options={cacheOptions}>
      <MuiThemeProvider theme={theme} defaultMode="system">
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </AppRouterCacheProvider>
  );
}
