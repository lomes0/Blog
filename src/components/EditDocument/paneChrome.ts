/**
 * Geometry shared between a pane's real chrome and the stand-in drawn while it
 * loads. Import-free on purpose, so both sides can read it without either
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
 * you reach for while reading rather than while arranging the window. The 1px
 * rule is drawn down its *centre* (`ResizeGripper`'s `rule` variant), so the
 * grab margin is symmetric — 5.5px of nothing on each side — rather than the
 * rule hugging one pane's edge with all the slack on the other.
 */
export const SPLITTER_W = 12;

/**
 * The pane strip — the row that names a pane and carries its ⤢ / ✕.
 *
 * Dense-chrome height: a 24px icon button in 4px of padding, top and bottom.
 * Nothing reserves it separately, because `PaneHeader` draws it from the moment
 * the pane exists — well before the document it names has been fetched — so
 * there is no window in which a stand-in would be standing in for it.
 */
export const PANE_STRIP_H = 32;
