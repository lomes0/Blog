import { findPublishedDocuments } from "@/repositories/document";
import { MetadataRoute } from "next";

/**
 * Rendered per request, not at build time.
 *
 * Two reasons, and the second is the one that bites in production:
 *
 * 1. **A prerendered sitemap is frozen.** Next statically generates this by
 *    default, which bakes the post list as it stood when the image was built.
 *    Every post published afterwards stays invisible to crawlers until the next
 *    redeploy — a silent SEO bug, since the file is still served and still
 *    looks right.
 * 2. **Building must not require a database.** This is the only prerendered
 *    page that queries Postgres, and it is what made `docker build` fail with
 *    `Environment variable not found: DATABASE_URL`. Keeping the image
 *    buildable without a live database is what lets it be built in CI, or on a
 *    laptop, and promoted between environments as one artifact.
 *
 * If crawler traffic ever makes the query worth caching, `revalidate` is the
 * knob — not a return to build-time generation.
 */
export const dynamic = "force-dynamic";

const PUBLIC_URL = process.env.PUBLIC_URL;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Published only. This used to call `findAllDocuments`, which filters on
  // neither `published` nor `private`, so every unpublished draft was being
  // advertised to crawlers.
  const allPosts = await findPublishedDocuments();
  const now = new Date().toISOString();
  return [
    {
      url: `${PUBLIC_URL}/`,
      lastModified: now,
    },
    {
      url: `${PUBLIC_URL}/new`,
      lastModified: now,
    },
    {
      url: `${PUBLIC_URL}/browse`,
      lastModified: now,
    },
    {
      url: `${PUBLIC_URL}/privacy`,
      lastModified: now,
    },
    ...allPosts.map((post) => ({
      url: `${PUBLIC_URL}/view/${post.handle || post.id}`,
      lastModified: post.updatedAt,
    })),
  ];
}
