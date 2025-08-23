import type { Metadata } from "next";
import Tutorial from "@/components/Tutorial";
import htmr from "htmr";
import { findRevisionHtml } from "@/app/api/utils";
import { findUserPost } from "@/repositories/post";

export const metadata: Metadata = {
  title: "Tutorial",
  description: "Learn how to use Editor",
};

const page = async () => {
  const document = await findUserPost("tutorial");
  if (!document) return <Tutorial />;
  const revisionId = document.head;
  const html = await findRevisionHtml(revisionId);
  if (html === null) return <Tutorial />;
  return <Tutorial>{htmr(html)}</Tutorial>;
};

export default page;
