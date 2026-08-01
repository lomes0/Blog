import type { OgMetadata } from "@/app/api/og/route";
import { findDocument, findDocumentChildren } from "@/repositories/document";
import ViewDocument, { type ViewTab } from "@/components/views/ViewDocument";
import { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import SplashScreen from "@/components/shared/SplashScreen";
import { cache } from "react";
import { findRevisionHtml } from "@/app/api/utils";
import { format } from "date-fns";
import type { Post } from "@/types";

// Mark this page as dynamic since it uses searchParams
export const dynamic = "force-dynamic";

const getCachedUserDocument = cache(async (id: string, revisions?: string) =>
  await findDocument(id, revisions)
);
const getCachedSession = cache(async () => await getServerSession(authOptions));

/**
 * The post's tab strip, resolved on the server.
 *
 * Was a client-side `apiClient.documents.get` + `.children` pair inside
 * `ViewDocument`, which needed the store-free public surface to talk to two
 * `write`-gated endpoints. Both answers are already in the database the page
 * just queried (plan §4.3: "a prop passed down from the server page").
 */
const getTabs = async (document: Post): Promise<ViewTab[]> => {
  const rootId = document.parentId ?? document.id;
  const root = document.parentId
    ? await getCachedUserDocument(document.parentId)
    : document;
  const children = await findDocumentChildren(rootId);
  return [
    // The root tab can carry its own label distinct from the post title.
    { id: rootId, name: root?.tabLabel ?? root?.name ?? "Post" },
    ...children.map((child) => ({ id: child.id, name: child.name })),
  ];
};

export async function generateMetadata(
  props: {
    params: Promise<{ id: string }> | { id: string };
    searchParams: Promise<{ v?: string }> | { v?: string };
  },
): Promise<Metadata> {
  const params = await props.params;
  const searchParams = await props.searchParams;

  if (!params.id) {
    return {
      title: "View Post",
      description: "View a post on Editor",
    };
  }
  const metadata: OgMetadata = { id: params.id, title: "View Post" };
  const document = await getCachedUserDocument(params.id, "all");
  if (document) {
    const revisionId = searchParams.v ?? document.head;
    const revision = document.revisions.find((revision) =>
      revision.id === revisionId
    );
    if (document.private) {
      const session = await getCachedSession();
      const user = session?.user;
      const isAuthor = user && user.id === document.author.id;
      // Simplified blog structure: no coauthors, only authors can access private posts
      if (isAuthor) {
        metadata.title = document.name;
        metadata.description = document.description || undefined;
        metadata.subtitle = revision
          ? `Last updated: ${
            format(new Date(revision.createdAt), "MMMM d, yyyy, h:mm a")
          } (UTC)`
          : "Revision not Found";
        metadata.user = {
          name: document.author.name,
          image: document.author.image!,
          handle: document.author.handle,
        };
      } else {
        metadata.title = "Private Post";
        metadata.subtitle = "If you have access, please sign in to view it";
      }
    } else {
      metadata.title = document.name;
      metadata.description = document.description || undefined;
      metadata.subtitle = revision
        ? `Last updated: ${
          format(new Date(revision.createdAt), "MMMM d, yyyy, h:mm a")
        } (UTC)`
        : "Revision not Found";
      metadata.user = {
        name: document.author.name,
        image: document.author.image!,
        handle: document.author.handle,
      };
    }
  } else {
    metadata.subtitle = "Post not found";
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
    params: Promise<{ id: string }> | { id: string };
    searchParams: Promise<{ v?: string }> | { v?: string };
  },
) {
  const params = await props.params;
  const searchParams = await props.searchParams;

  try {
    const document = await getCachedUserDocument(params.id, "all");
    if (!document) return <SplashScreen title="Post not found" />;
    const revisionId = searchParams.v ?? document.head;
    const revision = document.revisions.find((revision) =>
      revision.id === revisionId
    );
    if (!revision) {
      return (
        <SplashScreen
          title="Something went wrong"
          subtitle="Revision not found"
        />
      );
    }
    document.updatedAt = revision.createdAt;
    const session = await getCachedSession();
    const isCollab = document.collab;
    if (!session) {
      if (document.private) {
        return (
          <SplashScreen
            title="This post is private"
            subtitle="Please sign in to view it"
          />
        );
      }
      if (!isCollab) {
        document.revisions = [{ ...revision, author: document.author }];
      }
    }
    const user = session?.user;
    if (user) {
      const isAuthor = user.id === document.author.id;
      // Simplified blog structure: no coauthors, only authors can access private posts
      if (!isAuthor) {
        if (document.private) {
          return (
            <SplashScreen
              title="This post is private"
              subtitle="You are not authorized to view this post"
            />
          );
        }
        if (!isCollab) {
          document.revisions = [{
            ...revision,
            author: document.author,
          }];
        }
      }
    }
    const html = await findRevisionHtml(revisionId);
    if (html === null) {
      return (
        <SplashScreen
          title="Something went wrong"
          subtitle="Please try again later"
        />
      );
    }
    const tabs = await getTabs(document);
    return (
      <ViewDocument
        cloudDocument={document}
        cloudHtml={html}
        tabs={tabs}
        isAuthor={!!user && user.id === document.author.id}
        isSignedIn={!!user}
        pinnedRevisionId={revisionId !== document.head ? revisionId : undefined}
      />
    );
  } catch (error) {
    console.error(error);
    return (
      <SplashScreen
        title="Something went wrong"
        subtitle="Please try again later"
      />
    );
  }
}
