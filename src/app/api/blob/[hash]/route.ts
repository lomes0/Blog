import { NextResponse } from "next/server";
import { optionalUserRoute } from "@/lib/api-utils";
import { requireBlobRead } from "@/lib/access";
import { getBlob } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Serve a blob's bytes — docs/plans/blob-storage.md §4.
 *
 * `optionalUserRoute` because a blob has both a public and a signed-in branch:
 * an image in a published post is readable by anyone, the same image in a
 * private draft only by its author. `requireBlobRead` is what distinguishes
 * them, and obtaining the row is the check — there is no way to reach the bytes
 * below without it having run.
 *
 * ## Caching, which is the part worth getting right
 *
 * Blobs are immutable: the key is the digest of the content, so a given hash's
 * bytes never change and `immutable` needs no invalidation story. That makes
 * `max-age` as long as it is allowed to be.
 *
 * What must *not* be got wrong is `public` vs `private`. A shared cache
 * (Cloudflare, a corporate proxy) that stores a private draft's image under a
 * `public` directive will serve it to everyone, and the leak outlives the fix
 * because the object is already in caches you do not control. So the directive
 * follows `isPublic` — whether an anonymous caller could have fetched this — and
 * not whether *this* caller succeeded. Those are different questions and the
 * author of a private post satisfies only the second.
 */
export const GET = optionalUserRoute<{ hash: string }>(
  async (_request, { params, user }) => {
    const { blob, isPublic } = await requireBlobRead(params.hash, user);

    const bytes = await getBlob(blob.hash);

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": blob.mimeType,
        "Content-Length": String(blob.size),
        // The hash identifies the content exactly, so it is a strong ETag by
        // definition rather than by convention.
        "ETag": `"${blob.hash}"`,
        "Cache-Control": isPublic
          ? "public, max-age=31536000, immutable"
          : "private, max-age=31536000, immutable",
        // Belt-and-braces against a blob being rendered inline as markup. The
        // store accepts whatever mime type the writer recorded, and an SVG or
        // HTML blob served inline executes in the origin's context. Phase 2
        // constrains what may be written; this constrains what may happen to it
        // if that ever slips.
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  },
  { errorLabel: "Error reading blob" },
);
