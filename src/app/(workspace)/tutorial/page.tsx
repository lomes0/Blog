import type { Metadata } from "next";
import Tutorial from "@/components/Tutorial";
import htmr from "htmr";
import { findRevisionHtml } from "@/app/api/utils";
import { findDocument } from "@/repositories/document";

export const metadata: Metadata = {
  title: "Tutorial",
  description: "Learn how to use Editor",
};

const page = async () => {
  const document = await findDocument("tutorial");
  if (!document) return <Tutorial />;
  const revisionId = document.head;
  const html = await findRevisionHtml(revisionId);
  if (html === null) return <Tutorial />;
  return <Tutorial>{htmr(html)}</Tutorial>;
};

export default page;
