import type { OgMetadata } from "@/app/api/og/route";
import { findDocument } from "@/repositories/document";
import type { Metadata } from "next";
import { format } from "date-fns";

export async function generateMetadata(
  props: { params: Promise<{ id?: string[] }> },
): Promise<Metadata> {
  const params = await props.params;
  if (!(params.id && params.id[0])) {
    return {
      title: "Editor",
      description: "Edit a document on Editor",
    };
  }
  const metadata: OgMetadata = { id: params.id[0], title: "Editor" };
  const document = await findDocument(params.id[0]);
  if (document) {
    if (document.private) {
      metadata.title = "Private Document";
      metadata.subtitle = "if you have access, please sign in to edit it";
    } else {
      metadata.title = document.name;
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
    }
  } else {
    metadata.subtitle = "Document not found";
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

export const dynamic = "force-dynamic";

/**
 * Renders nothing. The workspace's pane tree is mounted by `../layout.tsx`,
 * above this segment, so that navigating between documents does not remount it
 * — see the note there. What has to stay on this segment is everything keyed to
 * *which* document: `generateMetadata` above, and `force-dynamic`.
 */
const page = () => null;

export default page;
