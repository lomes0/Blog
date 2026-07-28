import Home from "@/components/Home";
import { findAllDocuments } from "@/repositories/document";
import { findAllSeries } from "@/repositories/series";
import { Post } from "@/types";
import type { Metadata } from "next";
import { findRevisionThumbnail } from "../api/utils";
import { ThumbnailProvider } from "@/app/context/ThumbnailContext";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Force dynamic rendering to always show fresh data
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Modern Blog | Create & Share Knowledge",
  description:
    "A modern blog platform with rich text editing capabilities. Create engaging posts with LaTeX, diagrams, and interactive content. Organize content in series and collaborate with others.",
};

const page = async () => {
  const session = await getServerSession(authOptions);

  // Server-side: fetch public posts
  const allPosts = await findAllDocuments(12);
  const allSeries = await findAllSeries();

  const staticDocuments: Post[] = allPosts;
  const staticThumbnails = allPosts.reduce((acc, post) => {
    acc[post.head] = findRevisionThumbnail(post.head);
    return acc;
  }, {} as Record<string, Promise<string | null>>);

  return (
    <ThumbnailProvider thumbnails={staticThumbnails}>
      <Home
        staticDocuments={staticDocuments}
        series={allSeries}
        user={session?.user}
      />
    </ThumbnailProvider>
  );
};

export default page;
