"use client";
import { CssBaseline } from "@mui/material";
import {
  createTheme,
  ThemeProvider as MuiThemeProvider,
} from "@mui/material/styles";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v13-appRouter";
import { components } from "@/theme/components";
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
    /** Far-left activity rail — recessed below `sidebar` (VS Code depth) */
    rail: string;
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

/**
 * Explorer accent — the "Refined Explorer" handoff's slightly-more-violet take
 * on `primary`, used by the activity rail, file tree, and count pills.
 *
 * This lived in `components/Layout/SideBar/constants.ts` as a `SB_ACCENT` const
 * of fixed light-mode hexes, applied through `theme.applyStyles("light", …)` so
 * that dark mode fell through to whatever the base `sx` happened to set. That
 * made it a second palette: invisible to the theme, unreachable from `sx`
 * strings, and dark-mode-incomplete by construction. It is a palette decision,
 * so it lives in the palette — and the dark scheme now has real values instead
 * of an absence.
 */
declare module "@mui/material/styles" {
  interface Palette {
    accent: AccentPalette;
  }
  interface PaletteOptions {
    accent?: AccentPalette;
  }
}

interface AccentPalette {
  /** Active icons, accent bars, folder glyph. */
  main: string;
  /** Accent hover (pressed pills). */
  hover: string;
  /** Active/selected row background tint. */
  tint: string;
  /** Active/selected row text + active count-pill text. */
  activeText: string;
  /** Idle count-pill surface + text. */
  pillBg: string;
  pillText: string;
  /** Active count-pill surface (row is selected). */
  pillActiveBg: string;
  /** Fill for the rail account avatar when no photo is set. */
  avatarGradient: string;
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
          rail: "#eceef2",
          sidebar: "#f8fafc",
          // Bookends the activity rail rather than sitting a hair off white:
          // at #fbfcfe the right rail was ~1% from the canvas and read as
          // canvas-with-a-border. Matching `rail` frames the app left and
          // right and leaves white to mean "editing surface" alone.
          panel: "#eceef2",
          input: "#ffffff",
        },
        text: {
          primary: "#0f172a",
          secondary: "#475569",
          disabled: "#94a3b8",
        },
        // Fixed hexes from the design handoff — this is the scheme they were
        // tuned for.
        accent: {
          main: "#6d5cf5",
          hover: "#5d4ce8",
          tint: "#eeecfe",
          activeText: "#4338ca",
          pillBg: "#f4f4f6",
          pillText: "#a1a1aa",
          pillActiveBg: "#dfdcff",
          avatarGradient: "linear-gradient(135deg,#8b7bff,#6d5cf5)",
        },
      },
    },
    dark: {
      palette: {
        // Indigo — brand accent, lifted for dark surfaces
        primary: {
          main: "#8b85f4",
          light: "#aaa6f8",
          dark: "#4f46e5",
          contrastText: "#ffffff",
        },
        secondary: { main: "#ce93d8" },
        success: { main: "#34d399" },
        warning: { main: "#ffa726" },
        info: { main: "#29b6f6" },
        // Slate neutrals tinted toward the accent hue
        divider: "#465166",
        background: {
          default: "#252b3a",
          paper: "#303849",
          rail: "#1b202c",
          sidebar: "#202634",
          panel: "#2a3141",
          input: "#363f52",
        },
        text: {
          primary: "#f1f3f7",
          secondary: "#adb7c5",
          disabled: "#737f90",
        },
        // Expressed as channel/token references rather than fresh hexes: the
        // accent's dark form *is* the lifted brand indigo plus the neutral
        // action tints, which is what every call site was already falling back
        // to. `tint`, `pillBg`, `pillText` reproduce the previous dark
        // rendering exactly; `pillActiveBg` and `avatarGradient` are new —
        // dark mode had no selected-pill tint and no gradient avatar at all.
        accent: {
          main: "var(--mui-palette-primary-main)",
          hover: "var(--mui-palette-primary-dark)",
          tint: "var(--mui-palette-action-selected)",
          activeText: "var(--mui-palette-primary-main)",
          pillBg: "var(--mui-palette-action-hover)",
          pillText: "var(--mui-palette-text-disabled)",
          pillActiveBg: "var(--mui-palette-action-selected)",
          avatarGradient:
            "linear-gradient(135deg,var(--mui-palette-primary-light),var(--mui-palette-primary-main))",
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
  components,
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
