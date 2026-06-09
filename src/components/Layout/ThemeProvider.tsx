"use client";
import { CssBaseline } from "@mui/material";
import {
  createTheme,
  ThemeProvider as MuiThemeProvider,
} from "@mui/material/styles";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v13-appRouter";
import "@fontsource/public-sans/300.css";
import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/500.css";
import "@fontsource/public-sans/600.css";
import "@fontsource/public-sans/700.css";

// Extend MUI's background palette with the recessed chrome surfaces from the
// "Slate + Indigo" design spec (claude_design/blog-editor-tokens.css). These
// emit as --mui-palette-background-{sidebar,panel,input} and switch with the
// active color scheme automatically — no hand-maintained html.dark overrides.
declare module "@mui/material/styles" {
  interface TypeBackground {
    /** Left nav / file tree — recessed below `default` */
    sidebar: string;
    /** Right Copilot panel / rail — distinct from `paper` */
    panel: string;
    /** Search / prompt fields — lifted above the panel */
    input: string;
  }

  // Custom typography variants filling the gap below `body2`/`caption`, so dense
  // UI never hard-codes `fontSize` in `sx`. The theme stays the single source of
  // truth — see DESIGN.md §3. `dense` (13px) sits between caption and body2;
  // `micro` (11px) is the smallest label size (timestamps, badges, meta chips).
  interface TypographyVariants {
    dense: React.CSSProperties;
    micro: React.CSSProperties;
  }
  interface TypographyVariantsOptions {
    dense?: React.CSSProperties;
    micro?: React.CSSProperties;
  }
}

declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides {
    dense: true;
    micro: true;
  }
}

// Create a stable theme with deterministic class names
const theme = createTheme({
  colorSchemes: {
    light: {
      palette: {
        // Indigo — brand accent (links, primary actions, focus)
        primary: {
          main: "#4f46e5",
          light: "#6366f1",
          dark: "#463eca",
          contrastText: "#ffffff",
        },
        // Purple — used for series indicators
        secondary: { main: "#9333ea", light: "#c084fc", dark: "#7e22ce" },
        // Green — published posts
        success: { main: "#059669", light: "#34d399", dark: "#047857" },
        // Orange — draft posts
        warning: { main: "#f97316", light: "#fdba74", dark: "#ea580c" },
        // Blue — active/in-progress posts
        info: { main: "#3b82f6", light: "#93c5fd", dark: "#2563eb" },
        // Slate-tinted neutrals
        divider: "#e2e8f0",
        background: {
          default: "#ffffff",
          paper: "#f8fafc",
          sidebar: "#f8fafc",
          panel: "#fbfcfe",
          input: "#ffffff",
        },
        text: {
          primary: "#0f172a",
          secondary: "#475569",
          disabled: "#94a3b8",
        },
      },
    },
    dark: {
      palette: {
        // Indigo — brand accent, lifted for dark surfaces
        primary: {
          main: "#7b74ec",
          light: "#9a94f0",
          dark: "#4f46e5",
          contrastText: "#ffffff",
        },
        secondary: { main: "#ce93d8" },
        success: { main: "#34d399" },
        warning: { main: "#ffa726" },
        info: { main: "#29b6f6" },
        // Slate neutrals tinted toward the accent hue
        divider: "#242b3c",
        background: {
          default: "#0f121a",
          paper: "#161c29",
          sidebar: "#0c0f18",
          panel: "#0d1018",
          input: "#131621",
        },
        text: {
          primary: "#eef2f6",
          secondary: "#9aa6b2",
          disabled: "#5f6b78",
        },
      },
    },
  },
  cssVariables: { colorSchemeSelector: "class" },
  typography: {
    fontFamily: '"Public Sans", "Roboto", "Helvetica", "Arial", sans-serif',
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
    // 13px — dense UI: toolbars, table rows, secondary inline labels
    dense: { fontSize: "0.8125rem", lineHeight: 1.5 },
    // 11px — smallest label: timestamps, counters, meta chips
    micro: { fontSize: "0.6875rem", lineHeight: 1.5, letterSpacing: "0.02em" },
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
    MuiTypography: {
      defaultProps: {
        // Custom variants render inline by default — they're labels, not blocks.
        // Pass `component="p"/"div"` at the call site when a block is needed.
        variantMapping: { dense: "span", micro: "span" },
      },
    },
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
