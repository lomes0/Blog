// Use the "use server" directive to explicitly mark this as a dynamic page
export const dynamic = "force-dynamic";

import NewDocument from "@/components/NewDocument";
import type { OgMetadata } from "@/app/api/og/route";
import { findDocument } from "@/repositories/document";
import type { Metadata } from "next";
import { cache } from "react";
import { ThumbnailProvider } from "@/app/context/ThumbnailContext";
import { findRevisionThumbnail } from "@/app/api/utils";
import SplashScreen from "@/components/shared/SplashScreen";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { format } from "date-fns";

const getCachedUserDocument = cache(async (id: string, revisions?: string) =>
  await findDocument(id, revisions)
);
const getCachedSession = cache(async () => await getServerSession(authOptions));

export async function generateMetadata(
  props: {
    params: { id: string[] };
    searchParams: { v?: string };
  },
): Promise<Metadata> {
  const { searchParams } = props;
  const { id } = await props.params;
  if (!(id && id[0])) {
    return {
      title: "New Post",
      description: "Create a new post",
    };
  }
  const metadata: OgMetadata = { id: id[0], title: "Blog" };
  const document = await getCachedUserDocument(id[0], searchParams.v);
  if (document) {
    if (document.collab || document.published) {
      metadata.title = `Fork ${document.title}`;
      const formattedDate = format(
        new Date(document.updatedAt),
        "MMMM d, yyyy, h:mm a",
      );
      metadata.subtitle = `Last updated: ${formattedDate} (UTC)`;
      metadata.user = {
        name: document.author.name,
        image: document.author.image!,
        handle: document.author.handle,
      };
    } else {
      metadata.title = "Fork a Document";
    }
  } else {
    metadata.title = "Fork a Document";
  }
  const { title, subtitle, description } = metadata;
  const image = `/api/og?metadata=${
    encodeURIComponent(JSON.stringify(metadata))
  }`;

  return {
    title: `${title}`,
    description: description ?? subtitle,
    openGraph: {
      images: [image],
    },
  };
}

export default async function Page(
  props: {
    params: { id?: string[] };
    searchParams: { v?: string };
  },
) {
  const { searchParams } = props;
  const { id } = await props.params;
  const documentId = id?.[0];
  if (!documentId) return <NewDocument />;
  const document = await getCachedUserDocument(documentId, searchParams.v);
  if (!document) return <NewDocument />;
  const isPublished = document.published;
  const isPrivate = document.private;
  const isCollab = document.collab;
  const session = await getCachedSession();
  if (!session && !isPublished && !isCollab) {
    return (
      <SplashScreen
        title="This document is not published"
        subtitle="Please sign in to Fork it"
      />
    );
  }
  const user = session && session.user;
  const isAuthor = user && user.id === document.author.id;
  const isCoauthor = user &&
    document.coauthors.some((coauthor) => coauthor.id === user.id);
  if (user && !isAuthor && !isCoauthor) {
    if (isPrivate) {
      return (
        <SplashScreen
          title="This document is private"
          subtitle="You are not authorized to Fork this document"
        />
      );
    }
    if (!isPublished && !isCollab) {
      return (
        <SplashScreen
          title="This document is not published"
          subtitle="You are not authorized to Fork this document"
        />
      );
    }
  }
  const revisionId = searchParams.v || document.headRevisionId;
  const thumbnails = {
    [revisionId]: findRevisionThumbnail(revisionId),
  };
  return (
    <ThumbnailProvider thumbnails={thumbnails}>
      <NewDocument cloudDocument={document} />
    </ThumbnailProvider>
  );
}
