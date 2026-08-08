/** Adapted from haklex `rich-editor-ui/src/components/badge` (MIT). */
import { recipe } from "@vanilla-extract/recipes";
import { FONT } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";

export const badge = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "9999px",
    fontWeight: 500,
    whiteSpace: "nowrap",
    lineHeight: 1,
  },
  variants: {
    variant: {
      neutral: {
        backgroundColor: vars.color.fillTertiary,
        color: vars.color.textTertiary,
      },
      success: {
        backgroundColor: vars.color.successSoft,
        color: vars.color.success,
      },
      error: {
        backgroundColor: vars.color.dangerSoft,
        color: vars.color.danger,
      },
      warning: {
        backgroundColor: vars.color.warningSoft,
        color: vars.color.warning,
      },
      info: {
        backgroundColor: vars.color.infoSoft,
        color: vars.color.info,
      },
    },
    size: {
      sm: { fontSize: FONT.xs, padding: "2px 6px", gap: "3px" },
      md: { fontSize: FONT.sm, padding: "3px 8px", gap: "4px" },
    },
  },
  defaultVariants: { variant: "neutral", size: "sm" },
});
