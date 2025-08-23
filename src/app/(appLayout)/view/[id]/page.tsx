import type { OgMetadata } from "@/app/api/og/route";
import { findUserPost } from "@/repositories/post";
import ViewDocument from "@/components/ViewDocument";
import htmr from "htmr";
import { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import SplashScreen from "@/components/SplashScreen";
import { cache } from "react";
import { findRevisionHtml } from "@/app/api/utils";
import { DocumentRevision } from "@/types";

// Mark this page as dynamic since it uses searchParams
export const dynamic = "force-dynamic";

const getCachedUserDocument = cache(async (id: string, revisions?: string) =>
  await findUserPost(id, revisions)
);
const getCachedSession = cache(async () => await getServerSession(authOptions));

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
        metadata.subtitle = revision
          ? `Last updated: ${
            new Date(revision.createdAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })
          } (UTC)`
          : "Revision not Found";
        metadata.user = {
          name: document.author.name,
          image: document.author.image!,
          email: document.author.email,
        };
      } else {
        metadata.title = "Private Post";
        metadata.subtitle = "If you have access, please sign in to view it";
      }
    } else {
      metadata.title = document.name;
      metadata.subtitle = revision
        ? `Last updated: ${
          new Date(revision.createdAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })
        } (UTC)`
        : "Revision not Found";
      metadata.user = {
        name: document.author.name,
        image: document.author.image!,
        email: document.author.email,
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
    return (
      <ViewDocument cloudDocument={document} user={session?.user}>
        {htmr(html)}
      </ViewDocument>
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
