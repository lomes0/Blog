import Home from "@/components/Home";
import { findPublishedPosts } from "@/repositories/post";
import { UserDocument } from "@/types";
import type { Metadata } from "next";
import { findRevisionThumbnail } from "../api/utils";
import { ThumbnailProvider } from "@/app/context/ThumbnailContext";

export const metadata: Metadata = {
  title: "Editor",
  description:
    "Editor is a free text editor, with support for LaTeX, Geogebra, Excalidraw and markdown shortcuts. Create, share and print math documents with ease.",
};

const page = async () => {
  const publishedPosts = await findPublishedPosts(12);
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
      <Home staticDocuments={staticDocuments} />
    </ThumbnailProvider>
  );
};

export default page;
