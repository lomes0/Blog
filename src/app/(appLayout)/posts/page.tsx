import { Metadata } from "next";
import PostsList from "@/components/PostsList";

export const metadata: Metadata = {
  title: "All Posts | Blog",
  description:
    "Browse all blog posts organized by publication date. Discover insights, tutorials, and thoughts shared over time.",
  keywords: ["blog posts", "articles", "tutorials", "insights", "archive"],
  openGraph: {
    title: "All Posts | Blog",
    description: "Browse all blog posts organized by publication date",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "All Posts | Blog",
    description: "Browse all blog posts organized by publication date",
  },
  alternates: {
    canonical: "/posts",
  },
};

/**
 * Posts page displaying all published blog posts organized by month
 * Features a modern, responsive design with excellent user experience
 */
const PostsPage = () => {
  return (
    <>
      {/* JSON-LD structured data for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "All Posts",
            description:
              "Collection of all blog posts organized by publication date",
            url: typeof window !== "undefined"
              ? window.location.href
              : "/posts",
            mainEntity: {
              "@type": "ItemList",
              name: "Blog Posts",
              description: "Chronologically organized blog posts",
            },
          }),
        }}
      />
      <PostsList />
    </>
  );
};

export default PostsPage;
