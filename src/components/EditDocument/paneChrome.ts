/**
 * Geometry shared between a pane's real chrome and the stand-in drawn while it
 * loads, plus the DOM contract for addressing a pane's scroller from outside
 * it. Import-free on purpose, so both sides can read it without either
 * depending on the other.
 */

/**
 * `ToolbarPlugin`'s rendered height.
 *
 * Measured, not derived. It used to be written down as 34 + 8 + 1 — a 34px
 * icon button (`toolbar.css`, `.editor-toolbar .MuiIconButton-root`) inside the
 * toolbar's `py: 0.5`, over a 1px `divider` rule — but the toolbar has not been
 * icon buttons alone for a while: the block-format and font `Select`s are the
 * tallest things in it, and the real box measures 52px in a browser. The 43 was
 * a 9px under-reservation, which is exactly the jump you saw when a document
 * settled and then hopped as its toolbar arrived.
 *
 * Three places need to agree on it. `PaneHeader` reserves it so the document
 * does not jump when the toolbar portals in — the toolbar mounts with the
 * editor, which is well after the pane's box exists — `WorkspaceToolbar` does
 * the same for a split's shared band, and `PaneSkeleton` draws a band this tall
 * where it stands in for a whole pane.
 *
 * Re-measure rather than re-derive if the toolbar's controls change:
 * `document.querySelector(".editor-toolbar").getBoundingClientRect().height`.
 */
export const TOOLBAR_H = 52;

/**
 * A split pane's own horizontal padding, in theme spacing units (so 3 = 24px).
 *
 * Split panes do **not** sit in the page's content gutters. Those are asymmetric
 * and wide (`CONTENT_PAD_X` — 96px left, 64px right at `md`), which is right for
 * one column of prose and wrong for two: it spent a fifth of a 1600px window on
 * margin the documents were being squeezed by. The row cancels them and spans
 * the main area edge to edge, and this is what each pane keeps for itself so the
 * text is not flush against the splitter.
 *
 * Three places have to agree, exactly as with {@link TOOLBAR_H}: `PaneFrame`
 * pads the scroller by it, and `PaneHeader` and `PaneSkeleton` cancel it so
 * their chrome spans the pane rather than stopping short of its edges.
 */
export const PANE_PAD_X = 3;

/**
 * The grab strip between two panes, in px.
 *
 * Wider than the 4px panel edges (`GRIPPER_W`) and deliberately so: this one is
 * not against a rail, it is between two documents, and it is the only drag edge
 * you reach for while reading rather than while arranging the window.
 *
 * `ResizeGripper`'s `rule` variant fills it: a recessed channel, edge to edge,
 * with a 1px rule down the *centre* — so the grab margin is symmetric rather
 * than the rule hugging one pane's edge with all the slack on the other. This
 * width is therefore also how much channel shows either side of the rule, which
 * is the whole depth cue: the panes stand on the canvas, the seam sits a step
 * below it.
 *
 * Odd on purpose, and it has to stay odd: a rule of odd width centred in an even
 * strip lands on a half pixel and is drawn as two columns at half strength — a
 * blurred hairline in the state you look at all day. 11 keeps both the 1px rest
 * rule and the 3px hover rule on whole pixels, and leaves the 5px of channel
 * either side that the reference had.
 */
export const SPLITTER_W = 11;

/**
 * The pane strip — the row that names a pane and carries its ⤢ / ✕.
 *
 * Dense-chrome height: a 24px icon button in 4px of padding, top and bottom.
 * Nothing reserves it separately, because `PaneHeader` draws it from the moment
 * the pane exists — well before the document it names has been fetched — so
 * there is no window in which a stand-in would be standing in for it.
 */
export const PANE_STRIP_H = 32;

/**
 * Id of the page's own scrolling container (`AppLayoutContent`'s Container).
 *
 * The element above it, `#app-main`, is `overflow: hidden` — it holds the top
 * bar, this container and the status bar, and never scrolls. Reading a scroll
 * position off it is not merely imprecise, it is always zero, which is what the
 * right rail's reading-progress bar had been reporting since it was written.
 */
export const MAIN_SCROLLER_ID = "editor-main-container";

/**
 * Marks a split pane's own scroller (`PaneFrame`), which has no id because
 * there is one per pane.
 *
 * Unsplit there is no such element at all — the pane renders bare into the
 * page's container — so {@link documentScrollerFor} falls back rather than
 * treating its absence as an error.
 */
export const PANE_SCROLLER_ATTR = "data-pane-scroller";

/**
 * The element that scrolls a given pane's document.
 *
 * Two answers, and which one applies is not the caller's business: split, each
 * pane scrolls itself inside `PaneFrame`; unsplit, the page's own container
 * scrolls the document. `useScrollMemory` resolves the same pair by walking up
 * from an anchor inside the pane — that route is not open to chrome that lives
 * *outside* the panes, which is why this one is by name.
 *
 * Returns `null` before mount and on a route with no workspace.
 */
export const documentScrollerFor = (
  paneId: string | null,
): HTMLElement | null => {
  if (typeof document === "undefined") return null;
  const pane = paneId ? document.getElementById(`pane-${paneId}`) : null;
  const own = pane?.querySelector<HTMLElement>(`[${PANE_SCROLLER_ATTR}]`);
  return own ?? document.getElementById(MAIN_SCROLLER_ID);
};
