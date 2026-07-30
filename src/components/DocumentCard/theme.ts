import { type Theme } from "@mui/material/styles";

/**
 * Values shared by the card family — `DocumentCard`, `DocumentGrid` and
 * `posts/SeriesGroupCard`. Derived from the MUI theme so palette/typography
 * changes propagate automatically (e.g. dark-mode palette, brand fonts).
 *
 * Scope note: this file is only for values genuinely specific to a *card*, and
 * only for values something actually reads. It used to be much larger, and the
 * excess was not harmless:
 *
 * - DESIGN.md once cited it as the home of the app's shadows (§6), focus ring
 *   and touch target (§10), and motion policy (§11) — global rules that no
 *   other surface could reasonably import from `components/DocumentCard/`, and
 *   which consequently nothing did. Those live in `@/theme/tokens`.
 * - `borderRadius: 6` lived here, written as pixels. Its sole reader,
 *   `LoadingCard`, passed it to `sx`, where a bare number is ×4 — so a card
 *   meant to be ~10px rendered at 40px against the real card's 8px. Card radius
 *   belongs to `MuiCard`/`CardBase`, not to a per-component token (DESIGN.md
 *   §5), and a token nothing reads is a ×4 trap nobody is watching.
 *
 * So: do not park a value here speculatively. Every key below has a named
 * reader; if you remove the last one, remove the key.
 */
export const createCardTheme = (theme: Theme) => ({
  /** Read by `LoadingCard`, so the skeleton reserves the real card's height. */
  minHeight: {
    post: "380px",
  },

  /** Read by `DocumentGrid` — the base gap it scales per breakpoint. */
  spacing: {
    cardGap: 2,
  },

  /** Read by `PostChips` for the draft and series chip labels. */
  typography: {
    metaSize: theme.typography.caption.fontSize, // ~0.75rem
  },

  colors: {
    /** `SeriesGroupCard` border. */
    border: theme.palette.divider,
    /** `LoadingCard` and `SeriesGroupCard` surface. */
    cardBackground: theme.palette.background.paper,

    /**
     * Draft chip (`PostChips.createStatusChip`). Draft is the only status that
     * renders a chip — published/active/done deliberately render nothing, so
     * there are no swatches for them here.
     *
     * The gradient is a light-mode literal with no dark branch; it predates
     * `@/theme/tokens` and is left as-is rather than silently redrawn.
     */
    status: {
      draft: {
        bg: "linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%)",
        border: theme.palette.warning.main,
        text: theme.palette.warning.dark,
        icon: theme.palette.warning.main,
      },
    },

    /** Series chip (`PostChips.createSeriesChip`) — secondary palette. */
    series: {
      bg: "linear-gradient(135deg, #faf5ff 0%, #e9d5ff 100%)",
      border: theme.palette.secondary.main,
      text: theme.palette.secondary.dark,
      icon: theme.palette.secondary.main,
    },
  },
});
