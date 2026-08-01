import type { Metadata } from "next";
import DocumentBrowser from "@/components/DocumentBrowser";

export const metadata: Metadata = {
  title: "Browse Posts | Blog",
  description: "Browse and search through all your blog posts and content",
};

// Use the default export async function pattern
export default async function BrowsePage() {
  return <DocumentBrowser />;
}
