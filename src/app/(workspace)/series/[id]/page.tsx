import { permanentRedirect } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * /series/[id] is superseded by /posts/[id].
 * Issue a 308 permanent redirect so search engines and bookmarks update.
 */
export default async function SeriesDetailPage({ params }: Props) {
  const { id } = await params;
  permanentRedirect(`/posts/${id}`);
}
