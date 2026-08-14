/**
 * The snippet's tab strip, as an author sees it.
 *
 * Every colour comes from `styles/tokens.css.ts` — DESIGN.md §19, enforced by
 * `npm run check:theme`, which reads `.css.ts` as well as `.css`. The other
 * half of this node's appearance is the block itself (the wrapper, the file
 * area and the reader's captions), which lives in `theme.css` beside the rest
 * of the document's own CSS: change one, check both.
 */
import { style } from "@vanilla-extract/css";
import { DURATION, FONT, RADIUS, SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";

export const strip = style({
  display: "flex",
  alignItems: "center",
  gap: SPACE.sm,
  padding: `${SPACE.xs} ${SPACE.xs} 0`,
  userSelect: "none",
});

export const tabs = style({
  display: "flex",
  alignItems: "center",
  gap: "2px",
  flex: 1,
  minWidth: 0,
  overflowX: "auto",
  scrollbarWidth: "none",
});

/** The stack `theme.css` gives code itself, so a tab reads as a filename. */
const MONO = '"Fira Code", ui-monospace, SFMono-Regular, Menlo, monospace';

const tabBase = style({
  display: "inline-flex",
  alignItems: "center",
  flex: "0 0 auto",
  maxWidth: "16rem",
  borderRadius: `${RADIUS.sm} ${RADIUS.sm} 0 0`,
  border: `1px solid transparent`,
  borderBottom: "none",
  color: vars.color.textSecondary,
  transition: `background-color ${DURATION.fast} ease, color ${DURATION.fast} ease`,
  selectors: {
    "&:hover": { backgroundColor: vars.color.fillTertiary },
  },
});

export const tab = tabBase;

/** The open file. Reads as attached to the code below it, tab-fashion. */
export const tabActive = style([
  tabBase,
  {
    backgroundColor: vars.color.bgSecondary,
    borderColor: vars.color.border,
    color: vars.color.text,
    selectors: {
      "&:hover": { backgroundColor: vars.color.bgSecondary },
    },
  },
]);

export const tabButton = style({
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  padding: `${SPACE.xs} ${SPACE.sm}`,
  border: 0,
  background: "none",
  color: "inherit",
  font: "inherit",
  fontSize: FONT.sm,
  fontFamily: MONO,
  cursor: "pointer",
});

const iconButton = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "20px",
  height: "20px",
  flex: "0 0 auto",
  padding: 0,
  border: 0,
  borderRadius: RADIUS.sm,
  background: "none",
  color: vars.color.textSecondary,
  cursor: "pointer",
  transition: `background-color ${DURATION.fast} ease, color ${DURATION.fast} ease`,
  selectors: {
    "&:hover": {
      backgroundColor: vars.color.fillSecondary,
      color: vars.color.text,
    },
  },
});

export const tabClose = style([iconButton, { marginRight: "2px" }]);

export const add = style([iconButton, { marginLeft: SPACE.xs }]);

/** The active tab while it is being renamed — the same box, made editable. */
export const rename = style({
  flex: "0 0 auto",
  width: "10rem",
  padding: `${SPACE.xs} ${SPACE.sm}`,
  borderRadius: `${RADIUS.sm} ${RADIUS.sm} 0 0`,
  border: `1px solid ${vars.color.accent}`,
  borderBottom: "none",
  backgroundColor: vars.color.bgSecondary,
  color: vars.color.text,
  font: "inherit",
  fontSize: FONT.sm,
  fontFamily: MONO,
  outline: "none",
});

/** The language of the open file. Same option list as the code block's own. */
export const language = style({
  flex: "0 0 auto",
  fontSize: FONT.sm,
  color: vars.color.textSecondary,
});
