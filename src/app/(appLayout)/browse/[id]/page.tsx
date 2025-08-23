import type { Metadata } from "next";
import DocumentBrowser from "@/components/DocumentBrowser";

export const metadata: Metadata = {
  title: "Blog Posts | MathEditor",
  description: "Browse and manage your blog posts",
};

// Define the page component props
type Props = {
  params:
    | Promise<{
      id: string;
    }>
    | {
      id: string;
    };
};

// Make the component async and properly handle params
// Note: In blog structure, we redirect to main browse page since we don't have directories
export default async function DirectoryPage({ params }: Props) {
  // In blog structure, directory IDs are not used, show regular browser
  return <DocumentBrowser />;
}
