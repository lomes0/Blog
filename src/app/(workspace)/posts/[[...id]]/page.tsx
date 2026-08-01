import { Metadata } from "next";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { findSeriesById } from "@/repositories/series";
import PostsView from "@/components/posts/PostsView";

// No caching – data changes frequently and mutations use router.refresh().
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PostsPageProps {
  params: Promise<{ id?: string[] }>;
}

export async function generateMetadata(
  { params }: PostsPageProps,
): Promise<Metadata> {
  const { id } = await params;

  if (!id?.length) {
    return {
      title: "All Posts | Blog",
      description: "Browse all blog posts organized by publication date.",
    };
  }

  const series = await findSeriesById(id[0]);
  if (!series) return { title: "Series Not Found" };

  return {
    title: `${series.title} | Series`,
    description: series.description ?? undefined,
  };
}

/**
 * /posts              → all-posts view (PostsView with no series prop)
 * /posts/[seriesId]   → series detail view (PostsView with series prop)
 *
 * Both paths share the same layout and component tree; only the `series`
 * prop differs.
 */
export default async function PostsPage({ params }: PostsPageProps) {
  const { id } = await params;

  const seriesId = id?.[0];
  const [session, series] = await Promise.all([
    getServerSession(authOptions),
    seriesId ? findSeriesById(seriesId) : Promise.resolve(undefined),
  ]);

  if (seriesId && !series) notFound();

  const user = session?.user
    ? {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
      handle: session.user.handle,
      role: session.user.role,
    }
    : undefined;

  return <PostsView series={series ?? undefined} user={user} />;
}
