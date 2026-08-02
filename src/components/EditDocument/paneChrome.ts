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
