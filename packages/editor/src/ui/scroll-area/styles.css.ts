/**
 * Adapted from haklex `rich-editor-ui/src/components/scroll-area` (MIT).
 *
 * haklex's thumb is a fixed `rgba(0,0,0,0.15)`, which disappears on a dark
 * canvas — the exact failure `npm run check:theme` was written about. Ours is
 * the fill ladder, so the thumb is a wash of the *text* color and therefore
 * near-white in dark and near-black in light.
 */
import { style } from "@vanilla-extract/css";
import { vars } from "../../styles/tokens.css";

export const scrollArea = style({
  "overflow": "auto",
  "scrollbarWidth": "thin",
  "scrollbarColor": `${vars.color.fill} transparent`,
  "::-webkit-scrollbar": { width: "6px", height: "6px" },
  "::-webkit-scrollbar-track": { background: "transparent" },
  "::-webkit-scrollbar-thumb": {
    background: vars.color.fill,
    borderRadius: "3px",
  },
});
