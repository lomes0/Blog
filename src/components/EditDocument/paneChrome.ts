/**
 * Geometry shared between a pane's real chrome and the stand-in drawn while it
 * loads. Import-free on purpose, so both sides can read it without either
 * depending on the other.
 */

/**
 * `ToolbarPlugin`'s rendered height.
 *
 * A 34px icon button (`toolbar.css`, `.editor-toolbar .MuiIconButton-root`)
 * inside the toolbar's `py: 0.5`, over a 1px `divider` rule: 34 + 8 + 1.
 *
 * Two places need to agree on it. `PaneHeader` reserves it so the document does
 * not jump when the toolbar portals in — the toolbar mounts with the editor,
 * which is well after the pane's box exists — and `PaneSkeleton` draws a band
 * this tall where it stands in for a whole pane. If the toolbar's padding or
 * button size changes, this is the number to change with it.
 */
export const TOOLBAR_H = 43;
