/**
 * Renders nothing, and now renders nothing *statically*.
 *
 * The workspace's pane tree is mounted by `../layout.tsx`, above this segment,
 * so that navigating between documents does not remount it — see the note
 * there. This file exists only to make the segment routable.
 *
 * It used to carry two things, and docs/plans/archive/workspace-url.md §6.1
 * deleted both:
 *
 * - `generateMetadata`, a `findDocument` on every open, building an `/api/og`
 *   card for a route only the document's author can use and a `<title>` the
 *   focused `EditorTabPanel` overwrites client-side anyway. If an `/edit` link
 *   is ever unfurled, the useful preview is the public one, and `/view/[id]`
 *   already has it. The route falls back to the root layout's metadata.
 * - `export const dynamic = "force-dynamic"`, which was only there to serve
 *   that query. It cost a server render per navigation into the workspace, and
 *   it is what made a `router.push` expensive enough to need a third navigation
 *   primitive (`CommandRouter.rewrite`, §1) to route around.
 *
 * **The optional catch-all stays.** `/edit/<id>` is the entry point — the one
 * thing the URL is genuinely good for (§2) — and §3.2's third branch depends on
 * it: a handle for a post not yet in the store needs the id to travel through
 * the address bar to reach the deep-link seam's fetch. A plain `edit/page.tsx`
 * would answer `/edit` and 404 every inbound link; it also cannot coexist with
 * `[[...id]]`, which already matches both.
 */
const page = () => null;

export default page;
