/**
 * Adapted from haklex `rich-editor-ui/src/components/alert` (MIT).
 *
 * haklex's variants are six literals per severity (a light pair and a dark
 * one); ours are the four MUI severities the app already uses, through
 * `vars.color.{info,warning,danger}` and their `…Soft` companions.
 */
import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { FONT, RADIUS, SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";

export const alert = recipe({
  base: {
    display: "flex",
    alignItems: "flex-start",
    gap: SPACE.sm,
    padding: `${SPACE.sm} ${SPACE.md}`,
    borderRadius: RADIUS.md,
    fontSize: FONT.md,
    lineHeight: 1.5,
    border: "1px solid transparent",
  },
  variants: {
    variant: {
      info: {
        backgroundColor: vars.color.infoSoft,
        borderColor: vars.color.infoSoft,
        color: vars.color.info,
      },
      warning: {
        backgroundColor: vars.color.warningSoft,
        borderColor: vars.color.warningSoft,
        color: vars.color.warning,
      },
      error: {
        backgroundColor: vars.color.dangerSoft,
        borderColor: vars.color.dangerSoft,
        color: vars.color.danger,
      },
    },
  },
  defaultVariants: { variant: "info" },
});

export const alertContent = style({ flex: 1, minWidth: 0 });

export const alertIcon = style({
  width: "16px",
  height: "16px",
  flexShrink: 0,
  marginTop: "2px",
});

export const alertAction = style({ flexShrink: 0, marginLeft: "auto" });
