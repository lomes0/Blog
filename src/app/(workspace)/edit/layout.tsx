import EditDocument from "@/components/EditDocument";

/**
 * The workspace's pane tree lives **here, above the `[[...id]]` segment**, and
 * that placement is the whole point of this file.
 *
 * `/edit/[[...id]]` is a catch-all, and Next keys a router segment by its param
 * value — so `/edit/<a>` and `/edit/<b>` are *different* segment nodes. Anything
 * rendered by `page.tsx` is therefore unmounted and remounted on every
 * document-to-document navigation. `WorkspacePanes` dispatches `closeAllPanes`
 * from its unmount cleanup, so that remount wiped the workspace: with one pane
 * the result was indistinguishable (you got one pane either way, which is why it
 * shipped), but with two it destroyed the split — and `pane.split` pushes such a
 * URL itself, so a split tore itself down about a second after it appeared.
 *
 * A layout is not re-keyed by a child segment's params. Hoisting the tree here
 * means a document change is a prop change (`EditDocumentContent` reads the
 * segment with `usePathname`), which the deep-link seam already handles by
 * dispatching `openPane`. Leaving `/edit` entirely still unmounts this layout,
 * so `closeAllPanes` keeps meaning what it says.
 *
 * `children` is deliberately dropped: the page below renders nothing at all and
 * exists only to make `/edit/<id>` routable. It used to also carry
 * `generateMetadata` and `force-dynamic`, which were per-document and so had to
 * sit on the segment that names one; docs/plans/workspace-url.md §6.1 deleted
 * both, and there is nothing per-document left down there.
 */
export default function EditLayout() {
  return <EditDocument />;
}
