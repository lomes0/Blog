import { alpha, type Theme } from "@mui/material/styles";
import type { DropPosition } from "@/lib/dragDrop";
import { MOTION } from "./tokens";

/**
 * The tree-row state vocabulary — DESIGN.md §17.3 ("one vocabulary everywhere")
 * and §17.4 (radius & density), stated once.
 *
 * §17.3 is the section the code drifted furthest from, because it is the one
 * rule MUI has no slot for: a tree row is a plain `Box`/`ListItemButton`, so
 * "every rail button, tree row, tab, menu item and list result uses the same
 * states" had nowhere to live except prose. Five files answered it
 * independently — `PostRow`, `SeriesRow` (/posts) and `PostItem`, `SeriesGroup`,
 * `ProjectGroup` (sidebar) — and the drop-indicator bar below was pasted
 * verbatim into four of them.
 *
 * Same test as `./components.ts` and `./tokens.ts`: if the same literal appears
 * in more than one file, it is a default that was never set. These are `sx`
 * fragments rather than component defaults because the states are *conditional*
 * — a row composes the ones it is currently in.
 *
 * Scope is §17.6's: chrome tree rows. Content surfaces (cards, notes, preview
 * miniatures) keep their own intent and are not conformed to this.
 */

/**
 * Row radius — DESIGN.md §17.4, "Tree / list / result row: 1.5 (6px)".
 *
 * Was three values for one element: `0.5` (PostRow), `1` (SeriesRow) and `1.5`
 * (sidebar, via a `SB_ITEM_RADIUS` local to `SideBar/constants.ts`). The
 * sidebar's was the conforming one; it moves here because a rule that governs
 * every tree row cannot live in one region's constants file.
 *
 * The sidebar has since gone square by request — its `SB_ITEM_RADIUS` is now
 * `0` and no longer an alias of this. So this governs the /posts rows only;
 * see that constant for why the rail wants a band rather than a pill.
 */
export const TREE_ROW_RADIUS = 1.5;

/**
 * Primary-tint alphas for the two drag/selection states §17.3 leaves to a
 * literal ("scheme-aware accent tint, when a literal is unavoidable").
 *
 * Named so the ladder is visible in one place: a drop target reads lighter than
 * a multi-selected row, which brightens again on hover.
 *
 * Module-local on purpose — the fragments below cover every state that uses
 * these, so a call site reaching for a raw alpha is the drift this file exists
 * to prevent. Export it only when a row needs a tint no fragment expresses.
 */
const ROW_TINT = {
  /** Drop-a-row-into-this-container highlight. */
  dropInto: 0.12,
  /** Ctrl/Cmd/Shift-click multi-selection. */
  multiSelect: 0.16,
  /** Multi-selected row under the cursor. */
  multiSelectHover: 0.24,
} as const;

/** Background transition for row state changes — §11 via `MOTION.fast`. */
export const ROW_TRANSITION = `background-color ${MOTION.fast}ms`;

/**
 * How wide a `.row-create-slot` may open. The slot holds the row's create
 * button (`RowCreateButton`) and is clipped shut at rest, so a control that only
 * exists on hover does not hold its width the rest of the time — the row's rule
 * or count pill gets that space back instead.
 *
 * A `max-width` ceiling rather than a width: the button keeps its natural size
 * (an 18px box plus its own margins, ~21px), and this stays one number to
 * animate toward rather than a second copy of those metrics.
 */
export const ROW_CREATE_SLOT_MAX_W = 32;

/**
 * The native-DnD insertion line: a 2px `primary.main` bar on the row edge the
 * dragged block would drop against.
 *
 * Requires `position: "relative"` on the row. Spread conditionally — pass the
 * hovered edge, and render nothing when the row is not a drop target:
 *
 * ```ts
 * ...(dropIndicator && dropIndicatorSx(dropIndicator)),
 * ```
 *
 * The bar sits flush with the row edge (offset `0`). `PostRow` drew it at `-1`,
 * alone among the four call sites; that 1px was drift, not intent.
 */
export const dropIndicatorSx = (position: DropPosition) => ({
  "&::after": {
    content: '""',
    position: "absolute" as const,
    left: 0,
    right: 0,
    [position === "before" ? "top" : "bottom"]: 0,
    height: 2,
    bgcolor: "primary.main",
    zIndex: 2,
  },
});

/**
 * Drop-a-row-*into*-this-container fill (post → series, series → project).
 *
 * The fill only — callers add whatever marks the container's own shape: a pill
 * outline (`SeriesGroup`), a tinted rule (`ProjectGroup`). Holds through
 * `:hover` so the highlight does not flicker as the cursor moves inside it.
 */
export const dropIntoSx = () => ({
  "&, &:hover": {
    bgcolor: (t: Theme) => alpha(t.palette.primary.main, ROW_TINT.dropInto),
  },
});

/**
 * Multi-selection pill — a primary tint, deliberately distinct from the neutral
 * `action.selected` that marks the active route.
 *
 * `alsoWhen` unions an extra selector into both rules, for rows that carry a
 * competing MUI state the tint has to beat: `PostItem` passes
 * `"&.Mui-selected"` so a row that is open *and* multi-selected still reads as
 * selected. Omit it on rows with no such state.
 */
export const multiSelectSx = (alsoWhen?: string) => {
  const rest = alsoWhen ? `&, ${alsoWhen}` : "&";
  const hover = alsoWhen ? `&:hover, ${alsoWhen}:hover` : "&:hover";
  return {
    [rest]: {
      bgcolor: (t: Theme) =>
        alpha(t.palette.primary.main, ROW_TINT.multiSelect),
    },
    [hover]: {
      bgcolor: (t: Theme) =>
        alpha(t.palette.primary.main, ROW_TINT.multiSelectHover),
    },
  };
};

/**
 * The ring itself, for chrome that is not a `ButtonBase` and so never carries
 * `.Mui-focusVisible` — a pane tab is a plain `Box` and keys the same ring off
 * `&:focus-visible`. Compose `chromeFocusRingSx` below wherever the MUI class
 * *is* available; this exists so the second form is the same two pixels rather
 * than a re-derivation.
 */
export const CHROME_RING = {
  outline: "2px solid",
  outlineColor: "primary.main",
  outlineOffset: "-2px",
} as const;

/**
 * Keyboard focus ring for tree rows.
 *
 * Two things at once, both load-bearing. MUI's default `.Mui-focusVisible`
 * fills the row with `action.focus` — a grey all but identical to
 * `action.selected` — and focus lingers on a row after a context menu closes or
 * a rename commits, so the fill reads as a stuck second "selected" mark. The
 * fill is dropped and replaced with a ring.
 *
 * **This is not `FOCUS_RING.chrome`.** §17.3's table names that token for dense
 * chrome, but it is a `box-shadow` and every shipped tree row draws an
 * `outline` instead (`ActivityRail` is the lone `FOCUS_RING.chrome` user). A
 * focus ring is accessibility-visible, so this token matches what ships rather
 * than silently redrawing three rows; which of the two forms is right is a call
 * for a human with the app in front of them — the same open question §17.3
 * already records about `inset`.
 *
 * `keepFillWhen` is a **bare class selector** — it lands inside `:not()`, where
 * a leading `&` would be invalid CSS. A row whose fill carries meaning the ring
 * must not erase passes it, so only rows in the plain state go transparent.
 * `PostItem` passes `".Mui-selected"`: that fill marks the open document, and
 * clearing it would make the focused row look closed.
 */
export const chromeFocusRingSx = (keepFillWhen?: string) => {
  const ring = CHROME_RING;
  // The two branches must not both emit a plain `&.Mui-focusVisible` key: in one
  // object literal the second would overwrite the first and drop the fill reset.
  return keepFillWhen
    ? {
      [`&.Mui-focusVisible:not(${keepFillWhen})`]: { bgcolor: "transparent" },
      "&.Mui-focusVisible": ring,
    }
    : { "&.Mui-focusVisible": { bgcolor: "transparent", ...ring } };
};

/**
 * Hover-reveal for a row's secondary controls — DESIGN.md §9 (a control that
 * appears on hover must still be reachable), so these pair with the row's own
 * focus handling rather than replacing it.
 *
 * Class-based because the targets are descendants rendered by other components:
 * tag the element with the class and the row decides when it shows.
 */
export const rowHoverRevealSx = {
  "&:hover .row-checkbox-grip": { visibility: "visible" },
  "&:hover .row-actions-btn": { opacity: 1 },
  "&:hover .row-date": { opacity: 0.45 },
  "&:hover .row-post-count": { opacity: 1 },
  // The create button ("+") is the one reveal that also gives back its *space*:
  // see `ROW_CREATE_SLOT_MAX_W`. `focus-within` as well as `hover`, because a
  // clipped slot would swallow the button keyboard focus just moved to — the
  // button's own `:focus-visible` opacity cannot un-clip its container.
  "& .row-create-slot": {
    display: "flex",
    flexShrink: 0,
    maxWidth: 0,
    overflow: "hidden",
    transition: `max-width ${MOTION.fast}ms`,
  },
  "&:hover .row-create-slot, &:focus-within .row-create-slot": {
    maxWidth: ROW_CREATE_SLOT_MAX_W,
  },
} as const;
