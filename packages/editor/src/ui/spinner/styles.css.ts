/**
 * Adapted from haklex `rich-editor-ui/src/components/spinner` (MIT).
 * Colorless by construction — it borrows `currentColor` from its context.
 */
import { keyframes } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";

const spin = keyframes({ to: { transform: "rotate(360deg)" } });

export const spinner = recipe({
  base: {
    display: "inline-block",
    borderRadius: "50%",
    border: "2px solid currentColor",
    borderTopColor: "transparent",
    animation: `${spin} 0.6s linear infinite`,
    flexShrink: 0,
  },
  variants: {
    size: {
      sm: { width: "14px", height: "14px" },
      md: { width: "20px", height: "20px" },
    },
  },
  defaultVariants: { size: "sm" },
});
