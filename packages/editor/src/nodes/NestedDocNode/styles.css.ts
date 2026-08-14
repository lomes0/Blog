/**
 * The nested-doc card and the dialog its interior is edited in.
 *
 * Every colour comes from `styles/tokens.css.ts` — DESIGN.md §19, enforced by
 * `npm run check:theme`, which reads `.css.ts` as well as `.css`. The reader-
 * facing half of this node is `exportDOM`, and it is styled in `theme.css`
 * beside the rest of the document's own CSS: change one, check both.
 */
import { style } from "@vanilla-extract/css";
import { DURATION, FONT, RADIUS, SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";

export const card = style({
  display: "flex",
  flexDirection: "column",
  margin: `${SPACE.sm} 0`,
  border: `1px solid ${vars.color.border}`,
  borderRadius: RADIUS.lg,
  backgroundColor: vars.color.fillQuaternary,
  color: vars.color.text,
  overflow: "hidden",
  transition: `border-color ${DURATION.base} ease`,
  selectors: {
    "&:hover": { borderColor: vars.color.textTertiary },
  },
});

export const header = style({
  display: "flex",
  alignItems: "center",
  gap: SPACE.sm,
  padding: `${SPACE.sm} ${SPACE.md}`,
  userSelect: "none",
});

/**
 * The disclosure caret. A real `<button>` rather than a click handler on the
 * header, so the collapsed/open state is reachable by keyboard and announced —
 * it is persisted state, not decoration.
 */
export const disclosure = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "22px",
  height: "22px",
  flex: "0 0 auto",
  padding: 0,
  border: 0,
  borderRadius: RADIUS.sm,
  background: "none",
  color: vars.color.textSecondary,
  cursor: "pointer",
  transition: `background-color ${DURATION.fast} ease, transform ${DURATION.base} ease`,
  selectors: {
    "&:hover": { backgroundColor: vars.color.fillSecondary },
    '&[aria-expanded="true"]': { transform: "rotate(90deg)" },
  },
});

export const title = style({
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: FONT.lg,
  fontWeight: 600,
});

export const untitled = style({
  color: vars.color.textTertiary,
  fontWeight: 400,
  fontStyle: "italic",
});

export const meta = style({
  flex: "0 0 auto",
  fontSize: FONT.sm,
  color: vars.color.textSecondary,
  fontVariantNumeric: "tabular-nums",
});

/** The read-only glance at the interior. Editing happens in the dialog. */
export const preview = style({
  padding: `0 ${SPACE.md} ${SPACE.md} calc(${SPACE.md} + 22px + ${SPACE.sm})`,
  fontSize: FONT.lg,
  lineHeight: 1.5,
  color: vars.color.textSecondary,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 6,
  overflow: "hidden",
});

export const empty = style({
  color: vars.color.textTertiary,
  fontStyle: "italic",
});

/** The dialog's editing surface: a bordered well the nested editor fills. */
export const surface = style({
  marginTop: SPACE.md,
  padding: SPACE.md,
  minHeight: "40vh",
  border: `1px solid ${vars.color.border}`,
  borderRadius: RADIUS.md,
  backgroundColor: vars.color.bg,
  color: vars.color.text,
});
