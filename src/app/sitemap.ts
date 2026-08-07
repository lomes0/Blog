import { findPublishedDocuments } from "@/repositories/document";
import { MetadataRoute } from "next";

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
