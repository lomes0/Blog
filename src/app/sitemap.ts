import { findAllPosts } from "@/repositories/post";
import { MetadataRoute } from "next";

const PUBLIC_URL = process.env.PUBLIC_URL;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const allPosts = await findAllPosts();
  const now = new Date().toISOString();
  return [
    {
      url: `${PUBLIC_URL}/`,
      lastModified: now,
    },
    {
      url: `${PUBLIC_URL}/playground`,
      lastModified: now,
    },
    {
      url: `${PUBLIC_URL}/tutorial`,
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
