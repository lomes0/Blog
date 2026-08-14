/**
 * Which document the editor is currently editing, read from the URL.
 *
 * Extracted from `AttachmentDialog`, which had it as a private local function,
 * so the blob upload path can share it rather than grow a second copy.
 *
 * **This returns an id *or* a handle, deliberately.** The original insisted on a
 * 36-character UUID and returned `null` for anything else, which is why
 * attachments silently fail to upload on a handle URL (`/edit/my-post`). Every
 * server route that takes a document reference resolves both — `requireDocument`
 * is documented as accepting "document id or handle" — so narrowing here bought
 * nothing and lost the handle case. Validation belongs at the point that can
 * actually resolve the reference.
 */
const ROUTES_WITH_ID = ["edit", "new", "view", "documents", "posts"];

export function getDocumentRefFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const segments = window.location.pathname.split("/").filter(Boolean);

  for (let i = 0; i < segments.length - 1; i++) {
    if (ROUTES_WITH_ID.includes(segments[i])) {
      const candidate = segments[i + 1];
      if (candidate) return decodeURIComponent(candidate);
    }
  }
  return null;
}
