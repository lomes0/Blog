/**
 * Adapted from haklex `rich-editor-ui/src/components/action-button` (MIT).
 *
 * Two deliberate departures from the source:
 *
 *  - Retinted. haklex's neutral/blue literals become the `--ed-*` contract:
 *    `accentLight` → `shadow.focusRing` (haklex's ring is that token at low
 *    alpha, which does not clear WCAG 1.4.11 on any of our surfaces), the
 *    `#fff` on an accent fill →
 *    `accentContrast` (the palette decides what is legible on primary, not
 *    this file), `alertCaution` → `danger`, and every hand-mixed
 *    `color-mix(text N%, transparent)` hover → the fill ladder that exists for
 *    exactly that job.
 *  - A pressed state. haklex has no toggle button; ours has to serve Base UI's
 *    `Toggle`, which marks itself `[data-pressed]`. `[aria-pressed="true"]` is
 *    matched alongside it so a plain `<button aria-pressed>` gets the same
 *    treatment without adopting the primitive.
 */
import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { DURATION, FONT, RADIUS, SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";

/**
 * Stable class names, so a consumer can reach a button from a parent's
 * stylesheet without importing the recipe. Kept from haklex, renamed to the
 * package's own prefix.
 */
export const semanticClassNames = {
  actionBar: "ed-action-bar",
  actionButton: "ed-action-btn",
  actionButtonEnd: "ed-action-btn--end",
  actionButtonDanger: "ed-action-btn--danger",
  actionButtonIcon: "ed-action-btn--icon",
} as const;

export const actionBar = style({
  display: "flex",
  alignItems: "center",
  gap: SPACE.xs,
});

const transition = `color ${DURATION.base} ease, background-color ${DURATION.base} ease`;
const transitionWithBorder =
  `background-color ${DURATION.base} ease, border-color ${DURATION.base} ease, color ${DURATION.base} ease`;

const pressedSelectors = '&[data-pressed], &[aria-pressed="true"]';

export const actionButton = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    appearance: "none",
    border: "none",
    background: "none",
    cursor: "pointer",
    fontFamily: "inherit",
    transition,
    outline: "none",
    selectors: {
      "&:focus-visible": { boxShadow: vars.shadow.focusRing },
      "&:disabled": { opacity: 0.45, cursor: "not-allowed" },
    },
  },
  variants: {
    variant: {
      ghost: {
        color: "inherit",
        selectors: {
          "&:hover:not(:disabled)": {
            backgroundColor: vars.color.fillSecondary,
          },
          [pressedSelectors]: {
            backgroundColor: vars.color.fill,
            color: vars.color.text,
          },
        },
      },
      solid: {
        backgroundColor: vars.color.text,
        color: vars.color.bg,
        transition: transitionWithBorder,
        selectors: {
          "&:hover:not(:disabled)": {
            backgroundColor:
              `color-mix(in srgb, ${vars.color.text} 86%, transparent)`,
          },
        },
      },
      outline: {
        background: vars.color.bg,
        color: vars.color.textSecondary,
        border: `1px solid ${vars.color.border}`,
        transition: transitionWithBorder,
        selectors: {
          "&:hover:not(:disabled)": {
            background: vars.color.fillSecondary,
            color: vars.color.text,
          },
        },
      },
      accent: {
        backgroundColor: vars.color.accent,
        color: vars.color.accentContrast,
        selectors: {
          "&:hover:not(:disabled)": { filter: "brightness(0.9)" },
          "&:disabled": {
            opacity: 0.5,
            cursor: "default",
            pointerEvents: "none",
          },
        },
      },
    },
    size: {
      sm: {
        gap: "6px",
        fontSize: FONT.sm,
        fontWeight: 500,
        padding: `${SPACE.xs} ${SPACE.sm}`,
        borderRadius: RADIUS.sm,
        height: "24px",
        whiteSpace: "nowrap",
      },
      md: {
        gap: "6px",
        fontSize: FONT.md,
        fontWeight: 500,
        padding: `${SPACE.xs} 10px`,
        borderRadius: RADIUS.md,
        height: "28px",
        lineHeight: 1.4,
        whiteSpace: "nowrap",
      },
      lg: {
        gap: SPACE.sm,
        fontSize: FONT.lg,
        fontWeight: 600,
        padding: "0 14px",
        borderRadius: RADIUS.md,
        height: "36px",
        whiteSpace: "nowrap",
      },
    },
    icon: { true: {}, false: {} },
    end: { true: { marginLeft: "auto" }, false: {} },
    danger: { true: {}, false: {} },
    rounded: { true: {}, false: {} },
  },
  compoundVariants: [
    {
      variants: { icon: true, size: "sm" },
      style: {
        width: "24px",
        height: "24px",
        padding: 0,
        gap: 0,
        color: vars.color.textSecondary,
        selectors: {
          "&:hover:not(:disabled)": {
            color: vars.color.text,
            backgroundColor: vars.color.fillSecondary,
          },
          "&:disabled": { opacity: 0.3, pointerEvents: "none" },
        },
      },
    },
    {
      variants: { icon: true, size: "md" },
      style: {
        padding: "6px",
        borderRadius: RADIUS.md,
        height: "auto",
        width: "auto",
        gap: 0,
        color: vars.color.textSecondary,
        selectors: {
          "&:hover:not(:disabled)": {
            color: vars.color.text,
            backgroundColor: vars.color.fillSecondary,
          },
          "&:disabled": { opacity: 0.3, cursor: "default" },
          "&:disabled:hover": {
            background: "none",
            color: vars.color.textSecondary,
          },
        },
      },
    },
    {
      variants: { icon: true, size: "lg" },
      style: {
        padding: SPACE.sm,
        borderRadius: RADIUS.md,
        height: "auto",
        width: "auto",
        gap: 0,
        color: vars.color.textSecondary,
        selectors: {
          "&:hover:not(:disabled)": {
            color: vars.color.text,
            backgroundColor: vars.color.fillSecondary,
          },
          "&:disabled": { opacity: 0.3, cursor: "default" },
          "&:disabled:hover": {
            background: "none",
            color: vars.color.textSecondary,
          },
        },
      },
    },
    { variants: { rounded: true, icon: true }, style: { borderRadius: "50%" } },
    {
      variants: { danger: true },
      style: {
        selectors: {
          "&:hover:not(:disabled)": {
            color: vars.color.danger,
            backgroundColor: vars.color.dangerSoft,
          },
        },
      },
    },
    /*
     * …and at rest, on the two variants that draw their own ink. haklex's
     * `danger` only tinted on hover, which reads as an ordinary button until
     * the pointer is already on it — the opposite of what a destructive
     * control should do. Scoped to `ghost`/`outline` because `solid` and
     * `accent` paint their foreground *on* a filled surface, where red text
     * would be unreadable rather than emphatic.
     */
    {
      variants: { danger: true, variant: "ghost" },
      style: { color: vars.color.danger },
    },
    {
      variants: { danger: true, variant: "outline" },
      style: { color: vars.color.danger },
    },
  ],
  defaultVariants: {
    variant: "ghost",
    size: "sm",
    icon: false,
    end: false,
    danger: false,
    rounded: false,
  },
});

/*
 * haklex forces `svg { width: 1em; height: 1em }` inside an icon button. That
 * rule is dropped here: every icon in this repo is a `lucide-react` element
 * sized through `size={ICON_SIZE.…}` (`src/theme/icons.ts`), which lands as a
 * width/height *attribute* — and a stylesheet beats an attribute, so keeping
 * the rule would silently override every call site's chosen size. The button
 * sizes its box; the caller sizes its glyph.
 */
