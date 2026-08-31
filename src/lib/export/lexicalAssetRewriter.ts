/**
 * Lexical JSON asset utilities.
 *
 * Walks a serialized Lexical editor state tree and:
 *  1. Collects all external asset references (attachment URLs, background
 *     images) that need to be bundled into the export zip.
 *  2. Rewrites those references when importing a bundle onto a different
 *     server or into a different document context.
 *
 * Inline assets (data: URIs — base64 images, SVG sketches, GeoGebra graphs)
 * are already embedded in the JSON and require no special handling.
 */

import type { SerializedEditorState, SerializedLexicalNode } from "lexical";

// ─── URL patterns ─────────────────────────────────────────────────────────────

/**
 * Returns true when URL is an external attachment (not a data: URI or
 * a relative background-image path — those are handled separately).
 */
function isAttachmentUrl(url: string): boolean {
  return url.startsWith("/api/attachments/");
}

/**
 * Extract the plain filename from an attachment URL.
 * e.g. "/api/attachments/attach_abc123_ff.pdf" → "attach_abc123_ff.pdf"
 */
function attachmentUrlToFilename(url: string): string {
  return url.replace(/^\/api\/attachments\//, "");
}

/**
 * Turn a bare filename back into a local attachment URL.
 */
export function filenameToAttachmentUrl(filename: string): string {
  return `/api/attachments/${filename}`;
}

// ─── Node walker ──────────────────────────────────────────────────────────────

type SerializedNode = SerializedLexicalNode & Record<string, unknown>;

/**
 * Recursively walk the Lexical node tree, calling `visitor` on every node
 * (including the root).  The visitor may mutate the node in place.
 */
function walkNodes(
  node: SerializedNode,
  visitor: (node: SerializedNode) => void,
): void {
  visitor(node);
  const children = node.children as SerializedNode[] | undefined;
  if (Array.isArray(children)) {
    for (const child of children) {
      walkNodes(child, visitor);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Collect all attachment filenames referenced in a serialized editor state.
 * Returns a deduplicated array of filenames.
 */
export function collectAttachmentFilenames(
  state: SerializedEditorState,
): string[] {
  const seen = new Set<string>();
  const root = state.root as unknown as SerializedNode;
  walkNodes(root, (node) => {
    // ImageNode — src can be a data URI (base64) or, rarely, an absolute URL
    if (node.type === "image" && typeof node.src === "string") {
      if (isAttachmentUrl(node.src as string)) {
        seen.add(attachmentUrlToFilename(node.src as string));
      }
    }
    // AttachmentNode — url is always an /api/attachments/ path
    if (node.type === "attachment" && typeof node.url === "string") {
      if (isAttachmentUrl(node.url as string)) {
        seen.add(attachmentUrlToFilename(node.url as string));
      }
    }
  });
  return Array.from(seen);
}

/**
 * Return a deep clone of `state` with attachment URLs rewritten using the
 * provided mapping.  Keys are OLD filenames; values are NEW filenames.
 *
 * This is a no-op for data: URIs (they are preserved as-is).
 */
export function rewriteAttachmentUrls(
  state: SerializedEditorState,
  mapping: Record<string, string>,
): SerializedEditorState {
  // Deep clone so we never mutate the original
  const cloned = JSON.parse(JSON.stringify(state)) as SerializedEditorState;
  const root = cloned.root as unknown as SerializedNode;

  walkNodes(root, (node) => {
    if (node.type === "image" && typeof node.src === "string") {
      if (isAttachmentUrl(node.src as string)) {
        const oldName = attachmentUrlToFilename(node.src as string);
        if (mapping[oldName]) {
          node.src = filenameToAttachmentUrl(mapping[oldName]);
        }
      }
    }
    if (node.type === "attachment" && typeof node.url === "string") {
      if (isAttachmentUrl(node.url as string)) {
        const oldName = attachmentUrlToFilename(node.url as string);
        if (mapping[oldName]) {
          node.url = filenameToAttachmentUrl(mapping[oldName]);
        }
      }
    }
  });

  return cloned;
}
