/**
 * Adapted from haklex `rich-editor-ui/src/components/segmented-control` (MIT).
 *
 * haklex's track is `bgTertiary` — a third background step we deliberately did
 * not take into the contract, because MUI gives us no third surface that flips
 * on its own. The fill ladder covers it: the track is `fillTertiary` (a large
 * recessed area) and the sliding thumb is the raised `bgSecondary`, which is
 * the same figure/ground relationship one token set lighter.
 */
import { recipe } from "@vanilla-extract/recipes";
import { FONT, RADIUS, SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";

export const container = recipe({
  base: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    borderRadius: RADIUS.lg,
    backgroundColor: vars.color.fillTertiary,
    padding: "0.25rem",
  },
  variants: {
    size: {
      sm: { height: "2rem", fontSize: FONT.sm },
      md: { height: "2.5rem", fontSize: FONT.lg },
    },
    fullWidth: { true: { width: "100%" }, false: {} },
  },
  defaultVariants: { size: "sm", fullWidth: false },
});

export const indicator = recipe({
  base: {
    position: "absolute",
    top: "0.25rem",
    bottom: "0.25rem",
    borderRadius: RADIUS.md,
    backgroundColor: vars.color.bgSecondary,
    boxShadow: vars.shadow.menu,
    transition: "all 300ms cubic-bezier(0.25, 1, 0.5, 1)",
    pointerEvents: "none",
  },
  variants: {
    ready: { true: {}, false: { opacity: 0 } },
  },
  defaultVariants: { ready: true },
});

export const item = recipe({
  base: {
    position: "relative",
    zIndex: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    whiteSpace: "nowrap",
    borderRadius: RADIUS.md,
    fontWeight: 500,
    outline: "none",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    transition: "color 200ms",
    color: vars.color.textSecondary,
    fontFamily: "inherit",
    fontSize: "inherit",
    selectors: {
      "&:focus-visible": {
        outline: `2px solid ${vars.color.accent}`,
        outlineOffset: "1px",
      },
    },
  },
  variants: {
    size: {
      sm: { padding: `0 ${SPACE.md}` },
      md: { padding: "0 1rem" },
    },
    active: { true: { color: vars.color.text }, false: {} },
    disabled: { true: { pointerEvents: "none", opacity: 0.4 }, false: {} },
    fullWidth: { true: { flex: 1 }, false: {} },
  },
  defaultVariants: {
    size: "sm",
    active: false,
    disabled: false,
    fullWidth: false,
  },
});
