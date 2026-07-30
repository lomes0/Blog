import type { ThemeOptions } from "@mui/material/styles";

/**
 * Component-level defaults — DESIGN.md's rules stated once, where MUI applies
 * them for free, rather than re-pasted as `sx` at every call site.
 *
 * The test for whether something belongs here: if the same literal appears in
 * more than one file, it is a default that was never set. A rule written here
 * cannot drift, and changing how a surface looks is one edit rather than a
 * grep. Sizes that MUI cannot reach (lucide `size` props) live in `./icons`.
 */
export const components: ThemeOptions["components"] = {
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
  // DESIGN.md §5 — radius. Card/Button/Paper 8px, Chip 6px.
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

  // Every menu in the app — right-click menus, toolbar menus, action menus,
  // submenus — is one floating surface (DESIGN.md §17.1): translucent paper,
  // blurred backdrop, elevation 2. Radius comes from `MuiPaper` above.
  MuiMenu: {
    defaultProps: { elevation: 2 },
    styleOverrides: {
      paper: {
        minWidth: 130,
        marginTop: 4,
        backgroundColor:
          "rgba(var(--mui-palette-background-paperChannel) / 0.95)",
        backdropFilter: "blur(8px)",
      },
    },
  },

  // Menu density (DESIGN.md §17.4). MUI's own defaults are the 48px-tall,
  // 16px-text Material list row; chrome menus are dense rows with the icon
  // hugging its label.
  MuiMenuItem: {
    styleOverrides: {
      root: ({ theme }) => ({
        ...theme.typography.body2,
        paddingTop: theme.spacing(0.75),
        paddingBottom: theme.spacing(0.75),
        paddingLeft: theme.spacing(1.75),
        paddingRight: theme.spacing(1.75),
        gap: theme.spacing(1.25),
        // MenuItem styles this selector itself, at specificity (0,2,0). An `sx`
        // on the icon is (0,1,0) and loses — which is why thirteen call sites
        // had resorted to `minWidth: "auto !important"`. Same selector here,
        // emitted after MenuItem's own, so it wins on order instead.
        "& .MuiListItemIcon-root": { minWidth: "auto" },
        // ListItemText renders its own <Typography variant="body1">, so the
        // root typography above never reaches the label — hence the
        // `primaryTypographyProps={{ variant: "body2" }}` on every menu row.
        // Matching `body1` specifically restates the *default*: a row that
        // asks for another variant renders a different class and is left alone.
        "& .MuiListItemText-primary.MuiTypography-body1":
          theme.typography.body2,
      }),
    },
  },
};
