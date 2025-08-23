import Home from "@/components/Home";
import { findPublishedPosts } from "@/repositories/post";
import { findAllSeries } from "@/repositories/series";
import { UserDocument } from "@/types";
import type { Metadata } from "next";
import { findRevisionThumbnail } from "../api/utils";
import { ThumbnailProvider } from "@/app/context/ThumbnailContext";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Modern Blog | Create & Share Knowledge",
  description:
    "A modern blog platform with rich text editing capabilities. Create engaging posts with LaTeX, diagrams, and interactive content. Organize content in series and collaborate with others.",
};

const page = async () => {
  const session = await getServerSession(authOptions);
  const publishedPosts = await findPublishedPosts(12);
  const allSeries = await findAllSeries();

  const staticDocuments: UserDocument[] = publishedPosts.map(
    (post) => ({
      id: post.id,
      cloud: post,
    }),
  );
  const staticThumbnails = publishedPosts.reduce((acc, post) => {
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
