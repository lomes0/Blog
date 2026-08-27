/**
 * The code snippet's type string and its DOM contract
 * (docs/plans/archive/haklex-reprise.md §6.2).
 *
 * Split out of `index.ts` for the reason `NestedDocNode/utils.ts` gives: the
 * tab strip writes to the node it decorates, and anything importing the class
 * only to name its type string would close a cycle for nothing. These four
 * class names are a contract between four files that never import each other —
 * the node (`index.ts`, which builds the DOM), the plugin (which portals the
 * strip into it and hides the files that are not open), `theme.css` (which
 * lays it out for reader and editor alike) and `styles.css.ts` (the strip
 * itself). Rename one here, not there.
 */
export const CODE_SNIPPET_TYPE = "code-snippet";

/** The wrapper `createDOM` returns, and `exportDOM` mirrors for the reader. */
export const SNIPPET_CLASS = "code-snippet";

/**
 * The element Lexical reconciles the files into — see `getDOMSlot`.
 *
 * The wrapper cannot be the slot: it also holds the tab strip, and the
 * reconciler treats every child of the slot element as a node of its own.
 */
export const SNIPPET_FILES_CLASS = "code-snippet-files";

/** The portal host the React tab strip renders into. Never reconciled. */
export const SNIPPET_TABS_CLASS = "code-snippet-tabs";

/**
 * On every file that is not the open tab.
 *
 * Applied to the child's DOM by `CodeSnippetPlugin` and **never stored**: which
 * tab is open is `active` on the wrapper, and a class on a child node's element
 * is presentation the reconciler is free to throw away. The exported HTML
 * carries none of these, which is why a reader gets every file (see
 * `exportDOM`).
 */
export const SNIPPET_HIDDEN_FILE_CLASS = "code-snippet-file-hidden";

/** A file's caption in exported HTML — the editor shows filenames as tabs. */
export const SNIPPET_FILE_CLASS = "code-snippet-file";
export const SNIPPET_FILENAME_CLASS = "code-snippet-filename";
